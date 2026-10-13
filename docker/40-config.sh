#!/bin/sh
set -e
: "${API_URL:=http://localhost:3000}"
cat > /usr/share/nginx/html/config.js <<EOCFG
window.__SEATLY_CONFIG__ = { apiUrl: "${API_URL}" };
EOCFG
echo "[config] apiUrl=${API_URL}"
