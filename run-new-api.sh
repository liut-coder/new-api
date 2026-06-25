#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/root/new-api-src
STATE_DIR=/root/new-api
ENV_FILE="$STATE_DIR/.env"

if [[ ! -r "$ENV_FILE" ]]; then
  echo "missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# Existing generated file only contains KEY=value entries.
source "$ENV_FILE"
set +a

mysql_ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' new-api-mysql 2>/dev/null || true)"
redis_ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' new-api-redis 2>/dev/null || true)"

if [[ -z "$mysql_ip" || -z "$redis_ip" ]]; then
  echo "new-api mysql/redis containers are not reachable" >&2
  exit 1
fi

export SQL_DSN="${MYSQL_USER}:${MYSQL_PASSWORD}@tcp(${mysql_ip}:3306)/${MYSQL_DATABASE}?charset=utf8mb4&parseTime=True&loc=Local"
export REDIS_CONN_STRING="redis://:${REDIS_PASSWORD}@${redis_ip}:6379"
export TZ="${TZ:-Asia/Shanghai}"

cd "$STATE_DIR/data"
exec "$APP_DIR/new-api" --port "${HOST_PORT:-8080}" --log-dir "$STATE_DIR/logs"
