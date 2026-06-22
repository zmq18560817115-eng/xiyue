#!/usr/bin/env bash
# 自动生成 ESP32 config.h：复制模板并填入本机局域网 IP
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$ROOT/firmware/esp32-kneejoy/KneeJoy_Device/config.example.h"
TARGET="$ROOT/firmware/esp32-kneejoy/KneeJoy_Device/config.h"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "找不到模板: $TEMPLATE"
  exit 1
fi

IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [[ -z "$IP" ]]; then
  IP="192.168.1.100"
  echo "未能自动检测 IP，使用默认 $IP（请手动修改 config.h）"
else
  echo "检测到本机 IP: $IP"
fi

cp "$TEMPLATE" "$TARGET"

# macOS sed
sed -i '' "s/#define API_HOST \".*\"/#define API_HOST \"$IP\"/" "$TARGET"

echo "已生成: $TARGET"
echo "请编辑 config.h 填写 WIFI_SSID 和 WIFI_PASSWORD 后上传固件。"
