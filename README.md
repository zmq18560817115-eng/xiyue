# 膝悦 KneeJoy

ESP32 硬件 + Web UI + 本地/云端 API。  
**ESP32 设备 HTTP API 已接入**（`src/hardware/deviceApi.ts`），支持局域网直连联调。  
**专业人员请阅读：[交付说明.md](交付说明.md)** · **[技术人员联调运行文档](docs/技术人员联调运行文档.md)**

## 三个硬件运行代码

| 模块 | 文件 |
| --- | --- |
| 推杆 | `firmware/esp32-kneejoy/KneeJoy_Device/actuator.cpp` |
| 加热 | `firmware/esp32-kneejoy/KneeJoy_Device/heater.cpp` |
| 震动 | `firmware/esp32-kneejoy/KneeJoy_Device/vibration.cpp` |

调度：`therapy_session.cpp` · 入口：`KneeJoy_Device.ino`

## 快速启动

```bash
npm install
bash start-dev.sh
```

- 前端 http://localhost:3000
- API http://localhost:3001/api/v1/health

## ESP32 配置（三步）

`config.h` 已默认连接云服务器 **kneejoy.onrender.com**（无需开电脑）。

```bash
# 1. 编辑固件目录下的 config.h，只填 Wi-Fi 名称和密码
#    firmware/esp32-kneejoy/KneeJoy_Device/config.h

# 2. Arduino IDE 打开 KneeJoy_Device.ino 上传

# 3. 手机打开 https://kneejoy.onrender.com 联调
```

本地联调时把 `config.h` 改为电脑 IP + `API_PORT 3001` + `API_USE_TLS 0`，或运行 `bash scripts/setup-esp32-config.sh`。

## 硬件 API 联调（ESP32 局域网 HTTP）

> 规范文档：[docs/API-设备HTTP接口.md](docs/API-设备HTTP接口.md)

**前提：** 电脑/手机与 ESP32 在同一 Wi-Fi；**局域网直连请用本地 `npm run start`**（云端 HTTPS 页面无法直接 fetch `http://192.168.x.x`）。

```bash
# 1. 命令行验证设备可达
npm run verify:device -- 192.168.1.100

# 2. 启动 App，患者登录 → 右下角「硬件联调」→ 填 IP → 连接 → 下发治疗
npm run start
```

可选 `.env.local`：

```env
VITE_HARDWARE_MODE=wifi
VITE_DEVICE_IP=192.168.1.100
```

## 串口快速测试（115200）

安全夹 GPIO34 接 GND 后发送：

```
@STxCMD: L_F=15,R_F=15,TEMP=42,VIB=1
@STxSTOP
```

## 演示账号

| 角色 | 手机号 | 密码 |
| --- | --- | --- |
| 患者 | 18612345678 | pass_pat_1 |
| 医生 | 13800138001 | pass_doc_1 |
| 家属 | 13099990000 | pass_fam_1 |

## 目录结构

```
src/hardware/
  deviceApi.ts         ESP32 HTTP 客户端
  wifiHttpAdapter.ts   Wi-Fi 真实硬件适配器
  deviceController.ts  连接/下发/轮询
docs/API-设备HTTP接口.md  固件 HTTP 规范
scripts/verify-device-api.ts  命令行联调
```

## 常用命令

```bash
npm run server
npm run verify:api
npm run verify:device -- 192.168.1.100
bash scripts/start-production.sh
npm run build
```

可选：在 `.env.local` 配置 `GEMINI_API_KEY`（AI 相关功能）。
