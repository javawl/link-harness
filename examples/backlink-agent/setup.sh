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
command -v pnpm >/dev/null || npm install -g pnpm
command -v "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" >/dev/null 2>&1 || {
  echo "未检测到 Google Chrome，请先安装: https://www.google.com/chrome/"; exit 1; }

echo "== 2/4 代码 =="
if [[ -n "$REPO_URL" && ! -d "$ROOT/package.json" ]]; then
  git clone "$REPO_URL" "$ROOT"
fi
[[ -f "$ROOT/package.json" ]] || { echo "请在 harness 仓库内运行本脚本"; exit 1; }
cd "$ROOT"

echo "== 3/4 依赖（首次较慢） =="
pnpm install

echo "== 4/4 配置 =="
if [[ ! -f .env ]]; then
  cp "$HERE/.env.example" .env
  chmod 600 .env
  echo "已生成 .env 模板 —— 请编辑填入三个令牌后再运行 start.sh："
  echo "  $ROOT/.env"
else
  echo ".env 已存在，跳过（如需更新对照 $HERE/.env.example）"
fi

echo
echo "完成。日常启动：bash $HERE/start.sh"
