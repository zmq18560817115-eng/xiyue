#!/usr/bin/env bash
# 在项目根目录启动前端 + 后端（请在终端执行本脚本，勿在 ~ 目录直接 npm run dev）
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [ ! -f package.json ]; then
  echo "错误：未找到 package.json，请确认在项目目录运行。"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "正在安装依赖..."
  npm install
fi

if command -v lsof >/dev/null 2>&1; then
  for PORT in 3000 3001; do
    PIDS=$(lsof -ti :"$PORT" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
      echo "释放占用 ${PORT} 端口的进程…"
      kill $PIDS 2>/dev/null || true
      sleep 1
    fi
  done
fi

echo "启动后端 API :3001（热重载）..."
npm run dev:server &
API_PID=$!

cleanup() {
  kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT

health_ok() {
  curl --noproxy '*' -sf http://127.0.0.1:3001/api/v1/health >/dev/null 2>&1
}

echo "等待后端就绪..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if health_ok; then
    echo "后端已就绪"
    break
  fi
  sleep 1
done
if ! health_ok; then
  echo "错误：后端未在 :3001 启动，请检查端口占用或运行 npm run server"
  exit 1
fi

echo ""
echo "启动前端原型 :3000 ..."
echo "浏览器打开: http://localhost:3000"
echo "按 Ctrl+C 停止"
npm run dev
