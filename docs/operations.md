# Operations and troubleshooting

[Documentation](README.md) · [Getting started](getting-started.md) · [Usage guide](usage.md)

Run commands from the repository root. See [Configuration](configuration.md) for settings and paths.

## Back up the complete instance

A recoverable backup needs the database, runtime files, **original encryption key**,
deployment configuration, and custom skills. PostgreSQL contains task state and
settings; `data/` contains traffic bodies, workspaces, transcripts, and task archives.
Evidence bodies are unencrypted; protect backups as sensitive engagement data.

Key locations depend on how you run SuperArtex:

- **Compose:** host `keys/secret.key` and `keys/jwt.key`, mounted at `/app/keys`.
- **Native binary:** `secret.key` and `jwt.key` next to the executable by default;
  with `go run`, the default is the current working directory.
- **Overrides:** `SUPERARTEX_JWT_KEY_DIR` changes the directory for both files.
  `SUPERARTEX_SECRET_KEY` takes precedence over `secret.key`; save its exact value
  in your secret store if you use it. It must decode to 32 bytes (for example,
  a newly generated value from `openssl rand -base64 32`).

Do not generate a replacement encryption key during recovery. Startup refuses
encrypted data with a missing or incorrect key. Preserving `jwt.key` preserves
existing login tokens; it does not replace the encryption key.

### Docker Compose backup

[`scripts/backup.sh`](../scripts/backup.sh) always dumps the Compose `postgres`
service with `pg_dump`; it does not back up an arbitrary native PostgreSQL server.
It sources the repository `.env`, defaults the database/user to `superartex`,
writes timestamped gzip SQL dumps to `backups/`, and keeps the newest 14 dumps.
`--with-data` also archives the repository's `data/` directory and rotates those
archives to the same count. `--output-dir DIR` changes the output location;
relative paths are resolved from the repository root. **Keys, `.env`, `config.json`,
and `skills/` are not included by the script.**

For a matching database/files snapshot, stop the application, leaving PostgreSQL running:

```bash
umask 077
docker compose stop superartex
scripts/backup.sh --with-data --keep 14
tar -czf backups/superartex-deployment.tar.gz keys .env skills
docker compose start superartex
```

Save `config.json` separately if your deployment uses it. Copy the backup set to
protected storage outside this checkout. The deployment archive above is a fixed
filename; give each backup set its own directory or unique name to retain history.
If the data archive fails because container-written files are unreadable, rerun
with sufficient filesystem permissions and confirm it completes. The script
removes failed outputs; a successful database dump alone is not a full backup.

### Native backup

Stop the native process and use PostgreSQL client tools for the configured server.
Replace these connection values with your configuration; `pg_dump` can prompt for a password:

```bash
set -euo pipefail
umask 077
mkdir -p backups
pg_dump -h 127.0.0.1 -p 5432 -U superartex superartex | gzip > backups/superartex-db.sql.gz
gzip -t backups/superartex-db.sql.gz
```

Archive the actual `-data` directory, key directory, configuration, and custom
skills with permissions preserved, then restart. Defaults may be beside the binary.
Use unique backup filenames for rotation; the command above overwrites its output.

## Restore into an empty deployment

Use an empty database, not one already initialized by SuperArtex: the SQL dump
contains schema and rows. Keep the original backups and restore first with the
same source revision and PostgreSQL major version (Compose uses PostgreSQL 16).
Use the original database role/name or arrange the necessary roles and ownership.

For Compose, prepare a separate checkout/project with a fresh `pgdata` volume.
Copy the backup set into it and keep the application stopped. Restore deployment
files before startup (and `config.json` separately, if used). Do not run
`docker compose down -v` against the source deployment: that removes its database.

