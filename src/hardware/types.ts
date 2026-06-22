/**
 * 硬件连接类型 — 对接真实 BLE / Wi-Fi 时保持此契约不变
 */

export type HardwareTransport = 'bluetooth' | 'wifi';

export type ConnectionPhase = 'disconnected' | 'connecting' | 'connected' | 'failed';

export type ConnectionProgressStep =
  | 'scanning'
  | 'pairing'
  | 'handshaking'
  | 'ready';

export interface HardwareDeviceInfo {
  transport: HardwareTransport;
  deviceName: string;
  deviceId: string;
  batteryLevel: number;
  firmwareVersion?: string;
}

export interface ConnectResult {
  success: boolean;
  device?: HardwareDeviceInfo;
  error?: string;
}

export interface ConnectionProgress {
  step: ConnectionProgressStep;
  message: string;
}

/**
 * 真实硬件接入时实现此接口并调用 setHardwareAdapter() 替换 Mock
 */
export interface HardwareConnectionAdapter {
  readonly name: string;
  connect(
    transport: HardwareTransport,
    onProgress?: (progress: ConnectionProgress) => void
  ): Promise<ConnectResult>;
  disconnect(): Promise<void>;
}

export const CONNECTION_PROGRESS_LABELS: Record<ConnectionProgressStep, string> = {
  scanning: '正在搜索附近的膝悦理疗仪…',
  pairing: '正在配对设备，请稍候…',
  handshaking: '正在同步设备参数与安全握手…',
  ready: '连接成功',
};
