#!/usr/bin/env bash
set -Eeuo pipefail

IMAGE="${1:-}"

PROD_CONTAINER="${NEW_API_PROD_CONTAINER:-new-api}"
CANARY_CONTAINER="${NEW_API_CANARY_CONTAINER:-new-api-canary}"
NETWORK="${NEW_API_DOCKER_NETWORK:-new-api_new-api-network}"
PROD_PORT="${NEW_API_PROD_PORT:-8081}"
CANARY_PORT="${NEW_API_CANARY_PORT:-18081}"
CONTAINER_PORT="${NEW_API_CONTAINER_PORT:-3000}"
DATA_DIR="${NEW_API_DATA_DIR:-/root/new-api/data}"
LOG_DIR="${NEW_API_LOG_DIR:-/root/new-api/logs}"
NGINX_CONFIG="${NEW_API_NGINX_CONFIG:-/etc/nginx/sites-available/api.misk.cc}"
NGINX_VERIFY_URL="${NEW_API_NGINX_VERIFY_URL:-http://127.0.0.1:8080/api/status}"
NGINX_VERIFY_HOST="${NEW_API_NGINX_VERIFY_HOST:-api.misk.cc}"
HEALTH_PATH="${NEW_API_HEALTH_PATH:-/api/status}"
OLD_CONTAINER_PREFIX="${NEW_API_OLD_CONTAINER_PREFIX:-new-api-old}"
REMOVE_OLD_ON_SUCCESS="${NEW_API_REMOVE_OLD_ON_SUCCESS:-false}"

ENV_FILE=""
NGINX_BACKUP=""

usage() {
  cat >&2 <<'EOF'
Usage:
  scripts/deploy-new-api-blue-green.sh <image>

Example:
  IMAGE="$(/root/build-new-api-api.sh main)"
  scripts/deploy-new-api-blue-green.sh "${IMAGE}"

This script deploys an already-built Docker image. It does not build locally.
EOF
}

die() {
  echo "error: $*" >&2
  exit 1
}

cleanup() {
  if [[ -n "${ENV_FILE}" ]]; then
    rm -f "${ENV_FILE}"
  fi
}
trap cleanup EXIT

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

health_ok() {
  local url="$1"
  curl -fsS "${url}" | grep -Eq '"success"[[:space:]]*:[[:space:]]*true'
}

wait_for_health() {
  local name="$1"
  local url="$2"
  local tries="${3:-30}"

  for _ in $(seq 1 "${tries}"); do
    if health_ok "${url}"; then
      echo "${name} health ok: ${url}"
      return 0
    fi
    if ! docker ps --format '{{.Names}}' | grep -qx "${name}"; then
      echo "${name} exited; logs:" >&2
      docker logs --tail 160 "${name}" >&2 || true
      return 1
    fi
    sleep 2
  done

  echo "${name} health timeout; logs:" >&2
  docker logs --tail 160 "${name}" >&2 || true
  return 1
}

verify_nginx() {
  curl -fsS -H "Host: ${NGINX_VERIFY_HOST}" "${NGINX_VERIFY_URL}" |
    grep -Eq '"success"[[:space:]]*:[[:space:]]*true'
}

switch_nginx_port() {
  local from_port="$1"
  local to_port="$2"

  if ! grep -q "127.0.0.1:${from_port}" "${NGINX_CONFIG}"; then
    if grep -q "127.0.0.1:${to_port}" "${NGINX_CONFIG}"; then
      echo "nginx already points to ${to_port}"
    else
      die "nginx config has neither ${from_port} nor ${to_port}: ${NGINX_CONFIG}"
    fi
  else
    perl -0pi -e "s#http://127\\.0\\.0\\.1:${from_port}#http://127.0.0.1:${to_port}#g" "${NGINX_CONFIG}"
  fi

  nginx -t
  systemctl reload nginx
}

run_app_container() {
  local name="$1"
  local port="$2"
  local restart_policy="$3"

  docker run -d \
    --name "${name}" \
    --restart "${restart_policy}" \
    --network "${NETWORK}" \
    -p "127.0.0.1:${port}:${CONTAINER_PORT}" \
    --env-file "${ENV_FILE}" \
    -v "${DATA_DIR}:/data" \
    -v "${LOG_DIR}:/app/logs" \
    "${IMAGE}" \
    --port "${CONTAINER_PORT}" --log-dir /app/logs
}

if [[ -z "${IMAGE}" ]]; then
  usage
  exit 2
fi

require_cmd curl
require_cmd docker
require_cmd grep
require_cmd nginx
require_cmd perl
require_cmd systemctl

docker inspect "${PROD_CONTAINER}" >/dev/null 2>&1 ||
  die "production container not found: ${PROD_CONTAINER}"
docker network inspect "${NETWORK}" >/dev/null 2>&1 ||
  die "docker network not found: ${NETWORK}"
[[ -f "${NGINX_CONFIG}" ]] || die "nginx config not found: ${NGINX_CONFIG}"
[[ -d "${DATA_DIR}" ]] || die "data dir not found: ${DATA_DIR}"
[[ -d "${LOG_DIR}" ]] || die "log dir not found: ${LOG_DIR}"

ENV_FILE="$(mktemp /tmp/new-api-env.XXXXXX)"
chmod 600 "${ENV_FILE}"
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "${PROD_CONTAINER}" >"${ENV_FILE}"

echo "pulling image: ${IMAGE}"
docker pull "${IMAGE}"

echo "starting canary: ${CANARY_CONTAINER} on 127.0.0.1:${CANARY_PORT}"
docker rm -f "${CANARY_CONTAINER}" >/dev/null 2>&1 || true
run_app_container "${CANARY_CONTAINER}" "${CANARY_PORT}" "no"
wait_for_health "${CANARY_CONTAINER}" "http://127.0.0.1:${CANARY_PORT}${HEALTH_PATH}"

NGINX_BACKUP="${NGINX_CONFIG}.bak.before-blue-green-$(date +%Y%m%d%H%M%S)"
cp "${NGINX_CONFIG}" "${NGINX_BACKUP}"
echo "nginx backup: ${NGINX_BACKUP}"

echo "switching nginx to canary port ${CANARY_PORT}"
switch_nginx_port "${PROD_PORT}" "${CANARY_PORT}"
verify_nginx || die "nginx verification failed after switching to canary"

OLD_CONTAINER="${OLD_CONTAINER_PREFIX}-$(date +%Y%m%d%H%M%S)"
echo "replacing production container; old container will be ${OLD_CONTAINER}"
docker stop --time 10 "${PROD_CONTAINER}" >/dev/null
docker rename "${PROD_CONTAINER}" "${OLD_CONTAINER}"
run_app_container "${PROD_CONTAINER}" "${PROD_PORT}" "always"
wait_for_health "${PROD_CONTAINER}" "http://127.0.0.1:${PROD_PORT}${HEALTH_PATH}"

echo "switching nginx back to production port ${PROD_PORT}"
switch_nginx_port "${CANARY_PORT}" "${PROD_PORT}"
verify_nginx || die "nginx verification failed after switching back to production"

echo "removing canary"
docker rm -f "${CANARY_CONTAINER}" >/dev/null 2>&1 || true

if [[ "${REMOVE_OLD_ON_SUCCESS}" == "true" ]]; then
  echo "removing old container: ${OLD_CONTAINER}"
  docker rm -f "${OLD_CONTAINER}" >/dev/null 2>&1 || true
else
  echo "old container kept for rollback: ${OLD_CONTAINER}"
fi

echo "deployed image: ${IMAGE}"
