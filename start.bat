@echo off
setlocal
chcp 65001 >nul
title backlink-agent
rem 启动 backlink-agent 网页端（http://127.0.0.1:8787），与 examples/backlink-agent/start.sh 等价。
rem 令牌推荐在网页设置页配置（启动后浏览器打开即见）；仓库根 .env 或已 set
rem 的同名变量仍是等价的配置来源。依赖已由 setup.sh（Git Bash/WSL 下）装好 —— 启动只依赖 node。
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 node：请先安装 Node.js 24 及以上，或将其所在目录加入 PATH。
  goto :fail
)
node -e "process.exit(process.versions.node.split('.')[0]>=24?0:1)" >nul 2>nul
if errorlevel 1 (
  echo node 版本过低：需要 Node.js 24 及以上，当前为：
  node -v
  goto :fail
)

rem 依赖未安装时给出明确指引，代替 node 的模块解析报错
if not exist "node_modules\tsx" (
  echo 依赖未安装：请先运行 bash examples/backlink-agent/setup.sh。
  goto :fail
)
rem 构建产物（lib/）不进 git，缺失说明从未构建过；客户端产物（lib/client.js）
rem 是 0.2.x 新增的启动必需品，单独检查以免旧产物漏过预检。
set "TYPERT_OK="
for %%f in (packages\*\*\lib\typert.host.js) do if not defined TYPERT_OK set "TYPERT_OK=1"
if not defined TYPERT_OK (
  echo 构建产物缺失：请先运行 bash examples/backlink-agent/setup.sh（或 pnpm run build）。
  goto :fail
)
if not exist "packages\client\modules\lib\client.js" (
  echo 客户端构建产物缺失（版本对齐后需重新构建）：请先运行 pnpm run build。
  goto :fail
)

rem 令牌缺失只提示不阻断：环境变量或仓库根 .env 任一处有非空值即视为已配置
set "MISSING="
call :check_token NEWAPI_API_KEY
call :check_token SUPERMANAGER_TOKEN
call :check_token CLOUDMAIL_TOKEN
if defined MISSING (
  echo 提示：%MISSING% 未配置 —— 可启动后在网页设置页填写，或写入仓库根 .env（模板 examples/backlink-agent/.env.example）。
)

rem 端口被占时给出一句话原因，代替 webserver 深处的 EADDRINUSE 报错
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /c:":8787 " ^| findstr /c:"LISTENING"') do (
  echo 端口 8787 已被 PID %%p 占用 —— 多半已有一个 backlink-agent 在运行：
  echo   直接访问 http://127.0.0.1:8787 ；要重启请先在任务管理器结束该进程再重跑本脚本。
  goto :fail
)

rem 设置页管理的配置（模型目录/默认路由/主 agent）写入 profile 持久层，
rem 只补写缺失条目，用户在设置页的已有编辑不会被覆盖。
node examples/backlink-agent/ensure-profile-settings.mjs web
if errorlevel 1 goto :fail

rem 等价于 start.sh 的最终 exec：源码启动需经 tsx 的 ESM hook
node --import tsx/esm apps/cli/src/bin.ts web --patch examples/backlink-agent/cordis.yml --port 8787
if errorlevel 1 (
  echo backlink-agent 异常退出。
  goto :fail
)
echo backlink-agent 已停止。
pause
exit /b 0

:fail
echo.
pause
exit /b 1

:check_token
if defined %1 exit /b 0
findstr /r /b /c:"%1=." .env >nul 2>nul && exit /b 0
if defined MISSING (set "MISSING=%MISSING% %1") else (set "MISSING=%1")
exit /b 0
