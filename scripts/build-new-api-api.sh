#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${BUILD_CENTER_BASE_URL:-https://registry.misk.cc}"
PROJECT="${BUILD_CENTER_PROJECT:-new-api}"
REF="${1:-main}"
TOKEN="${BUILD_CENTER_TRIGGER_TOKEN:-}"
TOKEN_FILE="${BUILD_CENTER_TRIGGER_TOKEN_FILE:-/root/.config/build-center/new-api.env}"
LOG_TAIL_BYTES="${BUILD_CENTER_LOG_TAIL_BYTES:-12000}"
POLL_INTERVAL="${BUILD_CENTER_POLL_INTERVAL:-5}"
MAX_POLLS="${BUILD_CENTER_MAX_POLLS:-0}"

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

if ! command -v jq >/dev/null 2>&1; then
  echo "missing jq" >&2
  exit 2
fi

AUTH=(-H "Authorization: Bearer ${TOKEN}")
TMP="$(mktemp)"
cleanup() {
  rm -f "${TMP}"
}
trap cleanup EXIT

code="$(
  curl -sS -o "${TMP}" -w "%{http_code}" -X POST "${BASE_URL}/api/builds/${PROJECT}" \
    "${AUTH[@]}" \
    -H "Content-Type: application/json" \
    -d "{\"ref\":\"${REF}\"}"
)"
body="$(cat "${TMP}")"

request_id=""
if [[ "${code}" == "200" || "${code}" == "202" ]]; then
  request_id="$(jq -r '.request_id // empty' <<<"${body}")"
elif [[ "${code}" == "409" ]]; then
  request_id="$(jq -r '.error.request_id // empty' <<<"${body}")"
  echo "已有构建正在运行，继续跟踪：${request_id}" >&2
else
  echo "触发构建失败 HTTP ${code}" >&2
  echo "${body}" >&2
  exit 1
fi

if [[ -z "${request_id}" || "${request_id}" == "null" ]]; then
  echo "没有拿到 request_id" >&2
  echo "${body}" >&2
  exit 1
fi

poll_count=0
while true; do
  poll_count=$((poll_count + 1))
  status_json="$(
    curl -fsS "${BASE_URL}/api/builds/${PROJECT}/${request_id}" "${AUTH[@]}"
  )"

  status="$(jq -r '.status // empty' <<<"${status_json}")"
  phase="$(jq -r '.phase // empty' <<<"${status_json}")"
  build_id="$(jq -r '.build_id // ""' <<<"${status_json}")"
  image="$(jq -r '.image // ""' <<<"${status_json}")"

  echo "status=${status} phase=${phase} build_id=${build_id} image=${image}" >&2

  if [[ "${status}" == "success" ]]; then
    if [[ -z "${image}" || "${image}" == "null" ]]; then
      echo "构建成功但没有返回 image" >&2
      echo "${status_json}" >&2
      exit 1
    fi
    echo "构建成功：${image}" >&2
    echo "${image}"
    exit 0
  fi

  if [[ "${status}" == "failed" || "${status}" == "error" ]]; then
    echo "构建失败：" >&2
    jq '.error' <<<"${status_json}" >&2
    echo "日志尾部：" >&2
    curl -fsS "${BASE_URL}/api/builds/${PROJECT}/${request_id}/logs?bytes=${LOG_TAIL_BYTES}" "${AUTH[@]}" |
      jq -r '.log_tail // .logs // .error // .' >&2
    exit 1
  fi

  if [[ "${MAX_POLLS}" != "0" && "${poll_count}" -ge "${MAX_POLLS}" ]]; then
    echo "等待构建超时：request_id=${request_id}" >&2
    exit 1
  fi

  sleep "${POLL_INTERVAL}"
done
