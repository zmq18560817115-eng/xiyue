import {
  deviceController,
  getStoredDeviceId,
  setStoredDeviceId,
} from './deviceController';
import type {
  ConnectResult,
  ConnectionProgress,
  HardwareConnectionAdapter,
  HardwareTransport,
} from './types';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 经 EMQX Cloud MQTT 连接真实硬件 */
export class MqttHardwareAdapter implements HardwareConnectionAdapter {
  readonly name = 'mqtt';

  async connect(
    transport: HardwareTransport,
    onProgress?: (progress: ConnectionProgress) => void
  ): Promise<ConnectResult> {
    if (transport !== 'wifi') {
      if (transport !== 'bluetooth') {
        return { success: false, error: 'MQTT 模式请使用 Wi-Fi / 云端连接入口' };
      }
    }

    const deviceId = getStoredDeviceId();
    if (!deviceId) {
      return {
        success: false,
        error: '请先在「硬件联调」填写设备 ID（串口 mqtt: connected, id=kj_xxx）',
      };
    }

    onProgress?.({ step: 'scanning', message: '正在连接 EMQX Cloud…' });
    await delay(200);
    onProgress?.({ step: 'pairing', message: `等待设备 ${deviceId}…` });

    try {
      const { info } = await deviceController.connect(deviceId);
      setStoredDeviceId(deviceId);
      onProgress?.({ step: 'ready', message: 'MQTT 连接成功' });
      return {
        success: true,
        device: {
          transport: 'wifi',
          deviceName: info.name || 'KneeJoy 理疗仪',
          deviceId,
          batteryLevel: 100,
          firmwareVersion: info.version,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'MQTT 连接失败',
      };
    }
  }

  async disconnect(): Promise<void> {
    await deviceController.disconnectMqtt();
    await delay(100);
  }
}
