#!/usr/bin/env bash
set -euo pipefail

if [[ -f /etc/new-api/dc-oauth.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/new-api/dc-oauth.env
  set +a
fi

cd /opt/newapi-dc-oauth
exec node server.js
