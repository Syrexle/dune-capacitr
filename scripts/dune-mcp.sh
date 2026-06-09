#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/Users/tariq/Desktop/Projects/dune"
ENV_FILE="$PROJECT_DIR/.env.local"

if [[ -f "$ENV_FILE" ]]; then
  while IFS= read -r line; do
    case "$line" in
      DUNE_API_KEY=*)
        DUNE_API_KEY="${line#DUNE_API_KEY=}"
        DUNE_API_KEY="${DUNE_API_KEY%$'\r'}"
        DUNE_API_KEY="${DUNE_API_KEY#\"}"
        DUNE_API_KEY="${DUNE_API_KEY%\"}"
        DUNE_API_KEY="${DUNE_API_KEY#\'}"
        DUNE_API_KEY="${DUNE_API_KEY%\'}"
        export DUNE_API_KEY
        break
        ;;
    esac
  done < "$ENV_FILE"
fi

if [[ -z "${DUNE_API_KEY:-}" ]]; then
  echo "DUNE_API_KEY is not set in $ENV_FILE" >&2
  exit 1
fi

exec npx -y mcp-remote https://api.dune.com/mcp/v1 \
  --header "x-dune-api-key: \${DUNE_API_KEY}" \
  --transport http-first
