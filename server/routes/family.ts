import { Router } from 'express';
import {
  generateId,
  getDb,
  normalizePhone,
  persist,
} from '../db/store.js';
import type { AuthedRequest } from '../middleware/auth.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { countCompletedLogsInRange } from '../db/therapy.js';
import { todayString } from '../db/store.js';
import { getPatientUserId, pushNotification } from '../services/notifications.js';

const router = Router();

router.post('/bindings/phone', requireAuth, requireRole('family'), (req: AuthedRequest, res) => {
  const { patient_phone } = req.body as { patient_phone?: string };
  if (!patient_phone) return res.status(400).json({ error: '请提供 patient_phone' });
  const normalized = normalizePhone(patient_phone);
  const db = getDb();
  const patientUser = db.users.find((u) => u.phone === normalized && u.role === 'patient');
  const patient = patientUser?.patient_id
    ? db.patients.find((p) => p.id === patientUser.patient_id)
    : db.patients.find((p) => normalizePhone(p.phone) === normalized || p.phone.includes(normalized.slice(-4)));

  if (!patient) return res.status(404).json({ error: '未找到该手机号对应的患者' });

  const exists = db.family_bindings.some(
    (b) => b.family_user_id === req.user!.id && b.patient_id === patient.id
  );
  if (exists) {
    return res.json({ message: '已绑定', patient_id: patient.id });
  }

  const binding = {
    id: generateId('bind'),
    family_user_id: req.user!.id,
    patient_id: patient.id,
    patient_name: patient.name,
    patient_phone: patient.phone,
    remind_status: false,
    emergency_contact: true,
    created_at: new Date().toISOString(),
  };
  db.family_bindings.push(binding);
  persist();
  res.status(201).json(binding);
});

router.post('/bindings/qr', requireAuth, requireRole('family'), (req: AuthedRequest, res) => {
  const { qr_token } = req.body as { qr_token?: string };
  if (!qr_token) return res.status(400).json({ error: '请提供 qr_token' });
  const db = getDb();
  const tokenData = db.bind_qr_tokens[qr_token];
  if (!tokenData) return res.status(404).json({ error: 'QR token 无效' });
  if (new Date(tokenData.expires_at) < new Date()) {
    return res.status(410).json({ error: 'QR token 已过期' });
  }
  const patient = db.patients.find((p) => p.id === tokenData.patient_id);
  if (!patient) return res.status(404).json({ error: '患者不存在' });

  const exists = db.family_bindings.some(
    (b) => b.family_user_id === req.user!.id && b.patient_id === patient.id
  );
  if (!exists) {
    db.family_bindings.push({
      id: generateId('bind'),
      family_user_id: req.user!.id,
      patient_id: patient.id,
      patient_name: patient.name,
      patient_phone: patient.phone,
      remind_status: false,
      emergency_contact: true,
      created_at: new Date().toISOString(),
    });
    delete db.bind_qr_tokens[qr_token];
    persist();
  }
  res.status(201).json({ patient_id: patient.id, patient_name: patient.name });
});

router.get('/bindings', requireAuth, requireRole('family'), (req: AuthedRequest, res) => {
  const bindings = getDb().family_bindings.filter((b) => b.family_user_id === req.user!.id);
  res.json({ bindings });
});

router.get('/patients/:id/device-status', requireAuth, requireRole('family'), (req: AuthedRequest, res) => {
  const binding = getDb().family_bindings.find(
    (b) => b.family_user_id === req.user!.id && b.patient_id === req.params.id
  );
  if (!binding) return res.status(403).json({ error: '未绑定该患者' });
  const db = getDb();
  const device = db.devices[req.params.id];
  const patient = db.patients.find((p) => p.id === req.params.id);
  if (!device || !patient) return res.status(404).json({ error: '患者或设备不存在' });
  const today = todayString();
  const todayLog = db.therapy_logs.find(
    (l) => l.patient_id === req.params.id && l.therapy_date === today
  );
  res.json({
    patient: { id: patient.id, name: patient.name },
    device,
    hardware_status: todayLog?.hardware_status ?? 'Normal',
    remind_sent: binding.remind_status ?? false,
  });
});

router.get('/patients/:id/check-ins/stats', requireAuth, requireRole('family'), (req: AuthedRequest, res) => {
  const binding = getDb().family_bindings.find(
    (b) => b.family_user_id === req.user!.id && b.patient_id === req.params.id
  );
  if (!binding) return res.status(403).json({ error: '未绑定该患者' });
  const patient = getDb().patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: '患者不存在' });

  const today = todayString();
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  const startStr = weekStart.toISOString().slice(0, 10);
  const weekCompleted = countCompletedLogsInRange(req.params.id, startStr, today);
  const weekRate = Math.round((weekCompleted / 7) * 100);

  res.json({
    total_check_ins: patient.check_in_dates.length,
    attendance_rate: patient.attendance_rate,
    check_in_dates: patient.check_in_dates,
    weekly_completed: weekCompleted,
    weekly_rate: weekRate,
    weekly: [
      { label: '第一周', value: 30 },
      { label: '第二周', value: 50 },
      { label: '第三周', value: 85 },
      { label: '本周依从', value: weekRate },
    ],
  });
});

router.post('/patients/:id/nudges', requireAuth, requireRole('family'), (req: AuthedRequest, res) => {
  const binding = getDb().family_bindings.find(
    (b) => b.family_user_id === req.user!.id && b.patient_id === req.params.id
  );
  if (!binding) return res.status(403).json({ error: '未绑定该患者' });
  const { message } = req.body as { message?: string };
  if (!message) return res.status(400).json({ error: '请提供 message' });
  const db = getDb();
  const nudge = {
    id: generateId('nudge'),
    family_user_id: req.user!.id,
    patient_id: req.params.id,
    message,
    read: false,
    created_at: new Date().toISOString(),
  };
  db.nudges.push(nudge);
  binding.remind_status = true;

  const patientUserId = getPatientUserId(req.params.id);
  if (patientUserId) {
    pushNotification({
      user_id: patientUserId,
      type: 'nudge',
      title: '来自家属端的远程关怀温馨提醒',
      message: `家属关怀：'${message}'。立刻进入康复打卡并记录今天的天气保护。`,
      action_by: req.user!.name,
    });
  }
  persist();
  res.status(201).json(nudge);
});

router.get('/patients/:id/alarms/active', requireAuth, requireRole('family'), (req: AuthedRequest, res) => {
  const binding = getDb().family_bindings.find(
    (b) => b.family_user_id === req.user!.id && b.patient_id === req.params.id
  );
  if (!binding) return res.status(403).json({ error: '未绑定该患者' });
  const device = getDb().devices[req.params.id];
  if (!device) return res.status(404).json({ error: '设备不存在' });
  const active = !device.is_safety_clip_attached;
  res.json({
    active,
    alarm: active
      ? {
          type: 'safety_clip_detached',
          message: '防夹空载保护脱落，设备已进入紧急放气降压锁闭',
        }
      : null,
  });
});

router.get('/devices', requireAuth, requireRole('family'), (req: AuthedRequest, res) => {
  const bindings = getDb().family_bindings.filter((b) => b.family_user_id === req.user!.id);
  const devices = bindings.map((b) => {
    const device = getDb().devices[b.patient_id];
    return {
      binding: b,
      device,
      online: device?.connection !== 'disconnected',
    };
  });
  res.json({ devices });
});

export default router;
