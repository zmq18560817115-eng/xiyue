import type { DeviceCommand, DeviceCommandType, PhysicalDevice, TreatmentParams } from '../types.js';
import { generateId } from './store.js';
import { getDb, persist } from './store.js';

export function ensurePhysicalDevices(): void {
  const db = getDb();
  if (!db.physical_devices) {
    db.physical_devices = [];
    persist();
  }
}

export function findPhysicalDevice(deviceId: string, token: string): PhysicalDevice | null {
  ensurePhysicalDevices();
  const device = getDb().physical_devices.find(
    (d) => d.device_id === deviceId && d.token === token,
  );
  return device ?? null;
}

export function findPhysicalDeviceByPatient(patientId: string): PhysicalDevice | null {
  ensurePhysicalDevices();
  return getDb().physical_devices.find((d) => d.patient_id === patientId) ?? null;
}

export function queueDeviceCommand(
  patientId: string,
  command: DeviceCommandType,
  params?: Partial<TreatmentParams> & { max_force_limit?: number },
): DeviceCommand | null {
  ensurePhysicalDevices();
  const db = getDb();
  const physical = db.physical_devices.find((d) => d.patient_id === patientId);
  if (!physical) return null;

  const device = db.devices[patientId];
  const cmd: DeviceCommand = {
    id: generateId('dcmd'),
    command,
    left_force: params?.left_force ?? device?.left_force,
    right_force: params?.right_force ?? device?.right_force,
    temp: params?.temp ?? device?.temp,
    vibration: params?.vibration ?? device?.vibration,
    duration: params?.duration ?? device?.duration,
    max_force_limit: params?.max_force_limit ?? device?.max_force_limit,
    issued_at: new Date().toISOString(),
  };
  physical.pending_command = cmd;
  persist();
  return cmd;
}

export function consumeDeviceCommand(deviceId: string): DeviceCommand {
  ensurePhysicalDevices();
  const physical = getDb().physical_devices.find((d) => d.device_id === deviceId);
  if (!physical?.pending_command) {
    return {
      id: 'none',
      command: 'NONE',
      issued_at: new Date().toISOString(),
    };
  }
  const cmd = physical.pending_command;
  physical.pending_command = null;
  persist();
  return cmd;
}

export function touchPhysicalDevice(deviceId: string): void {
  ensurePhysicalDevices();
  const physical = getDb().physical_devices.find((d) => d.device_id === deviceId);
  if (physical) {
    physical.last_seen_at = new Date().toISOString();
    persist();
  }
}
