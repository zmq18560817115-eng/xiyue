/** EMQX Cloud WebSocket（浏览器用 wss，端口见控制台，Serverless 常见 8084） */
export function getMqttBrokerUrl(): string {
  return (
    import.meta.env.VITE_MQTT_URL ??
    'wss://ae98d3ea.ala.cn-hangzhou.emqxsl.cn:8084/mqtt'
  ).trim();
}

export function getMqttUsername(): string {
  return (import.meta.env.VITE_MQTT_USERNAME ?? '').trim();
}

export function getMqttPassword(): string {
  return (import.meta.env.VITE_MQTT_PASSWORD ?? '').trim();
}

export function getMqttTopicPrefix(): string {
  return (import.meta.env.VITE_MQTT_TOPIC_PREFIX ?? 'kneejoy').trim();
}

export function isMqttHardwareMode(): boolean {
  return (import.meta.env.VITE_HARDWARE_MODE ?? 'mock') === 'mqtt';
}

export function topicCmd(deviceId: string): string {
  return `${getMqttTopicPrefix()}/${deviceId}/cmd`;
}

export function topicStatus(deviceId: string): string {
  return `${getMqttTopicPrefix()}/${deviceId}/status`;
}

export function topicAck(deviceId: string): string {
  return `${getMqttTopicPrefix()}/${deviceId}/ack`;
}

export function topicFault(deviceId: string): string {
  return `${getMqttTopicPrefix()}/${deviceId}/fault`;
}
