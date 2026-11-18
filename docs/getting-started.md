# Getting started

[Documentation](README.md) · [Usage](usage.md) · [Configuration](configuration.md) · [Operations](operations.md)

This guide takes a fresh checkout to a signed-in instance.

## Prerequisites

For Docker Compose, install Git and Docker with the Compose v2 plugin, and start the Docker daemon. Compose builds the application from this checkout and runs PostgreSQL 16 alongside it; no local Go or Node installation is required. The first build also downloads the image's security tools and browsers, so allow time and network access for those downloads.

## Start with Docker Compose

```bash
git clone https://github.com/whyujjwal/superartex.git
cd superartex
cp .env.example .env
```

Edit `.env` and replace `POSTGRES_PASSWORD=change-me-please`. A generated hexadecimal password works without URI escaping:

```bash
openssl rand -hex 24
```

Paste the result into `POSTGRES_PASSWORD`. Compose inserts this value directly into the PostgreSQL connection URI, so use a URI-safe password such as the generated hex string; reserved characters such as `@`, `:`, `/`, `?`, `#`, or `%` need special handling.

```bash
docker compose up -d --build
docker compose logs -f superartex
```

The local image is named `superartex:local`. Open [http://localhost:8787](http://localhost:8787). Compose publishes the UI/API on `127.0.0.1:8787` and the recording proxy on `127.0.0.1:8788`; PostgreSQL stays inside the Compose network.

Compose persists database records in the `pgdata` volume, runtime files in `./data`, and signing/encryption keys in `./keys`. Keep these locations when updating; see [operations](operations.md) for backups.

## Claim the instance and sign in

On the first startup, find this line in the application log:

```text
[auth] no admin password is set. Setup token for the /setup page: <token>
```

Open [http://localhost:8787/setup](http://localhost:8787/setup), paste the token, and set a password of at least 12 characters (at most 72 bytes). Setup signs you in. Subsequent logins use the fixed username **`SUPERARTEX`** and the password you chose.

The setup token is generated at startup while no password is set. If you restart before completing setup, use the token from the current process's log. After setup, the instance no longer accepts a setup token.

## Check the service

```bash
curl -fsS http://localhost:8787/api/health
```

An unauthenticated request returns `{"ok":true}`. This confirms that the HTTP service responds. If startup fails, inspect `docker compose logs superartex postgres`.

Continue with [operations](operations.md) for backups or [reviewing results](usage.md) for the workspace.

## Other installation options

### Build and run natively

Use this route when you want the application to run directly on the host. You need:

- A PostgreSQL instance and a database/user for SuperArtex. PostgreSQL 16 matches Compose.
- **Go 1.26.10 or newer**, as declared in `go.mod`.
- **Node.js 22 and npm**, matching the Docker build, plus Bash and `rsync` for `build.sh`.

From the repository root, prepare the database configuration:

```bash
cp config.example.json config.json
```

Edit `config.json` to match your database. The example uses **port 5433**; change it to `5432` if your PostgreSQL listens on the usual port.

Then build an executable beside the startup script:

```bash
SUPERARTEX_OUTPUT=./superartex ./build.sh
./start.sh
```

`build.sh` runs `npm ci` and `npm run build:static` in `web/`, syncs `web/out/` into `server/webui/dist/`, and builds `./cmd/superartex` with `-tags embedui`. The result serves the UI without a Node runtime. `SUPERARTEX_OUTPUT=./superartex` is needed here because the script's default output is `dist/superartex-<os>-<arch>/superartex` (`superartex.exe` on Windows).

`start.sh` expects the executable next to it, forwards stop signals, and restarts after abnormal exits. The native UI and proxy bind to loopback by default. Complete the same account setup above, reading the token from your terminal.

The binary reads exported environment variables; it does not load Compose's `.env` file. See [configuration](configuration.md) for database precedence, file paths, and flags.

For a cross-platform build or packaged archives:

```bash
./build.sh --target linux/arm64
./build.sh --release
```

`--release` builds Linux and macOS for amd64/arm64 and Windows for amd64, then creates ZIP archives and checksums in `dist/`. Packaging also requires `zip`. Each archive includes the matching `start.sh` or `start.bat`, skills, and the example configuration; configure PostgreSQL before starting it.

### Interactive installer alternative

Run `./install.sh` from the checkout to choose Docker Compose or a local build. It can prepare `.env` for Docker, or prompt for PostgreSQL connection details and write `config.json` for a native run. It reuses an existing `.env` and may overwrite `config.json` in native mode.

The local installer needs npm to embed the UI; without npm it builds only the backend. Prefer the source-build steps above for a complete native instance. On Linux, the Docker path offers to install Docker if it is missing; on macOS, install Docker Desktop first.

Next: [Operations and troubleshooting](operations.md).
