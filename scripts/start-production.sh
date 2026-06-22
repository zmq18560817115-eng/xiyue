#!/usr/bin/env bash
# 生产/演示模式：单端口同时提供前端页面 + 后端 API（需本机已安装 Node.js）
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f package.json ]; then
  echo "错误：未找到 package.json"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "正在安装依赖..."
  npm install
fi

export NODE_ENV=production
export API_PORT="${API_PORT:-8080}"

echo "正在构建前端..."
npm run build:prod

echo ""
echo "============================================"
echo "  膝悦演示版已启动"
echo "  浏览器打开: http://localhost:${API_PORT}"
echo "  按 Ctrl+C 停止"
echo "============================================"
echo ""

npm run start:prod
