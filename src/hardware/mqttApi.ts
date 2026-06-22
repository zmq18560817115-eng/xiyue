import type { ApiResult, DeviceInfo, DeviceStatus, MotorAction, MotorSide, TherapyParams } from './deviceApi';
import { uiForceToApi } from './deviceApi';
import {
  ensureMqttConnected,
  publishCmd,
  subscribeDeviceTopics,
  waitForAck,
  type MqttAckMessage,
} from './mqttClient';

function num(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function bool(v: unknown): boolean {
  return v === true || v === 'true';
}

/** 将设备 MQTT status JSON 转为 DeviceStatus（缺省字段填 0） */
export function mqttPayloadToDeviceStatus(raw: Record<string, unknown>): DeviceStatus {
  return {
    force_l: num(raw.force_l),
    force_r: num(raw.force_r),
    force_l_net: num(raw.force_l_net),
    force_r_net: num(raw.force_r_net),
    force_l_raw: num(raw.force_l_raw, -1),
    force_r_raw: num(raw.force_r_raw, -1),
    force_l_ok: bool(raw.force_l_ok),
    force_r_ok: bool(raw.force_r_ok),
    force_l_offset: num(raw.force_l_offset),
    force_r_offset: num(raw.force_r_offset),
    motor_l_state: num(raw.motor_l_state),
    motor_r_state: num(raw.motor_r_state),
    motor_l_end: num(raw.motor_l_end) as 0 | 1 | 2,
    motor_r_end: num(raw.motor_r_end) as 0 | 1 | 2,
    nfault_l: bool(raw.nfault_l),
    nfault_r: bool(raw.nfault_r),
    temp: num(raw.temp),
    target_temp: num(raw.target_temp),
    ntc_adc: num(raw.ntc_adc),
    ntc_v: num(raw.ntc_v),
    heater_duty: num(raw.heater_duty),
    current_l_ma: num(raw.current_l_ma),
    current_r_ma: num(raw.current_r_ma),
    current_l_raw: num(raw.current_l_raw),
    current_r_raw: num(raw.current_r_raw),
    heater_blocked: bool(raw.heater_blocked),
    estop: bool(raw.estop),
    sw_estop: bool(raw.sw_estop),
    hw_estop: raw.hw_estop !== undefined ? bool(raw.hw_estop) : bool(raw.estop) && !bool(raw.sw_estop),
    fault: num(raw.fault) as DeviceStatus['fault'],
    ip: String(raw.ip ?? ''),
  };
}

export function mqttPayloadToDeviceInfo(raw: Record<string, unknown>): DeviceInfo {
  return {
    name: String(raw.name ?? 'KneeJoy'),
    type: String(raw.type ?? 'knee_therapy'),
    model: String(raw.model ?? 'KJ-S3-V1'),
    version: String(raw.version ?? '1.0.0'),
    project: String(raw.project ?? 'blufi_demo'),
    chip: String(raw.chip ?? 'esp32s3'),
    idf: String(raw.idf ?? ''),
  };
}

async function sendCmd(
  deviceId: string,
  payload: Record<string, unknown>,
  waitAck = true
): Promise<ApiResult> {
  await ensureMqttConnected();
  await subscribeDeviceTopics(deviceId);

  const action = String(payload.action ?? '');
  if (waitAck) {
    const ackPromise = waitForAck(deviceId, action);
    await publishCmd(deviceId, payload);
    const ack = await ackPromise;
    return ackToResult(ack);
  }
  await publishCmd(deviceId, payload);
  return { ok: true };
}

function ackToResult(ack: MqttAckMessage): ApiResult {
  if (ack.ok) return { ok: true };
  return { ok: false, error: ack.error ?? '设备拒绝执行' };
}

export async function mqttPostTherapy(deviceId: string, params: TherapyParams): Promise<ApiResult> {
  return sendCmd(deviceId, {
    action: 'therapy',
    left: uiForceToApi(params.left),
    right: uiForceToApi(params.right),
    temp: Math.round(params.temp),
    vib: params.vib,
  });
}

export async function mqttPostHeat(deviceId: string, temp: number): Promise<ApiResult> {
  return sendCmd(deviceId, { action: 'heat', temp: Math.round(temp) });
}

export async function mqttPostMotor(
  deviceId: string,
  side: MotorSide,
  action: MotorAction
): Promise<ApiResult> {
  if (action === 'retract' && side === 'all') {
    await sendCmd(deviceId, { action: 'motor', side: 'left', cmd: 'retract' });
    return sendCmd(deviceId, { action: 'motor', side: 'right', cmd: 'retract' });
  }
  return sendCmd(deviceId, { action: 'motor', side, cmd: action });
}

export async function mqttPostStop(deviceId: string): Promise<ApiResult> {
  return sendCmd(deviceId, { action: 'stop' });
}

export async function mqttPostReset(deviceId: string): Promise<ApiResult> {
  return sendCmd(deviceId, { action: 'reset' });
}

export async function mqttPostTare(deviceId: string): Promise<ApiResult> {
  return sendCmd(deviceId, { action: 'tare' });
}
