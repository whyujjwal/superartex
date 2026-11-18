# Configuration

[Documentation](README.md) · [Getting started](getting-started.md) · [Usage](usage.md) · [Operations](operations.md)

SuperArtex uses a small startup configuration file, exported environment variables, command-line flags, and settings saved through the UI. They control different parts of the application; there is no single global precedence order.

## Configuration sources and precedence

- **Database:** `SUPERARTEX_PG_DSN` → `database.dsn` in the configuration file → the file's database component fields. Startup fails if none supplies a connection.
- **Listeners and data directory:** the `-addr`, `-proxy`, and `-data` flags override their built-in defaults.

The configuration file supports only `database` and `skill_dir`. Settings managed through the UI are stored in PostgreSQL.

The file path resolves in this order: `SUPERARTEX_CONFIG`, an existing `config.json` in the current working directory, then one beside the executable. An explicitly selected missing file is treated as absent; an unreadable or invalid file is an error when loaded.

**Compose's `.env` is not a native application configuration file.** Docker Compose reads it and passes the variables listed under the service's `environment` section. For a native process, export variables in its shell or service definition. Additional application variables must also be forwarded in Compose if they are not already listed in `docker-compose.yml`.

## PostgreSQL

Copy [`config.example.json`](../config.example.json) to `config.json` for native runs, then update it for your database. A minimal component configuration is:

```json
{
  "database": {
    "host": "127.0.0.1",
    "port": 5432,
    "user": "superartex",
    "password": "replace-this",
    "dbname": "superartex",
    "sslmode": "disable"
  }
}
```

The checked-in example deliberately shows `5433`; this is an example port, while omitted/zero `port` defaults to `5432`. With component fields, omitted `host` defaults to `127.0.0.1` and omitted `sslmode` to `disable`. Use the SSL mode required by your database deployment.

For a full connection string, set only `database.dsn`, or export:

```bash
export SUPERARTEX_PG_DSN='postgres://superartex:replace-this@127.0.0.1:5432/superartex?sslmode=disable'
```

A nonempty `database.dsn` ignores the component fields; `SUPERARTEX_PG_DSN` overrides both. Percent-encode credentials containing URI-reserved characters in a URI DSN. Component fields perform that encoding for you.

Compose builds its DSN from `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`, connecting to service `postgres:5432`. Because it interpolates the password directly into the URI, use a URI-safe password such as `openssl rand -hex 24`. PostgreSQL is not published to the host by the default Compose file.

## Listeners, files, and keys

Native defaults are UI/API `127.0.0.1:8787`, recording proxy `127.0.0.1:8788`, and runtime files in `data/` beside the executable. Override them with:

```bash
./start.sh -addr 127.0.0.1:9000 -proxy 127.0.0.1:9001 -data /path/to/runtime-data
```

Use `-proxy ''` to disable the recording proxy. With `go run`, the current directory anchors runtime paths instead of the temporary executable directory.

The Docker image binds both listeners on all container interfaces, while Compose publishes the UI and proxy to host loopback. `SUPERARTEX_BIND_ADDR=0.0.0.0` changes the **Compose UI port publication**; it does not change native bind addresses or the proxy's host publication. After editing `.env`, run `docker compose up -d` to recreate services with the new environment.

`SUPERARTEX_JWT_KEY_DIR` chooses the signing/encryption key directory; native runs default to the executable directory, and Compose uses `./keys`. `SUPERARTEX_SECRET_KEY` can supply a 32-byte encryption key in base64 or hex instead of the generated `secret.key` file. Keep the effective encryption key with your backups. See [operations](operations.md) for persistence, recovery, and reverse-proxy settings, including `SUPERARTEX_TRUSTED_PROXIES`.

For the full Compose variable template, see [`.env.example`](../.env.example). For updates, logs, development commands, and recovery, continue to [operations](operations.md).
