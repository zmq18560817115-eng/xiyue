# KneeJoy 设备 HTTP API 文档

> 固件：ESP32-S3 · WiFi STA 连接局域网后提供 HTTP 服务  
> 基础地址：`http://<设备IP>/`  
> 响应格式：JSON（除 `/` 调试页为 HTML）  
> CORS：所有 JSON 接口返回 `Access-Control-Allow-Origin: *`

---

## 快速索引

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/device` | 设备名称 / 类型 / 版本 |
| GET | `/api/status` | 实时传感器与运行状态 |
| POST | `/api/therapy` | 下发完整治疗参数（力/热/振） |
| POST | `/api/heat` | 仅控制热垫 |
| POST | `/api/motor` | 手动缩回推杆 |
| POST | `/api/reset` | 解除软件急停 |
| POST | `/api/stop` | 软件急停 |
| POST | `/api/tare` | 力传感器去皮 |
| GET | `/` | 内置硬件调试页（浏览器） |

---

## 1. 设备信息

### `GET /api/device`

获取产品标识与固件版本，用于 App 识别设备、版本校验。

**请求**：无参数

**响应 200**

```json
{
  "name": "KneeJoy",
  "type": "knee_therapy",
  "model": "KJ-S3-V1",
  "version": "1.0.0",
  "project": "blufi_demo",
  "chip": "esp32s3",
  "idf": "v5.5.3"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 产品名称 |
| type | string | 设备类型（业务分类） |
| model | string | 硬件型号 |
| version | string | 固件版本号 |
| project | string | 工程名 |
| chip | string | 主控芯片 |
| idf | string | ESP-IDF 版本 |

**前端示例**

```javascript
const device = await fetch(`http://${ip}/api/device`).then(r => r.json());
```

---

## 2. 实时状态

### `GET /api/status`

轮询设备运行状态，建议间隔 **1s**。

**请求**：无参数

**响应 200**

```json
{
  "force_l": 12.35,
  "force_r": 8.02,
  "force_l_net": 12580,
  "force_r_net": 8192,
  "force_l_raw": 12580,
  "force_r_raw": 8192,
  "force_l_ok": true,
  "force_r_ok": true,
  "force_l_offset": 12000,
  "force_r_offset": 8000,
  "motor_l_state": 0,
  "motor_r_state": 0,
  "motor_l_end": 0,
  "motor_r_end": 0,
  "nfault_l": false,
  "nfault_r": false,
  "temp": 38.50,
  "target_temp": 40.0,
  "ntc_adc": 2048,
  "ntc_v": 1.650,
  "heater_duty": 35.20,
  "current_l_ma": 120.5,
  "current_r_ma": 85.0,
  "current_l_raw": 512,
  "current_r_raw": 380,
  "heater_blocked": false,
  "estop": false,
  "sw_estop": false,
  "fault": 0,
  "ip": "192.168.1.100"
}
```

#### 力传感器

| 字段 | 类型 | 说明 |
|------|------|------|
| force_l / force_r | number | 左/右力值 (N)，有符号 |
| force_l_net / force_r_net | number | 去皮后原始净重 (counts) |
| force_l_raw / force_r_raw | number | HX711 原始读数，失败为 -1 |
| force_l_ok / force_r_ok | boolean | 采样是否有效 |
| force_l_offset / force_r_offset | number | 当前去皮零点 |

#### 推杆

| 字段 | 类型 | 说明 |
|------|------|------|
| motor_l_state / motor_r_state | number | 0=正常，1=堵转锁定 |
| motor_l_end / motor_r_end | number | 0=无，1=前进末端(禁伸)，2=缩回末端(禁缩) |
| nfault_l / nfault_r | boolean | DRV8801 nFault 引脚（低=故障） |
| current_l_ma / current_r_ma | number | 电机电流 (mA) |
| current_l_raw / current_r_raw | number | 电流 ADC 原始值 |

#### 热垫

| 字段 | 类型 | 说明 |
|------|------|------|
| temp | number | NTC 实测温度 (℃) |
| target_temp | number | PI 目标温度 (℃) |
| heater_duty | number | 热垫 PWM 占空比 (%) |
| heater_blocked | boolean | 超温保护禁输出 |
| ntc_adc | number | NTC ADC 原始值 |
| ntc_v | number | NTC 分压电压 (V) |

#### 系统

| 字段 | 类型 | 说明 |
|------|------|------|
| estop | boolean | 是否处于急停（硬件或软件） |
| sw_estop | boolean | 是否为网页/软件急停 |
| fault | number | 最近故障码，见下表 |
| ip | string | 设备当前 IP |

**fault 故障码**

| 值 | 含义 |
|----|------|
| 0 | 无 |
| 1 | 堵转 / nFault |
| 2 | 力超限 |
| 3 | 急停 |
| 4 | 驱动器故障 |

---

## 3. 下发治疗参数

### `POST /api/therapy`

一次性下发推杆力、热敷、振动。**成功时会自动解除软件急停**。

**Query 参数**

| 参数 | 类型 | 必填 | 范围 | 说明 |
|------|------|------|------|------|
| left | int | 是 | 0~30 | 左推杆目标力 (N)；**0~9 视为关闭** |
| right | int | 是 | 0~30 | 右推杆目标力 (N)；**0~9 视为关闭** |
| temp | int | 是 | 0 或 35~45 | 热敷目标 (℃)；**0=关** |
| vib | int | 是 | 0~2 | 振动：0关 / 1低频 / 2高频 |

**示例**

```
POST /api/therapy?left=15&right=12&temp=40&vib=1
```

**响应**

```json
{ "ok": true }
```

```json
{ "ok": false, "error": "invalid params" }
```

**说明**

- 有效力控范围：**10~30 N**（与 BluFi 二进制协议一致）
- 前端 slider 可用 0~30 UI，映射规则：`value < 10 → 协议 0（关）`，`value >= 10 → 实际力值`
- 对应 BluFi 帧：`55 AA [L] [R] [T] [V] 0D 0A`

---

## 4. 热垫控制

### `POST /api/heat`

仅控制热垫 PI，**不改变**已缓存的推杆力参数。

**Query 参数**

| 参数 | 类型 | 必填 | 范围 | 说明 |
|------|------|------|------|------|
| temp | int | 是 | 0 或 35~45 | 0=停止；35~45=目标温度 |

**示例**

```
POST /api/heat?temp=40    # 启动 PI，目标 40℃
POST /api/heat?temp=0     # 停止热垫
```

**响应**

```json
{ "ok": true }
```

```json
{ "ok": false, "error": "temp must be 35-45" }
```

---

## 5. 推杆手动缩回

### `POST /api/motor`

力闭环**不会自动缩回**；需通过此接口手动缩回。缩回为持续运动，需调用 `stop` 停止。

**Query 参数**

| 参数 | 值 | 说明 |
|------|-----|------|
| side | `left` / `right` / `all` | 控制哪一侧 |
| action | `retract` / `stop` | 开始缩回 / 停止缩回 |

**示例**

```
POST /api/motor?side=left&action=retract
POST /api/motor?side=all&action=stop
```

**响应**

```json
{ "ok": true }
```

```json
{ "ok": false, "error": "missing side/action" }
```

**注意**：软件急停或硬件急停期间调用无效；前进/缩回末端保护仍生效。

---

## 6. 急停与恢复

### `POST /api/stop`

软件急停：立即停止所有电机、热垫、振动，清空当前治疗指令。

**响应**

```json
{ "ok": true }
```

恢复流程：

1. `POST /api/reset` 解除软件急停，**或**
2. 直接 `POST /api/therapy` 下发新参数（会自动解除）

硬件急停按钮（IO20）按下期间无法恢复。

---

### `POST /api/reset`

解除**软件急停**锁，不清除其他状态。解除后需重新 `POST /api/therapy`。

**响应**

```json
{ "ok": true }
```

```json
{ "ok": false, "error": "hardware estop active" }
```

---

## 7. 力传感器去皮

### `POST /api/tare`

对左右 HX711 执行一次去皮（同 STM32 `weight_first`）。

**响应**

```json
{ "ok": true }
```

---

## 8. BluFi 二进制协议（App 蓝牙通道）

HTTP API 与 BluFi 自定义数据使用**同一套 8 字节治疗帧**：

| 偏移 | 字节 | 说明 |
|------|------|------|
| 0 | 0x55 | 帧头 |
| 1 | 0xAA | 帧头 |
| 2 | L | 左力 0x0A~0x1E (10~30N)，**0=关** |
| 3 | R | 右力 0x0A~0x1E，**0=关** |
| 4 | T | 温度 0x23~0x32 (35~45℃) |
| 5 | V | 振动 0~2 |
| 6 | 0x0D | 帧尾 |
| 7 | 0x0A | 帧尾 |

**故障上报帧（5 字节）**：`FF EE 01 0D 0A`

---

## 9. 前端集成建议

### 连接流程

```
1. 手机/设备与 KneeJoy 同一局域网
2. GET /api/device  → 校验 type / version
3. 定时 GET /api/status（1Hz）刷新 UI
4. 用户操作 → POST 对应控制接口
```

### TypeScript 类型（可选）

```typescript
interface DeviceInfo {
  name: string;
  type: string;
  model: string;
  version: string;
  project: string;
  chip: string;
  idf: string;
}

interface DeviceStatus {
  force_l: number;
  force_r: number;
  motor_l_end: 0 | 1 | 2;
  motor_r_end: 0 | 1 | 2;
  estop: boolean;
  sw_estop: boolean;
  fault: 0 | 1 | 2 | 3 | 4;
  temp: number;
  target_temp: number;
  ip: string;
  // ... 其余字段见 status 响应
}

interface ApiResult {
  ok: boolean;
  error?: string;
}
```

### 力 slider 映射

```javascript
function uiForceToApi(v) {
  return v < 10 ? 0 : v;  // 0~9 显示「关」，协议发 0
}
```

### 错误处理

- 所有 POST 检查 `response.ok` 字段
- `estop === true` 时禁用控制按钮，提示用户先恢复
- `motor_*_end !== 0` 时提示末端保护状态

---

## 10. 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2026-06 | 初版：device / status / therapy / heat / motor / reset / stop / tare |
