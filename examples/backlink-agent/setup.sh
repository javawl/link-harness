#!/usr/bin/env bash
# backlink-agent 新电脑一键接入（macOS）。在 harness 仓库根目录运行一次：
#   bash examples/backlink-agent/setup.sh <harness仓库git地址>
# 已在仓库内运行时也可不带参数（跳过克隆）。要求：brew、git 已可用。
set -euo pipefail

REPO_URL="${1:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

echo "== 1/4 运行环境 =="
if ! command -v node >/dev/null || ! node -e 'process.exit(process.versions.node.split(".")[0] >= 24 ? 0 : 1)'; then
  echo "安装 Node 24（brew）..."
  brew install node@24
  echo '后续命令请先: export PATH="/opt/homebrew/opt/node@24/bin:$PATH"'
fi
command -v pnpm >/dev/null || { echo "安装 pnpm（仅本脚本装依赖时使用，日常 start.sh 启动不需要）..."; npm install -g pnpm; }
command -v "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" >/dev/null 2>&1 \
  || echo "未检测到 Google Chrome：发布批次需要时再安装 https://www.google.com/chrome/（不影响安装与启动）"

echo "== 2/4 代码 =="
if [[ -n "$REPO_URL" && ! -d "$ROOT/package.json" ]]; then
  git clone "$REPO_URL" "$ROOT"
fi
[[ -f "$ROOT/package.json" ]] || { echo "请在 harness 仓库内运行本脚本"; exit 1; }
cd "$ROOT"

echo "== 3/4 依赖（首次较慢） =="
pnpm install

echo "== 4/4 配置 =="
echo "令牌（NEWAPI_API_KEY / SUPERMANAGER_TOKEN / CLOUDMAIL_TOKEN）不再需要改文件："
echo "启动后在网页设置页填写即可，保存即生效。也可选用仓库根 .env（模板 $HERE/.env.example）。"

echo
echo "完成。日常启动：bash $HERE/start.sh"
