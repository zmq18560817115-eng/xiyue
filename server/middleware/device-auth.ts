import type { Request, Response, NextFunction } from 'express';
import { findPhysicalDevice } from '../db/device-queue.js';
import type { PhysicalDevice } from '../types.js';

export interface DeviceAuthedRequest extends Request {
  physicalDevice?: PhysicalDevice;
}

export function requireDeviceAuth(req: DeviceAuthedRequest, res: Response, next: NextFunction) {
  const deviceId = req.header('X-Device-Id') ?? req.header('x-device-id');
  const token = req.header('X-Device-Token') ?? req.header('x-device-token');

  if (!deviceId || !token) {
    return res.status(401).json({ error: '缺少设备凭证 X-Device-Id / X-Device-Token' });
  }

  const physical = findPhysicalDevice(deviceId, token);
  if (!physical) {
    return res.status(401).json({ error: '设备 ID 或 Token 无效' });
  }

  req.physicalDevice = physical;
  next();
}
