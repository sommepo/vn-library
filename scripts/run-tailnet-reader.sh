#!/bin/sh
# Backend only. Tailscale Serve supplies private authentication and trusted TLS.
set -eu
vnkit_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
vnkit_port=${VNKIT_PORT:-8891}
if [ -z "${VNKIT_ORIGIN:-}" ]; then
  vnkit_dns=$(tailscale status --json | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["Self"]["DNSName"].rstrip("."))')
  VNKIT_ORIGIN="https://$vnkit_dns:$vnkit_port"
fi
cd "$vnkit_root"
exec python3 -m vnkit serve --host 127.0.0.1 --port "$vnkit_port" \
  --public-origin "$VNKIT_ORIGIN" --allow-origin https://renji-xd.github.io
