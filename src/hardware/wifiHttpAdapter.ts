import { deviceController, getStoredDeviceIp, setStoredDeviceIp } from './deviceController';
import type {
  ConnectResult,
  ConnectionProgress,
  HardwareConnectionAdapter,
  HardwareTransport,
} from './types';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 通过 ESP32 局域网 HTTP API 连接真实硬件
 */
export class WifiHttpAdapter implements HardwareConnectionAdapter {
  readonly name = 'wifi-http';

  async connect(
    transport: HardwareTransport,
    onProgress?: (progress: ConnectionProgress) => void
  ): Promise<ConnectResult> {
    if (transport !== 'wifi') {
      return { success: false, error: '当前适配器仅支持 Wi-Fi 直连' };
    }

    const ip = getStoredDeviceIp();
    if (!ip) {
      return {
        success: false,
        error: '请先在「硬件联调」面板填写 ESP32 IP（如 192.168.1.100）',
      };
    }

    onProgress?.({ step: 'scanning', message: `正在连接 ${ip}…` });
    await delay(300);

    onProgress?.({ step: 'pairing', message: '正在读取设备信息…' });
    await delay(300);

    try {
      onProgress?.({ step: 'handshaking', message: '正在同步传感器状态…' });
      const { info, status } = await deviceController.connect(ip);
      setStoredDeviceIp(status.ip || ip);

      onProgress?.({ step: 'ready', message: '连接成功' });

      return {
        success: true,
        device: {
          transport: 'wifi',
          deviceName: info.name || 'KneeJoy 理疗仪',
          deviceId: `${info.model}-${status.ip || ip}`,
          batteryLevel: 100,
          firmwareVersion: info.version,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Wi-Fi 设备连接失败',
      };
    }
  }

  async disconnect(): Promise<void> {
    deviceController.stopPolling();
    await delay(200);
  }
}
