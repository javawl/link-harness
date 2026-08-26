#!/usr/bin/env bash
# 启动 backlink-agent 网页端（http://127.0.0.1:8787）。
# 前提：仓库根目录 .env 已填好（见 .env.example）。
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$ROOT"
[[ -f .env ]] || { echo "缺少 .env（参考 examples/backlink-agent/.env.example）"; exit 1; }
if command -v node >/dev/null && node -e 'process.exit(process.versions.node.split(".")[0] >= 24 ? 0 : 1)' 2>/dev/null; then
  :
else
  export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
fi
exec pnpm dsh web --patch examples/backlink-agent/cordis.yml --port 8787
