import mqtt, { type MqttClient } from 'mqtt';
import {
  getMqttBrokerUrl,
  getMqttPassword,
  getMqttUsername,
  topicAck,
  topicCmd,
  topicFault,
  topicStatus,
} from './mqttConfig';

export interface MqttAckMessage {
  ok: boolean;
  action?: string;
  error?: string;
}

type StatusHandler = (topic: string, payload: unknown) => void;
type AckHandler = (deviceId: string, ack: MqttAckMessage) => void;

let client: MqttClient | null = null;
let connectPromise: Promise<MqttClient> | null = null;
const statusHandlers = new Set<StatusHandler>();
const ackHandlers = new Set<AckHandler>();
const subscribedDevices = new Set<string>();
let disconnectRequested = false;

function logMqttEvent(event: string, details?: Record<string, unknown>): void {
  if (details) {
    console.log(`[mqtt] ${event}`, details);
    return;
  }
  console.log(`[mqtt] ${event}`);
}

function extractDeviceIdFromTopic(topic: string, suffix: string): string | null {
  const parts = topic.split('/');
  if (parts.length < 3) return null;
  if (parts[parts.length - 1] !== suffix) return null;
  return parts.slice(1, -1).join('/') || parts[parts.length - 2] || null;
}

function parseJsonPayload(payload: Buffer): unknown {
  try {
    return JSON.parse(payload.toString('utf8'));
  } catch {
    return null;
  }
}

function attachClientHandlers(c: MqttClient): void {
  c.on('connect', () => {
    disconnectRequested = false;
    logMqttEvent('connected', {
      connected: c.connected,
      reconnecting: c.reconnecting,
      subscribedDevices: Array.from(subscribedDevices),
    });
  });

  c.on('reconnect', () => {
    logMqttEvent('reconnecting', {
      connected: c.connected,
      subscribedDevices: Array.from(subscribedDevices),
    });
  });

  c.on('offline', () => {
    console.warn('[mqtt] offline', {
      connected: c.connected,
      reconnecting: c.reconnecting,
      disconnectRequested,
      subscribedDevices: Array.from(subscribedDevices),
    });
  });

  c.on('close', () => {
    console.warn('[mqtt] closed', {
      connected: c.connected,
      reconnecting: c.reconnecting,
      disconnectRequested,
      subscribedDevices: Array.from(subscribedDevices),
    });
  });

  c.on('end', () => {
    logMqttEvent('ended', {
      disconnectRequested,
      subscribedDevices: Array.from(subscribedDevices),
    });
  });

  c.on('error', (err) => {
    console.error('[mqtt] error', {
      message: err.message,
      connected: c.connected,
      reconnecting: c.reconnecting,
      disconnectRequested,
    });
  });

  c.on('message', (topic, payload) => {
    const data = parseJsonPayload(payload);
    if (data == null) return;

    if (topic.endsWith('/status')) {
      for (const h of statusHandlers) h(topic, data);
      return;
    }
    if (topic.endsWith('/ack')) {
      const deviceId = extractDeviceIdFromTopic(topic, 'ack');
      if (!deviceId) return;
      const ack = data as MqttAckMessage;
      for (const h of ackHandlers) h(deviceId, ack);
      return;
    }
    if (topic.endsWith('/fault')) {
      for (const h of statusHandlers) h(topic, data);
    }
  });
}

export function isMqttConnected(): boolean {
  return client?.connected === true;
}

export async function ensureMqttConnected(): Promise<MqttClient> {
  if (client?.connected) return client;
  if (connectPromise) return connectPromise;
  disconnectRequested = false;

  const url = getMqttBrokerUrl();
  const username = getMqttUsername();
  const password = getMqttPassword();
  if (!username || !password) {
    throw new Error('请在 .env.local 配置 VITE_MQTT_USERNAME / VITE_MQTT_PASSWORD');
  }

  connectPromise = new Promise((resolve, reject) => {
    const c = mqtt.connect(url, {
      username,
      password,
      clientId: `kneejoy_web_${Math.random().toString(16).slice(2, 10)}`,
      clean: true,
      reconnectPeriod: 3000,
      connectTimeout: 15000,
    });

    const onConnect = () => {
      cleanup();
      client = c;
      attachClientHandlers(c);
      connectPromise = null;
      resolve(c);
    };

    const onError = (err: Error) => {
      cleanup();
      connectPromise = null;
      reject(new Error(`MQTT 连接失败：${err.message}`));
    };

    const cleanup = () => {
      c.off('connect', onConnect);
      c.off('error', onError);
    };

    c.once('connect', onConnect);
    c.once('error', onError);
  });

  return connectPromise;
}

export async function disconnectMqtt(): Promise<void> {
  disconnectRequested = true;
  subscribedDevices.clear();
  if (client) {
    await new Promise<void>((resolve) => {
      client!.end(false, {}, () => resolve());
    });
    client = null;
  }
  connectPromise = null;
}

export async function subscribeDeviceTopics(deviceId: string): Promise<void> {
  const c = await ensureMqttConnected();
  if (subscribedDevices.has(deviceId)) return;

  const topics = [topicStatus(deviceId), topicAck(deviceId), topicFault(deviceId)];
  await Promise.all(
    topics.map(
      (t) =>
        new Promise<void>((resolve, reject) => {
          c.subscribe(t, { qos: 1 }, (err) => (err ? reject(err) : resolve()));
        })
    )
  );
  subscribedDevices.add(deviceId);
}

export function publishCmd(deviceId: string, payload: object): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const c = await ensureMqttConnected();
      c.publish(topicCmd(deviceId), JSON.stringify(payload), { qos: 1 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

export function onMqttStatus(handler: StatusHandler): () => void {
  statusHandlers.add(handler);
  return () => statusHandlers.delete(handler);
}

export function onMqttAck(handler: AckHandler): () => void {
  ackHandlers.add(handler);
  return () => ackHandlers.delete(handler);
}

export function waitForDeviceStatus(
  deviceId: string,
  timeoutMs = 10000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error('等待设备状态超时，请确认设备已联网且 MQTT 已连接'));
    }, timeoutMs);

    const off = onMqttStatus((topic, data) => {
      if (!topic.includes(deviceId) || !topic.endsWith('/status')) return;
      clearTimeout(timer);
      off();
      resolve(data);
    });
  });
}

export function waitForAck(
  deviceId: string,
  action: string,
  timeoutMs = 8000
): Promise<MqttAckMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error(`设备未确认命令「${action}」（ack 超时）`));
    }, timeoutMs);

    const off = onMqttAck((id, ack) => {
      if (id !== deviceId) return;
      if (ack.action && ack.action !== action) return;
      clearTimeout(timer);
      off();
      resolve(ack);
    });
  });
}
