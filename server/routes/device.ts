import { Router } from 'express';
import { consumeDeviceCommand, touchPhysicalDevice } from '../db/device-queue.js';
import { getDb, persist } from '../db/store.js';
import type { DeviceAuthedRequest } from '../middleware/device-auth.js';
import { requireDeviceAuth } from '../middleware/device-auth.js';
import type { HardwareState } from '../types.js';

const router = Router();

/** 设备自检：ESP32 连上 Wi-Fi 后先调这个 */
router.get('/ping', requireDeviceAuth, (req: DeviceAuthedRequest, res) => {
  touchPhysicalDevice(req.physicalDevice!.device_id);
  res.json({
    ok: true,
    device_id: req.physicalDevice!.device_id,
    patient_id: req.physicalDevice!.patient_id,
    message: 'KneeJoy 设备通道已连通',
  });
});

/** ESP32 轮询：取走下一条待执行命令 */
router.get('/commands', requireDeviceAuth, (req: DeviceAuthedRequest, res) => {
  const physical = req.physicalDevice!;
  const cmd = consumeDeviceCommand(physical.device_id);
  touchPhysicalDevice(physical.device_id);

  const db = getDb();
  const patientDevice = db.devices[physical.patient_id];
  if (patientDevice && cmd.command !== 'NONE') {
    patientDevice.connection = 'wifi';
  }
  persist();

  res.json(cmd);
});

/** ESP32 上报真实运行状态，同步到患者设备记录 */
router.post('/telemetry', requireDeviceAuth, (req: DeviceAuthedRequest, res) => {
  const physical = req.physicalDevice!;
  const db = getDb();
  const device = db.devices[physical.patient_id];
  if (!device) {
    return res.status(404).json({ error: '患者设备未注册' });
  }

  const updates = req.body as Partial<HardwareState> & { hardware_status?: 'Normal' | 'Error' };
  Object.assign(device, updates, { connection: 'wifi', is_mock_mode: false });
  touchPhysicalDevice(physical.device_id);
  persist();

  res.json({ ok: true, device });
});

export default router;
