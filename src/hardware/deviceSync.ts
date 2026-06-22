import type { HardwareState } from '../types';
import { isMqttHardwareMode } from './mqttConfig';

/** 浏览器侧 MQTT/Wi-Fi 已连通，可直发 therapy/stop */
export function canSyncToPhysicalDevice(state: HardwareState): boolean {
  if (state.connection === 'disconnected') return false;
  if (state.is_mock_mode) return false;
  return state.connection === 'wifi';
}

/** Render 云端 API 中继：ESP32 轮询 /device/commands，不依赖浏览器 MQTT */
export function canRelayViaCloudApi(apiOnline: boolean): boolean {
  return apiOnline && isMqttHardwareMode();
}

/** 是否允许患者端点击「开始治疗」 */
export function canStartTherapy(state: HardwareState, apiOnline: boolean): boolean {
  return canSyncToPhysicalDevice(state) || canRelayViaCloudApi(apiOnline);
}

/** 合并后端 device 快照；MQTT 模式下保留浏览器 live 连接，否则采用云端 wifi 中继态 */
export function mergeApiDevice(prev: HardwareState, device: HardwareState): HardwareState {
  if (!isMqttHardwareMode()) return device;
  const { connection: apiConnection, is_mock_mode: _m, ...rest } = device;
  const liveMqtt = prev.connection === 'wifi';
  const cloudWifi = apiConnection === 'wifi';
  return {
    ...prev,
    ...rest,
    connection: liveMqtt ? prev.connection : cloudWifi ? 'wifi' : prev.connection,
    is_mock_mode: liveMqtt || cloudWifi ? false : prev.is_mock_mode,
  };
}
