#!/usr/bin/env bash
# SUPERARTEX cross-platform release builder.
#
# The default mode builds one target and embeds the already-exported frontend.
# `./build.sh --release` builds and packages all supported desktop/server targets.
#
# Environment variables:
#   SUPERARTEX_TARGET_OS=linux             One target OS in single-target mode.
#   SUPERARTEX_TARGET_ARCH=amd64           One target arch in single-target mode.
#   SUPERARTEX_TARGETS=linux/amd64,...     Comma-separated targets for multi-target mode.
#   SUPERARTEX_BUILD_VERSION=vX.Y.Z        Version embedded in the binary and archive name.
#   SUPERARTEX_OUTPUT=/path/to/artex       Explicit binary path in single-target mode.
#   SUPERARTEX_OUTPUT_DIR=dist             Directory for default binary paths.
#   SUPERARTEX_PACKAGE=1                   Create a zip archive for each target.
#   SUPERARTEX_PACKAGE_DIR=dist            Directory for release archives.
#   SUPERARTEX_COMPRESS=off                UPX mode: off, auto, or required.
#   SUPERARTEX_UPX_ARGS="--best --lzma"    Arguments passed to UPX.
#   SUPERARTEX_SKIP_FRONTEND=1             Reuse server/webui/dist (for CI artifact builds).
#   SUPERARTEX_SKIP_NPM_CI=1               Skip npm ci while rebuilding the frontend.
#   SUPERARTEX_GOSUMDB=sum.golang.org      Go checksum database.
set -euo pipefail

cd "$(cd "$(dirname "$0")" && pwd)"

info() { printf '\033[36m[*]\033[0m %s\n' "$*"; }
ok() { printf '\033[32m[+]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[!]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage:
  ./build.sh                         Build for the current OS and architecture
  ./build.sh --target linux/amd64   Build one specific target
  ./build.sh --release               Build and package all supported targets

Options:
  --release              Build the amd64/arm64 targets for Linux, macOS, and Windows, and generate zips
  --target OS/ARCH       Set a single target, e.g. windows/amd64
  --upx                  Force UPX compression of the binary (may affect compatibility on some Linux environments)
  --no-compress          No UPX; use only Go linker trimming and zip compression
  --help                 Show this help

The multi-target list can be overridden via SUPERARTEX_TARGETS, e.g.:
  SUPERARTEX_TARGETS=linux/amd64,windows/amd64 ./build.sh --release
EOF
}

RELEASE_TARGETS_DEFAULT="linux/amd64,linux/arm64,darwin/amd64,darwin/arm64,windows/amd64"
SUPERARTEX_RELEASE="${SUPERARTEX_RELEASE:-0}"
SUPERARTEX_COMPRESS="${SUPERARTEX_COMPRESS:-off}"
SUPERARTEX_PACKAGE="${SUPERARTEX_PACKAGE:-0}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --release)
      SUPERARTEX_RELEASE=1
      SUPERARTEX_PACKAGE=1
      shift
      ;;
    --target)
      [ "$#" -ge 2 ] || die "--target requires an OS/ARCH argument"
      target_arg="$2"
      case "$target_arg" in
        */*)
          SUPERARTEX_TARGET_OS="${target_arg%%/*}"
          SUPERARTEX_TARGET_ARCH="${target_arg##*/}"
          SUPERARTEX_TARGETS="$target_arg"
          ;;
        *) die "target must be OS/ARCH, e.g. linux/amd64" ;;
      esac
      shift 2
      ;;
    --no-compress)
      SUPERARTEX_COMPRESS=0
      shift
      ;;
    --upx)
      SUPERARTEX_COMPRESS=required
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *) die "unknown argument: $1 (use --help for usage)" ;;
  esac
done

command -v go >/dev/null 2>&1 || die "Go not detected (the project requires Go 1.26 or newer)"

SUPERARTEX_GOSUMDB="${SUPERARTEX_GOSUMDB:-sum.golang.org}"
if [ -z "${SUPERARTEX_BUILD_VERSION:-}" ]; then
  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    SUPERARTEX_BUILD_VERSION="$(git describe --tags --always --dirty)"
  else
    SUPERARTEX_BUILD_VERSION="dev"
  fi
