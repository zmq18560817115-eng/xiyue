/**
 * KneeJoy ESP32 设备 HTTP API 客户端
 * 规范来源：docs/API-设备HTTP接口.md
 */

export interface DeviceInfo {
  name: string;
  type: string;
  model: string;
  version: string;
  project: string;
  chip: string;
  idf: string;
}

export interface DeviceStatus {
  force_l: number;
  force_r: number;
  force_l_net: number;
  force_r_net: number;
  force_l_raw: number;
  force_r_raw: number;
  force_l_ok: boolean;
  force_r_ok: boolean;
  force_l_offset: number;
  force_r_offset: number;
  motor_l_state: number;
  motor_r_state: number;
  motor_l_end: 0 | 1 | 2;
  motor_r_end: 0 | 1 | 2;
  nfault_l: boolean;
  nfault_r: boolean;
  temp: number;
  target_temp: number;
  ntc_adc: number;
  ntc_v: number;
  heater_duty: number;
  current_l_ma: number;
  current_r_ma: number;
  current_l_raw: number;
  current_r_raw: number;
  heater_blocked: boolean;
  estop: boolean;
  sw_estop: boolean;
  hw_estop?: boolean;
  fault: 0 | 1 | 2 | 3 | 4;
  ip: string;
}

export interface ApiResult {
  ok: boolean;
  error?: string;
}

export interface TherapyParams {
  left: number;
  right: number;
  temp: number;
  vib: 0 | 1 | 2;
}

export type MotorSide = 'left' | 'right' | 'all';
export type MotorAction = 'retract' | 'stop';

const FAULT_LABELS: Record<number, string> = {
  0: '无',
  1: '堵转 / nFault',
  2: '力超限',
  3: '急停',
  4: '驱动器故障',
};

export function faultLabel(code: number): string {
  return FAULT_LABELS[code] ?? `未知(${code})`;
}

/** UI slider 0~30 → 设备协议：0~9 视为关闭 */
export function uiForceToApi(value: number): number {
  const v = Math.round(value);
  return v < 10 ? 0 : Math.min(30, v);
}

function normalizeBaseUrl(ipOrUrl: string): string {
  const trimmed = ipOrUrl.trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('设备地址不能为空');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

async function deviceFetch<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = `${normalizeBaseUrl(baseUrl)}${path}`;
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error(`无法连接设备 ${url}，请确认手机/电脑与 ESP32 在同一局域网`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`设备返回非 JSON（${res.status}），请检查 IP 是否正确`);
  }

  const data = (await res.json()) as T & ApiResult;
  if ('ok' in data && data.ok === false) {
    throw new Error(data.error ?? '设备拒绝执行');
  }
  return data;
}

export async function getDeviceInfo(baseUrl: string): Promise<DeviceInfo> {
  return deviceFetch<DeviceInfo>(baseUrl, '/api/device');
}

export async function getDeviceStatus(baseUrl: string): Promise<DeviceStatus> {
  return deviceFetch<DeviceStatus>(baseUrl, '/api/status');
}

export async function postTherapy(baseUrl: string, params: TherapyParams): Promise<ApiResult> {
  const q = new URLSearchParams({
    left: String(uiForceToApi(params.left)),
    right: String(uiForceToApi(params.right)),
    temp: String(Math.round(params.temp)),
    vib: String(params.vib),
  });
  return deviceFetch<ApiResult>(baseUrl, `/api/therapy?${q}`, { method: 'POST' });
}

export async function postHeat(baseUrl: string, temp: number): Promise<ApiResult> {
  const q = new URLSearchParams({ temp: String(Math.round(temp)) });
  return deviceFetch<ApiResult>(baseUrl, `/api/heat?${q}`, { method: 'POST' });
}

export async function postMotor(
  baseUrl: string,
  side: MotorSide,
  action: MotorAction
): Promise<ApiResult> {
  const q = new URLSearchParams({ side, action });
  return deviceFetch<ApiResult>(baseUrl, `/api/motor?${q}`, { method: 'POST' });
}

export async function postStop(baseUrl: string): Promise<ApiResult> {
  return deviceFetch<ApiResult>(baseUrl, '/api/stop', { method: 'POST' });
}

export async function postReset(baseUrl: string): Promise<ApiResult> {
  return deviceFetch<ApiResult>(baseUrl, '/api/reset', { method: 'POST' });
}

export async function postTare(baseUrl: string): Promise<ApiResult> {
  return deviceFetch<ApiResult>(baseUrl, '/api/tare', { method: 'POST' });
}

export async function pingDevice(baseUrl: string): Promise<{ info: DeviceInfo; status: DeviceStatus }> {
  const [info, status] = await Promise.all([
    getDeviceInfo(baseUrl),
    getDeviceStatus(baseUrl),
  ]);
  if (info.type !== 'knee_therapy') {
    throw new Error(`设备类型不匹配：${info.type}`);
  }
  return { info, status };
}
