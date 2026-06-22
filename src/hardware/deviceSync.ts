import type { HardwareState } from '../types';
import { isMqttHardwareMode } from './mqttConfig';

/** 是否应向真实设备下发 therapy/stop 等命令 */
export function canSyncToPhysicalDevice(state: HardwareState): boolean {
  if (state.connection === 'disconnected') return false;
  if (state.is_mock_mode) return false;
  return state.connection === 'wifi';
}

/** 合并后端 device 快照；MQTT 模式下保留浏览器侧 live connection */
export function mergeApiDevice(prev: HardwareState, device: HardwareState): HardwareState {
  if (!isMqttHardwareMode()) return device;
  const { connection: _c, is_mock_mode: _m, ...rest } = device;
  return {
    ...prev,
    ...rest,
    connection: prev.connection,
    is_mock_mode: prev.connection === 'wifi' ? false : prev.is_mock_mode,
  };
}