```bash
tar -xzf backups/superartex-deployment.tar.gz
docker compose up -d postgres
docker compose exec postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Wait until PostgreSQL accepts connections. Substitute actual backup names below:

```bash
set -euo pipefail
gunzip -c backups/superartex-db-TIMESTAMP.sql.gz | docker compose exec -T postgres sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
tar -xzf backups/superartex-data-TIMESTAMP.tar.gz
docker compose up -d --build superartex
docker compose logs --tail=100 superartex
```

The archive restores relative `data/`; check ownership and permissions before
startup. Restore `SUPERARTEX_SECRET_KEY` if used; it overrides the key file.

For native recovery, provision an empty database and restore with:

```bash
set -euo pipefail
gunzip -c backups/superartex-db.sql.gz | psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U superartex -d superartex
```

Restore the native data/key/configuration/skill paths before launching the saved
binary. Verify login, saved model settings, task history, and at least one captured
body or workspace file before using the recovered instance. A database-only
restore cannot recreate files that were not backed up.

## Update a deployment

Back up first, record the current commit, and review [CHANGELOG](../CHANGELOG.md).
Run `./update.sh`: it offers an optional `git pull --ff-only`, then a Docker or
native rebuild. A failed pull aborts the update; resolve the checkout before retrying.

- **Docker:** rebuilds and recreates `superartex` from this checkout. It preserves
  the PostgreSQL volume and `data/`, `keys/`, and `skills/` bind mounts.
- **Native:** builds `./superartex`; restart your running process yourself. With
  npm available it rebuilds and embeds the UI. Without npm it builds a backend
  only, requiring a separately served frontend.

Startup reapplies the base schema and runs pending numbered migrations. Reverting
only the binary is not a guaranteed rollback: keep matching pre-upgrade backups.

## Reverse proxy and live updates

Serve the frontend, `/api`, and SSE streams through the same origin on port 8787;
no separate `NEXT_PUBLIC_SSE_BASE` is required. Inside an HTTPS nginx server block:

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
}
```

Set `SUPERARTEX_TRUSTED_PROXIES` to the proxy peer addresses/CIDRs SuperArtex
actually sees. It controls client attribution for login rate limits; empty means
ignore forwarded headers. For host nginx beside a native binary, use
`127.0.0.1/32`. With host nginx forwarding into Docker, inspect the Compose network
to determine the gateway/peer address (`docker network ls`, then
`docker network inspect NETWORK`). Trust only proxies you control.

## Development

With PostgreSQL configured and dependencies installed (`cd web && npm ci`), run
`./dev.sh` to start the Go backend on `:8787`, recording proxy on
`127.0.0.1:8788`, and Next.js development server. Use the URL Next.js prints:
`npm run dev` defaults to port 3000 unless overridden; the script's 5173 message
is stale. The backend binds to all interfaces. Ctrl-C stops both child processes.

To run separately, use `go run ./cmd/superartex` and `npm --prefix web run dev`.
The dev frontend forwards `/api` to `http://localhost:8787`; set `AUTOPENTEST_API`
for another backend. To select a frontend port explicitly, use
`npm --prefix web run dev -- --port 5173`.

UI preview with fictional data and no backend/database:

```bash
NEXT_PUBLIC_MOCK=1 npm --prefix web run dev
```

Restart without that variable to return to live mode. Backend checks use
`go test ./...`; use an isolated test database when supplying database credentials.
Frontend checks include `npm --prefix web run check` and `npm --prefix web test`.

## Troubleshooting

- **First-run setup:** get the current token with `docker compose logs superartex`
  (look for `Setup token`) or the native process log. It changes on restart while
  no password exists, and becomes unusable after setup. Use `/login` once a
  password is set; the fixed username is `SUPERARTEX`.
- **Database/startup failure:** inspect `docker compose ps` and
  `docker compose logs --tail=100 postgres superartex`. Native startup logs show
  the selected config file; `SUPERARTEX_PG_DSN` overrides it. Check host, port,
  credentials, database access, and key availability. Changing `.env` does not
  change a password already stored in an initialized PostgreSQL volume.
- **UI works but updates freeze:** check the proxy's SSE buffering/cache/idle
  timeout and browser network errors. `curl -fsS http://127.0.0.1:8787/api/health`
  checks HTTP reachability only; it does not test database or LLM health.