fi
# Release tags are commonly passed with a v prefix; keep the binary version consistent.
SUPERARTEX_BUILD_VERSION="${SUPERARTEX_BUILD_VERSION#v}"
SUPERARTEX_OUTPUT_DIR="${SUPERARTEX_OUTPUT_DIR:-dist}"
SUPERARTEX_PACKAGE_DIR="${SUPERARTEX_PACKAGE_DIR:-$SUPERARTEX_OUTPUT_DIR}"
SUPERARTEX_UPX_ARGS="${SUPERARTEX_UPX_ARGS:---best --lzma}"

if [ "${SUPERARTEX_RELEASE}" = "1" ]; then
  SUPERARTEX_TARGETS="${SUPERARTEX_TARGETS:-$RELEASE_TARGETS_DEFAULT}"
else
  SUPERARTEX_TARGET_OS="${SUPERARTEX_TARGET_OS:-$(GOSUMDB="$SUPERARTEX_GOSUMDB" go env GOOS)}"
  SUPERARTEX_TARGET_ARCH="${SUPERARTEX_TARGET_ARCH:-$(GOSUMDB="$SUPERARTEX_GOSUMDB" go env GOARCH)}"
  SUPERARTEX_TARGETS="${SUPERARTEX_TARGETS:-${SUPERARTEX_TARGET_OS}/${SUPERARTEX_TARGET_ARCH}}"
fi

if [ "${SUPERARTEX_SKIP_FRONTEND:-0}" = "1" ]; then
  [ -d server/webui/dist ] || die "SUPERARTEX_SKIP_FRONTEND=1 but server/webui/dist does not exist"
else
  command -v npm >/dev/null 2>&1 || die "npm not detected (building the frontend static assets requires Node.js/npm)"
  command -v rsync >/dev/null 2>&1 || die "rsync not detected"
  info "Building frontend static assets"
  if [ "${SUPERARTEX_SKIP_NPM_CI:-0}" != "1" ]; then
    (cd web && npm ci)
  fi
  (cd web && npm run build:static)
  info "Syncing frontend assets to server/webui/dist"
  mkdir -p server/webui/dist
  rsync -a --delete web/out/ server/webui/dist/
fi

compress_binary() {
  binary="$1"
  goos="$2"
  case "$SUPERARTEX_COMPRESS" in
    0|off|false|none)
      info "Skipping UPX: $binary"
      return 0
      ;;
    auto|required|true|1) ;;
    *) die "SUPERARTEX_COMPRESS must be off, auto, or required" ;;
  esac

  if ! command -v upx >/dev/null 2>&1; then
    if [ "$SUPERARTEX_COMPRESS" = "required" ]; then
      die "SUPERARTEX_COMPRESS=required but upx was not detected"
    fi
    warn "upx not detected; keeping the linker-compressed result: $binary"
    return 0
  fi

  before=$(wc -c < "$binary" | tr -d ' ')
  upx_args="$SUPERARTEX_UPX_ARGS"
  [ "$goos" = "darwin" ] && upx_args="$upx_args --force-macos"
  # shellcheck disable=SC2086
  if ! upx $upx_args -- "$binary"; then
    if [ "$SUPERARTEX_COMPRESS" = "required" ]; then
      die "UPX compression failed: $binary"
    fi
    warn "UPX does not support this target format; keeping the uncompressed binary: $binary"
    return 0
  fi
  after=$(wc -c < "$binary" | tr -d ' ')
  ok "UPX compression done: $binary (${before} -> ${after} bytes)"
}

