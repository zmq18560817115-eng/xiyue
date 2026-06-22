import type { HardwareState, TreatmentParams } from '../types';
import {
  faultLabel,
  getDeviceStatus,
  pingDevice,
  postMotor,
  postReset,
  postStop,
  postTare,
  postTherapy,
  type DeviceInfo,
  type DeviceStatus,
  type MotorSide,
} from './deviceApi';
import { isMqttHardwareMode } from './mqttConfig';
import {
  disconnectMqtt,
  onMqttStatus,
  subscribeDeviceTopics,
  waitForDeviceStatus,
} from './mqttClient';
import {
  mqttPayloadToDeviceInfo,
  mqttPayloadToDeviceStatus,
  mqttPostMotor,
  mqttPostReset,
  mqttPostStop,
  mqttPostTare,
  mqttPostTherapy,
} from './mqttApi';

export type { MotorSide };

const DEVICE_IP_KEY = 'kneejoy_device_ip';
const DEVICE_ID_KEY = 'kneejoy_device_id';

export function getStoredDeviceIp(): string {
  if (typeof window === 'undefined') return '';
  return (
    localStorage.getItem(DEVICE_IP_KEY) ??
    import.meta.env.VITE_DEVICE_IP ??
    ''
  ).trim();
}

export function setStoredDeviceIp(ip: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEVICE_IP_KEY, ip.trim());
}

export function getStoredDeviceId(): string {
  if (typeof window === 'undefined') return '';
  return (
    localStorage.getItem(DEVICE_ID_KEY) ??
    import.meta.env.VITE_DEVICE_ID ??
    ''
  ).trim();
}

export function setStoredDeviceId(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEVICE_ID_KEY, id.trim());
}

export function getStoredDeviceTarget(): string {
  return isMqttHardwareMode() ? getStoredDeviceId() : getStoredDeviceIp();
}

export function setStoredDeviceTarget(value: string): void {
  if (isMqttHardwareMode()) setStoredDeviceId(value);
  else setStoredDeviceIp(value);
}

export function resolveDeviceBaseUrl(override?: string): string {
  const ip = (override ?? getStoredDeviceIp()).trim();
  if (!ip) {
    throw new Error('请先在联调面板填写 ESP32 局域网 IP（如 192.168.1.100）');
  }
  return ip.startsWith('http') ? ip.replace(/\/+$/, '') : `http://${ip}`;
}

function resolveDeviceId(override?: string): string {
  const id = (override ?? getStoredDeviceId()).trim();
  if (!id) {
    throw new Error('请先在联调面板填写设备 ID（串口 mqtt: id=kj_xxx）');
  }
  return id;
}

export function statusToHardwarePatch(status: DeviceStatus): Partial<HardwareState> {
  const running =
    !status.estop &&
    (status.force_l >= 1 || status.force_r >= 1 || status.heater_duty > 0);

  return {
    is_mock_mode: false,
    connection: 'wifi',
    is_running: running,
    left_force: Math.round(status.force_l),
    right_force: Math.round(status.force_r),
    temp: Math.round(status.temp),
    is_safety_clip_attached: !status.estop,
  };
}

/** 1Hz 遥测刷新：只更新力/温/急停等读数，不改 is_running（避免误触发 stop/therapy） */
export function statusToTelemetryPatch(status: DeviceStatus): Partial<HardwareState> {
  const { is_running: _ignored, ...patch } = statusToHardwarePatch(status);
  return {
    ...patch,
    estop: status.estop,
    sw_estop: status.sw_estop,
    hw_estop: status.hw_estop ?? (status.estop && !status.sw_estop),
    device_fault: status.fault,
  };
}

export class DeviceController {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private mqttStatusOff: (() => void) | null = null;
  private mqttStatusCallback: ((status: DeviceStatus) => void) | null = null;
  private mqttListenerDeviceId: string | null = null;
  private lastInfo: DeviceInfo | null = null;
  private lastStatus: DeviceStatus | null = null;

  get deviceInfo(): DeviceInfo | null {
    return this.lastInfo;
  }

