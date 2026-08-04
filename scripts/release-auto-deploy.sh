#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-BillyVu/tool-report-qc}"
APP_DIR="${APP_DIR:-/opt/tool-report-qc}"
STATE_DIR="${STATE_DIR:-/var/lib/tool-report-qc}"
STATE_FILE="${STATE_FILE:-${STATE_DIR}/deployed-release-tag}"
LOCK_FILE="${LOCK_FILE:-/tmp/tool-report-qc-release-updater.lock}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-tool-report-qc}"
INTERNAL_HEALTH_URL="${INTERNAL_HEALTH_URL:-http://127.0.0.1:3020/api/health}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://qc.apexdev.website/api/health}"
POLL_ONLY="${POLL_ONLY:-false}"
INCLUDE_PRERELEASE="${INCLUDE_PRERELEASE:-true}"

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*" >&2
}

fail() {
  log "ERROR: $*"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

github_header_args=(
  -H "Accept: application/vnd.github+json"
  -H "X-GitHub-Api-Version: 2022-11-28"
)

if [ -n "${GITHUB_TOKEN:-}" ]; then
  github_header_args+=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi

parse_json_field() {
  local field="$1"
  python3 -c '
import json
import sys
field = sys.argv[1]
payload = json.load(sys.stdin)
value = payload.get(field) or ""
print(value)
' "$field"
}

download_latest_release_metadata() {
  local api_url="https://api.github.com/repos/${REPO}/releases"
  local response_file status

  response_file="$(mktemp /tmp/tool-report-qc-release-api.XXXXXX)"
  status="$(curl --silent --show-error --location \
    --write-out '%{http_code}' \
    --output "$response_file" \
    "${github_header_args[@]}" \
    "$api_url")"

  if [ "$status" = "404" ]; then
    log "No accessible releases for ${REPO}. Create a GitHub Release or set GITHUB_TOKEN if the repo is private."
    rm -f "$response_file"
    return 10
  fi

  case "$status" in
    2*)
      python3 -c '
import json
import os
import sys

include_prerelease = os.environ.get("INCLUDE_PRERELEASE", "true").lower() == "true"
releases = json.load(open(sys.argv[1]))

if not isinstance(releases, list):
    print(json.dumps(releases))
    sys.exit(0)

for release in releases:
    if release.get("draft"):
        continue
    if release.get("prerelease") and not include_prerelease:
        continue
    print(json.dumps(release))
    sys.exit(0)

sys.exit(10)
' "$response_file"
      ;;
    *) cat "$response_file" >&2; rm -f "$response_file"; fail "GitHub Releases API returned HTTP ${status}" ;;
  esac

  rm -f "$response_file"
}

download_release_source() {
  local tarball_url="$1"
  local output="$2"
  curl --fail --silent --show-error --location "${github_header_args[@]}" "$tarball_url" -o "$output"
}

deploy_release_archive() {
  local tag="$1"
  local tarball="$2"
  local work_dir backup archive_dir

  work_dir="$(mktemp -d /tmp/tool-report-qc-release-${tag//\//-}.XXXXXX)"
  archive_dir="${work_dir}/source"
  backup="/tmp/tool-report-qc-pre-release-${tag//\//-}-$(date +%Y%m%d%H%M%S).tgz"
  mkdir -p "$archive_dir"

  tar -xzf "$tarball" -C "$archive_dir" --strip-components=1
  test -f "${archive_dir}/Dockerfile" || fail "Release ${tag} has no Dockerfile"
  test -f "${archive_dir}/docker-compose.yml" || fail "Release ${tag} has no docker-compose.yml"
  test -f "${archive_dir}/package.json" || fail "Release ${tag} has no package.json"
  test -d "${archive_dir}/server" || fail "Release ${tag} has no server directory"

  mkdir -p /srv/tool-report-qc/uploads
  mkdir -p /srv/tool-report-qc/templates
  mkdir -p "$APP_DIR"
  test -f "${APP_DIR}/.env" || fail "${APP_DIR}/.env is required before deploy"

  log "Backing up current source to ${backup}"
  (
    cd "$APP_DIR"
    tar -czf "$backup" --exclude=.env .
  )
  chmod 600 "$backup"

  log "Installing release ${tag} into ${APP_DIR}"
  find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name .env -exec rm -rf {} +
  tar -xzf "$tarball" -C "$APP_DIR" --strip-components=1

  (
    cd "$APP_DIR"
    docker compose -p "$COMPOSE_PROJECT" config >/tmp/tool-report-qc-compose-check.yml
    docker compose -p "$COMPOSE_PROJECT" up -d --build

    for i in $(seq 1 30); do
      if curl --fail "$INTERNAL_HEALTH_URL"; then
        echo
        break
      fi
      if [ "$i" = 30 ]; then
        fail "Internal health check failed after release ${tag}"
      fi
      sleep 2
    done

    curl --fail --silent --show-error "$PUBLIC_HEALTH_URL"
    echo
    docker compose -p "$COMPOSE_PROJECT" ps
    docker compose -p "$COMPOSE_PROJECT" exec -T qc-rabbitmq rabbitmqctl list_queues name messages consumers
  )

  mkdir -p "$STATE_DIR"
  printf '%s\n' "$tag" > "$STATE_FILE"
  log "Release ${tag} deployed successfully. Rollback archive: ${backup}"
}

main() {
  require_cmd curl
  require_cmd python3
  require_cmd tar
  require_cmd docker

  mkdir -p "$STATE_DIR"

  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    log "Another release updater is already running"
    exit 0
  fi

  log "Checking latest GitHub release for ${REPO}"
  set +e
  metadata="$(download_latest_release_metadata)"
  metadata_status="$?"
  set -e
  if [ "$metadata_status" = "10" ]; then
    exit 0
  fi
  if [ "$metadata_status" != "0" ]; then
    fail "Could not download GitHub release metadata"
  fi
  latest_tag="$(printf '%s' "$metadata" | parse_json_field tag_name)"
  tarball_url="$(printf '%s' "$metadata" | parse_json_field tarball_url)"

  [ -n "$latest_tag" ] || fail "GitHub release metadata did not include tag_name"
  [ -n "$tarball_url" ] || fail "GitHub release metadata did not include tarball_url"

  current_tag=""
  if [ -f "$STATE_FILE" ]; then
    current_tag="$(tr -d '[:space:]' < "$STATE_FILE")"
  fi

  if [ "$latest_tag" = "$current_tag" ]; then
    log "No new release. Current deployed tag is ${current_tag}"
    exit 0
  fi

  log "New release detected: ${latest_tag} (current: ${current_tag:-none})"
  if [ "$POLL_ONLY" = "true" ]; then
    exit 0
  fi

  tarball="/tmp/tool-report-qc-${latest_tag//\//-}.tgz"
  download_release_source "$tarball_url" "$tarball"
  deploy_release_archive "$latest_tag" "$tarball"
}

main "$@"
