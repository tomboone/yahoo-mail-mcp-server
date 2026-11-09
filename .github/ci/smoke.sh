#!/usr/bin/env bash
# Smoke test for the image. image-check passes the image tag as $1.
# Boots the server in SSE mode and waits for /health to return 200. /health
# needs no Yahoo credentials.
set -euo pipefail
image=$1
name=yahoo-mail-mcp-smoke
body=$(mktemp)

docker run -d --name "$name" -p 3000:3000 \
  -e TRANSPORT_MODE=sse -e PORT=3000 \
  "$image" >/dev/null
trap 'echo "--- container logs ---"; docker logs "$name" || true; docker rm -f "$name" >/dev/null 2>&1 || true; rm -f "$body"' EXIT

code=000
for _ in $(seq 1 30); do
  code=$(curl -s -o "$body" -w '%{http_code}' http://localhost:3000/health) || code=000
  [[ $code == 200 ]] && break
  sleep 2
done

if [[ $code != 200 ]]; then
  echo "::error title=smoke::/health returned $code (expected 200): the image builds but does not run"
  exit 1
fi

echo "--- /health ---"
cat "$body"
echo
echo "smoke ok"