  get lastDeviceStatus(): DeviceStatus | null {
    return this.lastStatus;
  }

  private applyMqttStatus(raw: Record<string, unknown>): void {
    const hasForce = 'force_l' in raw || 'force_r' in raw;
    if (!hasForce) {
      if (raw.ip && this.lastStatus) {
        this.lastStatus = { ...this.lastStatus, ip: String(raw.ip) };
      }
      if (raw.name || raw.type) {
        this.lastInfo = mqttPayloadToDeviceInfo(raw);
      }
      return;
    }
    this.lastStatus = mqttPayloadToDeviceStatus(raw);
    if (raw.name || raw.type) {
      this.lastInfo = mqttPayloadToDeviceInfo(raw);
    }
  }

  private notifyMqttStatus(): void {
    if (this.lastStatus && this.mqttStatusCallback) {
      this.mqttStatusCallback(this.lastStatus);
    }
  }

  private ensureMqttListener(deviceId: string): void {
    if (this.mqttStatusOff && this.mqttListenerDeviceId === deviceId) {
      return;
    }
    if (this.mqttStatusOff) {
      this.mqttStatusOff();
      this.mqttStatusOff = null;
    }
    this.mqttListenerDeviceId = deviceId;
    this.mqttStatusOff = onMqttStatus((topic, data) => {
      if (!topic.includes(deviceId) || !topic.endsWith('/status')) return;
      if (data && typeof data === 'object') {
        this.applyMqttStatus(data as Record<string, unknown>);
        this.notifyMqttStatus();
      }
    });
  }

  async connect(target?: string): Promise<{ info: DeviceInfo; status: DeviceStatus }> {
    if (isMqttHardwareMode()) {
      const deviceId = resolveDeviceId(target);
      /* 先注册等待，再订阅，避免错过 broker 保留的 status 消息 */
      const statusPromise = waitForDeviceStatus(deviceId);
      await subscribeDeviceTopics(deviceId);
      this.ensureMqttListener(deviceId);
      const raw = (await statusPromise) as Record<string, unknown>;
      this.applyMqttStatus(raw);
      this.lastInfo = mqttPayloadToDeviceInfo(raw);
      if (this.lastInfo.type !== 'knee_therapy') {
        throw new Error(`设备类型不匹配：${this.lastInfo.type}`);
      }
      return { info: this.lastInfo, status: this.lastStatus! };
    }

    const url = resolveDeviceBaseUrl(target);
    const result = await pingDevice(url);
    this.lastInfo = result.info;
    this.lastStatus = result.status;
    return result;
  }

  async startTherapy(
    params: Pick<TreatmentParams, 'left_force' | 'right_force' | 'temp' | 'vibration'>,
    target?: string
  ): Promise<void> {
    const body = {
      left: params.left_force,
      right: params.right_force,
      temp: params.temp,
      vib: Math.min(2, Math.max(0, params.vibration)) as 0 | 1 | 2,
    };
    if (isMqttHardwareMode()) {
      const id = resolveDeviceId(target);
      const res = await mqttPostTherapy(id, body);
      if (!res.ok) throw new Error(res.error ?? '下发失败');
      await this.pollOnce(id);
      return;
    }
    const url = resolveDeviceBaseUrl(target);
    await postTherapy(url, body);
    this.lastStatus = await getDeviceStatus(url);
  }

  async stop(target?: string): Promise<void> {
    if (isMqttHardwareMode()) {
      const id = resolveDeviceId(target);
      const res = await mqttPostStop(id);
      if (!res.ok) throw new Error(res.error ?? '急停失败');
      await this.pollOnce(id);
      return;
    }
    const url = resolveDeviceBaseUrl(target);
    await postStop(url);
    this.lastStatus = await getDeviceStatus(url);
  }

  async reset(target?: string): Promise<void> {
    if (isMqttHardwareMode()) {
      const id = resolveDeviceId(target);
      const res = await mqttPostReset(id);
      if (!res.ok) throw new Error(res.error ?? '复位失败');
      await this.pollOnce(id);
      return;
    }
    const url = resolveDeviceBaseUrl(target);
    await postReset(url);
    this.lastStatus = await getDeviceStatus(url);
  }

