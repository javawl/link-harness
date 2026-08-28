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
# pnpm 版本必须与仓库 lockfile 生成版本一致：更新的 pnpm 带更严的原生二进制校验，
# 会对旧 lockfile 报 "Cannot verify the identity of @pnpm/exe.*"
PNPM_PIN="11.7.0"
if [[ -f "$ROOT/package.json" ]]; then
  pin_from_manifest="$(sed -n 's/.*"packageManager": *"pnpm@\([^+"]*\).*/\1/p' "$ROOT/package.json")"
  if [[ -n "$pin_from_manifest" ]]; then
    PNPM_PIN="$pin_from_manifest"
  fi
fi
pnpm_pinned() { command -v pnpm >/dev/null && [[ "$(pnpm --version 2>/dev/null)" == "$PNPM_PIN" ]]; }
pnpm_pinned || {
  # ${PNPM_PIN} 必须带花括号：macOS 自带 bash 3.2 在 UTF-8 locale 下会把紧随变量的
  # 多字节字符并入变量名（报 PNPM_PIN?: unbound variable）
  echo "安装 pnpm@${PNPM_PIN}（与仓库锁定版本一致；仅装依赖时使用，日常 start.sh 启动不需要）..."
  npm install -g "pnpm@${PNPM_PIN}"
}
# npm 全局 bin 目录可能不在 PATH（新机器常见）：解析出来供本脚本后续步骤使用
command -v pnpm >/dev/null || export PATH="$(npm prefix -g)/bin:$PATH"
pnpm_pinned || { echo "pnpm@${PNPM_PIN} 不可用：请手动执行 npm install -g pnpm@${PNPM_PIN} 后重跑本脚本"; exit 1; }
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
