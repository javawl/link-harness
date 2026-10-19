@echo off
setlocal
rem Launch the backlink-agent web UI (http://127.0.0.1:8787); Windows counterpart of examples/backlink-agent/start.sh.
rem Tokens are best configured in the web settings page (shown when the browser opens); the repo
rem root .env or pre-set environment variables are equivalent sources. Dependencies are installed
rem by setup.sh (Git Bash/WSL); launching only needs node.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo node not found: install Node.js 24 or newer, or add its directory to PATH.
  goto :fail
)
node -e "process.exit(process.versions.node.split('.')[0]>=24?0:1)" >nul 2>nul
if errorlevel 1 (
  echo node too old: Node.js 24 or newer required, current version:
  node -v
  goto :fail
)

rem Give explicit guidance when dependencies are missing, instead of node module-resolution errors
if not exist "node_modules\tsx" (
  echo Dependencies missing: run "bash examples/backlink-agent/setup.sh" first.
  goto :fail
)
rem lib/ build artifacts are not committed; a missing one means never built. The client bundle
rem (lib/client.js) became a launch requirement in 0.2.x; check it separately so old artifacts
rem cannot slip past this precheck.
set "TYPERT_OK="
rem cmd path wildcards only match the final segment; expand directory levels with nested for /d
for /d %%g in (packages\*) do for /d %%p in ("%%g\*") do if exist "%%p\lib\typert.host.js" if not defined TYPERT_OK set "TYPERT_OK=1"
if not defined TYPERT_OK (
  echo Build artifacts missing: run "bash examples/backlink-agent/setup.sh" ^(or pnpm run build^).
  goto :fail
)
if not exist "packages\client\modules\lib\client.js" (
  echo Client bundle missing ^(rebuild after version alignment^): run pnpm run build.
  goto :fail
)

rem Token gaps are informational only: an env var or a root .env line with a non-empty value counts as configured
set "MISSING="
call :check_token NEWAPI_API_KEY
call :check_token SUPERMANAGER_TOKEN
call :check_token CLOUDMAIL_TOKEN
if defined MISSING (
  echo Hint: %MISSING% not set - fill it in the web settings page after launch, or in the root .env ^(template examples/backlink-agent/.env.example^).
)

rem Explain port conflicts in one line instead of an EADDRINUSE error from deep inside the webserver
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /c:":8787 " ^| findstr /c:"LISTENING"') do (
  echo Port 8787 is held by PID %%p - an existing backlink-agent is likely running:
  echo   open http://127.0.0.1:8787 directly; to restart, end that process in Task Manager first.
  goto :fail
)

rem Switch the console to UTF-8 before node runs so process output renders correctly; all bat
rem content after this point stays pure ASCII, keeping parse positions codepage-independent.
chcp 65001 >nul

rem Settings-page config (model catalog / default routing / main agent) is persisted via the
rem profile layer; only missing entries are written, existing edits in the settings page are kept.
node examples/backlink-agent/ensure-profile-settings.mjs web
if errorlevel 1 goto :fail

rem Equivalent to start.sh's final exec: the source launch must go through tsx's ESM hook
node --import tsx/esm apps/cli/src/bin.ts web --patch examples/backlink-agent/cordis.yml --port 8787
if errorlevel 1 (
  echo backlink-agent exited unexpectedly.
  goto :fail
)
echo backlink-agent stopped.
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
