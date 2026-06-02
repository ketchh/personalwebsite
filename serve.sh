#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-5173}"
echo "Serving sbar.si from $(pwd)"
echo "Open: http://localhost:${PORT}"
python3 -m http.server "${PORT}" --bind 0.0.0.0