  async tare(target?: string): Promise<void> {
    if (isMqttHardwareMode()) {
      const id = resolveDeviceId(target);
      const res = await mqttPostTare(id);
      if (!res.ok) throw new Error(res.error ?? '去皮失败');
      await this.pollOnce(id);
      return;
    }
    const url = resolveDeviceBaseUrl(target);
    await postTare(url);
    this.lastStatus = await getDeviceStatus(url);
  }

  async retractMotor(side: MotorSide, target?: string): Promise<void> {
    if (isMqttHardwareMode()) {
      const id = resolveDeviceId(target);
      const res = await mqttPostMotor(id, side, 'retract');
      if (!res.ok) throw new Error(res.error ?? '缩回失败');
      await this.pollOnce(id);
      return;
    }
    const url = resolveDeviceBaseUrl(target);
    if (side === 'all') {
      await postMotor(url, 'left', 'retract');
      const res = await postMotor(url, 'right', 'retract');
      if (!res.ok) throw new Error(res.error ?? '缩回失败');
    } else {
      const res = await postMotor(url, side, 'retract');
      if (!res.ok) throw new Error(res.error ?? '缩回失败');
    }
    this.lastStatus = await getDeviceStatus(url);
  }

  async stopMotorRetract(side: MotorSide = 'all', target?: string): Promise<void> {
    if (isMqttHardwareMode()) {
      const id = resolveDeviceId(target);
      const res = await mqttPostMotor(id, side, 'stop');
      if (!res.ok) throw new Error(res.error ?? '停止缩回失败');
      await this.pollOnce(id);
      return;
    }
    const url = resolveDeviceBaseUrl(target);
    await postMotor(url, side, 'stop');
    this.lastStatus = await getDeviceStatus(url);
  }

  async pollOnce(target?: string): Promise<DeviceStatus> {
    if (isMqttHardwareMode()) {
      if (this.lastStatus) return this.lastStatus;
      const id = resolveDeviceId(target);
      const raw = (await waitForDeviceStatus(id, 5000)) as Record<string, unknown>;
      this.applyMqttStatus(raw);
      return this.lastStatus!;
    }
    const url = resolveDeviceBaseUrl(target);
    this.lastStatus = await getDeviceStatus(url);
    return this.lastStatus;
  }

  startPolling(onStatus: (status: DeviceStatus) => void, intervalMs = 1000, target?: string): void {
    this.stopPolling();
    if (isMqttHardwareMode()) {
      const id = resolveDeviceId(target);
      this.mqttStatusCallback = onStatus;
      this.ensureMqttListener(id);
      void subscribeDeviceTopics(id).catch(() => undefined);
      if (this.lastStatus) onStatus(this.lastStatus);
      return;
    }
    const tick = async () => {
      try {
        const status = await this.pollOnce(target);
        onStatus(status);
      } catch {
        /* 轮询失败不打断 UI */
      }
    };
    void tick();
    this.pollTimer = setInterval(tick, intervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.mqttStatusCallback = null;
  }

  async disconnectMqtt(): Promise<void> {
    this.stopPolling();
    if (this.mqttStatusOff) {
      this.mqttStatusOff();
      this.mqttStatusOff = null;
    }
    this.mqttListenerDeviceId = null;
    await disconnectMqtt();
  }

  formatAlert(status: DeviceStatus): string | null {
    if (status.estop) {
      return status.sw_estop
        ? '设备处于软件急停，请先复位或重新下发治疗参数'
        : '设备处于硬件急停，请检查急停按钮';
    }
    if (status.fault !== 0) return `设备故障：${faultLabel(status.fault)}`;
    if (status.heater_blocked) return '热垫超温保护已触发，加热已禁用';
    if (status.motor_l_end !== 0 || status.motor_r_end !== 0) {
      return '推杆已到达末端保护位置';
    }
    return null;
  }
}

export const deviceController = new DeviceController();
