#!/usr/bin/env bash
# 启动 backlink-agent 网页端（http://127.0.0.1:8787）。
# 前提：三个令牌来自仓库根 .env（模板见 .env.example）或已 export；
# 依赖已由 setup.sh 装好 —— 启动只依赖 node，pnpm 仅装依赖时需要。
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$ROOT"
# 读入 .env 只为校验令牌，不导出：环境变量须保持比 .env 更高的优先级
# （与 dsh 凭据解析一致），文件由 dsh 进程启动时自行加载。
if [[ -f .env ]]; then
  . ./.env || { echo "仓库根 .env 存在但不是合法的 KEY=value 行" >&2; exit 1; }
fi
: "${NEWAPI_API_KEY:?缺少 NEWAPI_API_KEY（仓库根 .env 或环境变量，模板 examples/backlink-agent/.env.example）}"
: "${SUPERMANAGER_TOKEN:?缺少 SUPERMANAGER_TOKEN（仓库根 .env 或环境变量，模板 examples/backlink-agent/.env.example）}"
: "${CLOUDMAIL_TOKEN:?缺少 CLOUDMAIL_TOKEN（仓库根 .env 或环境变量，模板 examples/backlink-agent/.env.example）}"
if command -v node >/dev/null && node -e 'process.exit(process.versions.node.split(".")[0] >= 24 ? 0 : 1)' 2>/dev/null; then
  :
else
  export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
fi
# 等价于根 package.json 的 "dsh" 脚本：源码启动需经 tsx 的 ESM hook
exec node --import tsx/esm apps/cli/src/bin.ts web --patch examples/backlink-agent/cordis.yml --port 8787