package_binary() {
  binary="$1"
  goos="$2"
  goarch="$3"
  package_name="superartex-${SUPERARTEX_BUILD_VERSION}-${goos}-${goarch}"
  package_root="${SUPERARTEX_PACKAGE_DIR}/${package_name}"
  archive="${SUPERARTEX_PACKAGE_DIR}/${package_name}.zip"

  command -v zip >/dev/null 2>&1 || die "packaging requires zip"
  rm -rf "$package_root" "$archive"
  mkdir -p "$package_root"
  cp "$binary" "$package_root/"
  # The guardian start script is the official entry point: the page's one-click
  # update relies on it to relaunch the process after it exits; running the superartex
  # binary directly means it never comes back up after an update. Ship only the one
  # matching the target OS.
  if [ "$goos" = "windows" ]; then
    cp start.bat "$package_root/"
  else
    cp start.sh "$package_root/"
    chmod +x "$package_root/start.sh"
  fi
  cp -R skills "$package_root/"
  cp config.example.json "$package_root/"
  if [ -f README.md ]; then cp README.md "$package_root/"; fi
  (cd "$SUPERARTEX_PACKAGE_DIR" && zip -q -r -9 "$(basename "$archive")" "$(basename "$package_root")")
  rm -rf "$package_root"
  ok "Release archive: $archive"
}

build_target() {
  target="$1"
  case "$target" in
    */*) ;;
    *) die "invalid target: $target (must be OS/ARCH)" ;;
  esac
  goos="${target%%/*}"
  goarch="${target##*/}"
  case "$goos" in
    linux|darwin|windows) ;;
    *) die "unsupported OS: $goos (supported: linux, darwin, windows)" ;;
  esac

  binary_name="superartex"
  [ "$goos" = "windows" ] && binary_name="superartex.exe"
  if [ -n "${SUPERARTEX_OUTPUT:-}" ] && [ "$SUPERARTEX_RELEASE" != "1" ]; then
    output="$SUPERARTEX_OUTPUT"
  else
    output="${SUPERARTEX_OUTPUT_DIR}/superartex-${goos}-${goarch}/${binary_name}"
  fi
  mkdir -p "$(dirname "$output")"

  info "Compiling ${goos}/${goarch}, version ${SUPERARTEX_BUILD_VERSION}"
  GOSUMDB="$SUPERARTEX_GOSUMDB" \
  CGO_ENABLED=0 \
  GOOS="$goos" \
  GOARCH="$goarch" \
  go build \
    -tags embedui \
    -trimpath \
    -ldflags "-s -w -buildid= -X main.version=${SUPERARTEX_BUILD_VERSION}" \
    -o "$output" \
    ./cmd/superartex

  compress_binary "$output" "$goos"
  if command -v file >/dev/null 2>&1; then file "$output"; fi
  if [ "$SUPERARTEX_PACKAGE" = "1" ]; then package_binary "$output" "$goos" "$goarch"; fi
  ok "Build complete: $output"
}

write_checksums() {
  [ "$SUPERARTEX_PACKAGE" = "1" ] || return 0
  checksum_file="$SUPERARTEX_PACKAGE_DIR/SHA256SUMS"
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$SUPERARTEX_PACKAGE_DIR" && for archive in *.zip; do sha256sum "$archive"; done > "$(basename "$checksum_file")")
  elif command -v shasum >/dev/null 2>&1; then
    (cd "$SUPERARTEX_PACKAGE_DIR" && for archive in *.zip; do shasum -a 256 "$archive"; done > "$(basename "$checksum_file")")
  else
    warn "Neither sha256sum nor shasum detected; skipping SHA256SUMS"
    return 0
  fi
  ok "Checksum file: $checksum_file"
}

mkdir -p "$SUPERARTEX_OUTPUT_DIR"
if [ "$SUPERARTEX_PACKAGE" = "1" ]; then mkdir -p "$SUPERARTEX_PACKAGE_DIR"; fi

old_ifs="$IFS"
IFS=','
read -r -a targets <<< "$SUPERARTEX_TARGETS"
IFS="$old_ifs"
[ "${#targets[@]}" -gt 0 ] || die "SUPERARTEX_TARGETS must not be empty"
for target in "${targets[@]}"; do
  target="${target//[[:space:]]/}"
  [ -n "$target" ] || continue
  build_target "$target"
done

if [ "$SUPERARTEX_PACKAGE" = "1" ]; then
  write_checksums
  info "Release packages generated in: $SUPERARTEX_PACKAGE_DIR"
fi
