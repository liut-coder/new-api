#!/usr/bin/env bash
set -Eeuo pipefail

REF="${1:-main}"
TOKEN="${BUILD_CENTER_TRIGGER_TOKEN:-}"
TOKEN_FILE="${BUILD_CENTER_TRIGGER_TOKEN_FILE:-/root/.config/build-center/new-api.env}"

if [[ -z "${TOKEN}" && -r "${TOKEN_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${TOKEN_FILE}"
  TOKEN="${BUILD_CENTER_TRIGGER_TOKEN:-}"
fi

if [[ -z "${TOKEN}" ]]; then
  echo "missing BUILD_CENTER_TRIGGER_TOKEN" >&2
  echo "set BUILD_CENTER_TRIGGER_TOKEN or create ${TOKEN_FILE} with root-only permissions" >&2
  exit 2
fi

if [[ ! "${REF}" =~ ^[A-Za-z0-9._/@:-]+$ ]]; then
  echo "invalid ref: ${REF}" >&2
  exit 2
fi

curl -fsS -X POST https://registry.misk.cc/api/builds/new-api \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"ref\":\"${REF}\"}"

echo
