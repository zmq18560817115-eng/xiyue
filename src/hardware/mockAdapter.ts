import type {
  ConnectResult,
  ConnectionProgress,
  HardwareConnectionAdapter,
  HardwareTransport,
} from './types';

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('连接已取消'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('连接已取消'));
      },
      { once: true }
    );
  });
}

/**
 * 模拟硬件连接 — 开发/演示用。接入真实驱动后替换为 BleAdapter / WifiAdapter
 */
export class MockHardwareAdapter implements HardwareConnectionAdapter {
  readonly name = 'mock';

  async connect(
    transport: HardwareTransport,
    onProgress?: (progress: ConnectionProgress) => void
  ): Promise<ConnectResult> {
    const signal = getConnectAbortSignal();

    const steps: ConnectionProgress[] = [
      { step: 'scanning', message: '正在搜索附近的膝悦理疗仪…' },
      { step: 'pairing', message: '正在配对设备，请稍候…' },
      { step: 'handshaking', message: '正在同步设备参数与安全握手…' },
    ];

    for (const progress of steps) {
      onProgress?.(progress);
      await delay(900, signal);
    }

    onProgress?.({ step: 'ready', message: '连接成功' });

    return {
      success: true,
      device: {
        transport,
        deviceName: '膝悦 KneeJoy 理疗仪',
        deviceId: `mock-${transport}-${Date.now()}`,
        batteryLevel: 92 + Math.floor(Math.random() * 8),
        firmwareVersion: '1.2.0-mock',
      },
    };
  }

  async disconnect(): Promise<void> {
    await delay(400);
  }
}

let connectAbortController: AbortController | null = null;

export function getConnectAbortSignal(): AbortSignal {
  if (!connectAbortController) {
    connectAbortController = new AbortController();
  }
  return connectAbortController.signal;
}

export function beginConnectSession(): void {
  connectAbortController?.abort();
  connectAbortController = new AbortController();
}

export function cancelMockConnect(): void {
  connectAbortController?.abort();
  connectAbortController = null;
}
