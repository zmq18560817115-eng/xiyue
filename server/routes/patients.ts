import { Router } from 'express';
import {
  generateId,
  getDb,
  persist,
  todayString,
} from '../db/store.js';
import type { AuthedRequest } from '../middleware/auth.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  getTodayTherapyLog,
  mapSessionSourceToMode,
  upsertTodayTherapyLog,
} from '../db/therapy.js';
import { calculateEuclideanMatch } from '../services/match.js';
import { pushNotification } from '../services/notifications.js';
import { queueDeviceCommand } from '../db/device-queue.js';
import type { SymptomInput, TreatmentParams, TreatmentSession } from '../types.js';

const router = Router();

function findRunningSession(patientId: string): TreatmentSession | undefined {
  return getDb().sessions.find((s) => s.patient_id === patientId && s.status === 'running');
}

function stopRunningSession(session: TreatmentSession, patientId: string) {
  session.status = 'stopped';
  session.ended_at = new Date().toISOString();
  const device = getDb().devices[patientId];
  if (device) device.is_running = false;
}

/** 对齐设备与会话状态，清理「会话 running 但设备已停」的脏数据 */
function reconcileSessionDeviceState(patientId: string): string | null {
  const db = getDb();
  const device = db.devices[patientId];
  if (!device) return null;

  const running = findRunningSession(patientId);
  if (running) {
    if (device.is_running) return running.id;
    stopRunningSession(running, patientId);
    return null;
  }

  if (device.is_running) device.is_running = false;
  return null;
}

function getPatientForUser(userId: string) {
  const db = getDb();
  const user = db.users.find((u) => u.id === userId);
  if (!user?.patient_id) return null;
  return db.patients.find((p) => p.id === user.patient_id) ?? null;
}

function recalcAttendance(patientId: string) {
  const db = getDb();
  const patient = db.patients.find((p) => p.id === patientId);
  if (!patient) return;
  const dates = [...new Set(db.check_ins.filter((c) => c.patient_id === patientId).map((c) => c.date))];
  patient.check_in_dates = dates.sort();
  patient.attendance_rate = Math.min(100, Math.round((dates.length / 4) * 100));
}

function enrichPatientProfile(patient: NonNullable<ReturnType<typeof getPatientForUser>>) {
  const db = getDb();
  if (patient.binding_doctor_id) {
    const doctor = db.doctors.find((d) => d.id === patient.binding_doctor_id);
    if (doctor) patient.binding_doctor_name = doctor.name;
  }
  return patient;
}

router.get('/me', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  res.json(enrichPatientProfile(patient));
});

router.patch('/me/symptoms', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const body = req.body as Partial<SymptomInput> & { onboarding_completed?: boolean };
  if (body.age !== undefined) patient.age = body.age;
  if (body.cartilage_wear !== undefined) patient.cartilage_wear = body.cartilage_wear;
  if (body.joint_fluid !== undefined) patient.joint_fluid = body.joint_fluid;
  if (body.pain_score !== undefined) patient.pain_score = body.pain_score;
  if (body.onboarding_completed !== undefined) {
    patient.onboarding_completed = body.onboarding_completed;
  }
  if (
    body.age !== undefined &&
    body.cartilage_wear !== undefined &&
    body.joint_fluid !== undefined &&
    body.pain_score !== undefined
  ) {
    patient.symptoms_assessed = true;
  }
  persist();
  res.json(patient);
});

router.get('/me/history', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  res.json({ history: patient.history });
});

router.get('/me/check-ins', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const month = req.query.month as string | undefined;
  const db = getDb();
  let checkIns = db.check_ins.filter((c) => c.patient_id === patient.id);
  if (month) checkIns = checkIns.filter((c) => c.date.startsWith(month));
  const therapyLogs = db.therapy_logs.filter((l) => l.patient_id === patient.id);
  const logsForMonth = month
    ? therapyLogs.filter((l) => l.therapy_date.startsWith(month))
    : therapyLogs;
  res.json({
    dates: patient.check_in_dates,
    attendance_rate: patient.attendance_rate,
    check_ins: checkIns,
    therapy_logs: logsForMonth,
  });
});

router.post('/me/check-ins', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const { date, type } = req.body as { date?: string; type?: 'manual' | 'therapy' | 'exercise' };
  const checkDate = date ?? todayString();
  const db = getDb();
  const exists = db.check_ins.some((c) => c.patient_id === patient.id && c.date === checkDate);
  if (!exists) {
    db.check_ins.push({
      id: generateId('ci'),
      patient_id: patient.id,
      date: checkDate,
      type: type ?? 'manual',
      created_at: new Date().toISOString(),
    });
    recalcAttendance(patient.id);
    persist();
  }
  res.status(201).json({ dates: patient.check_in_dates, attendance_rate: patient.attendance_rate });
});

router.get('/me/attendance', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  res.json({
    attendance_rate: patient.attendance_rate,
    streak_days: patient.check_in_dates.length,
    check_in_dates: patient.check_in_dates,
  });
});

router.get('/me/badges', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const count = patient.check_in_dates.length;
  const hasFamily = getDb().family_bindings.some((b) => b.patient_id === patient.id);
  res.json({
    badges: [
      { id: 'badge_1', name: '初出茅庐', unlocked: count >= 1, benefit: '理疗拉力限值+2N' },
      { id: 'badge_2', name: '膝健常青', unlocked: count >= 3, benefit: '开启高频揉合模式' },
      { id: 'badge_3', name: '意志守护', unlocked: count >= 5, benefit: '智能算法优先级高' },
      { id: 'badge_4', name: '孝行自如', unlocked: hasFamily, benefit: '一键督促双向触达' },
    ],
  });
});

router.get('/me/rehab-trends', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  res.json({ trends: patient.history });
});

router.get('/me/device', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const device = getDb().devices[patient.id];
  if (!device) return res.status(404).json({ error: '设备未注册' });
  const activeSessionId = reconcileSessionDeviceState(patient.id);
  persist();
  res.json({ ...device, active_session_id: activeSessionId });
});

router.patch('/me/device/connection', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const { connection } = req.body as { connection?: 'disconnected' | 'bluetooth' | 'wifi' };
  if (!connection) return res.status(400).json({ error: '请提供 connection' });
  const device = getDb().devices[patient.id];
  if (!device) return res.status(404).json({ error: '设备未注册' });
  if (device.is_running && connection === 'disconnected') {
    return res.status(409).json({ error: '理疗进行中，无法断开连接' });
  }
  device.connection = connection;
  if (connection === 'wifi') {
    queueDeviceCommand(patient.id, 'SYNC');
  }
  persist();
  res.json(device);
});

router.patch('/me/device/settings', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const device = getDb().devices[patient.id];
  if (!device) return res.status(404).json({ error: '设备未注册' });
  const { max_force_limit, is_safety_clip_attached } = req.body as {
    max_force_limit?: number;
    is_safety_clip_attached?: boolean;
  };
  if (max_force_limit !== undefined) device.max_force_limit = max_force_limit;
  if (is_safety_clip_attached !== undefined) {
    device.is_safety_clip_attached = is_safety_clip_attached;
    if (!is_safety_clip_attached) {
      device.is_running = false;
      const running = findRunningSession(patient.id);
      if (running) stopRunningSession(running, patient.id);
      const bindings = getDb().family_bindings.filter((b) => b.patient_id === patient.id);
      for (const b of bindings) {
        pushNotification({
          user_id: b.family_user_id,
          type: 'alarm',
          title: '设备安全警报',
          message: `绑定人 [${patient.name}] 膝部理疗仪防夹保护脱落，设备已紧急降压锁闭！`,
        });
      }
    }
  }
  persist();
  res.json(device);
});

router.post('/me/device/telemetry', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const device = getDb().devices[patient.id];
  if (!device) return res.status(404).json({ error: '设备未注册' });
  const updates = req.body as Partial<typeof device> & { hardware_status?: 'Normal' | 'Error' };
  Object.assign(device, updates);

  if (updates.is_running === false) {
    const running = findRunningSession(patient.id);
    if (running) stopRunningSession(running, patient.id);
  }

  if (updates.hardware_status === 'Error' || updates.is_safety_clip_attached === false) {
    upsertTodayTherapyLog(patient.id, { hardware_status: 'Error' });
    const bindings = getDb().family_bindings.filter((b) => b.patient_id === patient.id);
    for (const b of bindings) {
      pushNotification({
        user_id: b.family_user_id,
        type: 'alarm',
        title: '设备安全警报',
        message:
          '警告：设备检测到拉伸力异常，已自动紧急停止，请立刻电话关注家人安全！',
      });
    }
  }
  persist();
  res.json(device);
});

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return phone;
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

router.get('/me/family-bindings', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const db = getDb();
  const bindings = db.family_bindings
    .filter((b) => b.patient_id === patient.id)
    .map((b) => {
      const familyUser = db.users.find((u) => u.id === b.family_user_id);
      return {
        id: b.id,
        family_user_id: b.family_user_id,
        family_name: familyUser?.name ?? '家属',
        family_phone: maskPhone(familyUser?.phone ?? ''),
        emergency_contact: b.emergency_contact ?? false,
      };
    });
  res.json({ bindings });
});

router.get('/me/bind-qr', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const token = generateId('qr');
  const db = getDb();
  db.bind_qr_tokens[token] = {
    patient_id: patient.id,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };
  persist();
  res.json({ qr_token: token, expires_in_seconds: 1800 });
});

function findPrescriptionNotification(
  db: ReturnType<typeof getDb>,
  userId: string,
  rx: { params: TreatmentParams },
  excludeIds?: Set<string>
) {
  return db.notifications.find(
    (n) =>
      (!excludeIds || !excludeIds.has(n.id)) &&
      n.user_id === userId &&
      n.type === 'prescription' &&
      n.message.includes(`左侧 ${rx.params.left_force}N`) &&
      n.message.includes(`右侧 ${rx.params.right_force}N`) &&
      n.message.includes(`${rx.params.temp}℃`)
  );
}

router.get('/me/messages', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const db = getDb();

  const messages: Array<{
    id: string;
    category: 'doctor' | 'family';
    title: string;
    message: string;
    timestamp: string;
    read: boolean;
    action_by?: string;
    prescription_params?: TreatmentParams;
    prescription_id?: string;
    prescription_status?: 'pending' | 'accepted';
    nudge_id?: string;
    notification_id?: string;
  }> = [];

  const usedNotifIds = new Set<string>();

  for (const rx of db.prescriptions.filter((p) => p.patient_id === patient.id)) {
    const doctor = db.doctors.find((d) => d.id === rx.doctor_id);
    const notif = findPrescriptionNotification(db, patient.user_id, rx, usedNotifIds);
    if (notif) usedNotifIds.add(notif.id);
    messages.push({
      id: `rx_${rx.id}`,
      category: 'doctor',
      title: '主治医生下发特制理疗贴方',
      message: `左侧 ${rx.params.left_force}N，右侧 ${rx.params.right_force}N，恒温温热 ${rx.params.temp}℃，理疗 ${rx.params.duration} 分钟`,
      timestamp: rx.created_at,
      read: rx.status === 'accepted' || (notif?.read ?? false),
      action_by: doctor?.name ?? notif?.action_by,
      prescription_params: rx.params,
      prescription_id: rx.id,
      prescription_status: rx.status,
      notification_id: notif?.id,
    });
  }

  for (const nudge of db.nudges.filter((n) => n.patient_id === patient.id)) {
    const familyUser = db.users.find((u) => u.id === nudge.family_user_id);
    const snippet = nudge.message.slice(0, 12);
    const notif = db.notifications.find(
      (n) =>
        !usedNotifIds.has(n.id) &&
        n.user_id === patient.user_id &&
        n.type === 'nudge' &&
        n.message.includes(snippet)
    );
    if (notif) usedNotifIds.add(notif.id);
    messages.push({
      id: `nudge_${nudge.id}`,
      category: 'family',
      title: '来自家属的康复关怀',
      message: nudge.message,
      timestamp: nudge.created_at,
      read: nudge.read || (notif?.read ?? false),
      action_by: familyUser?.name ?? notif?.action_by,
      nudge_id: nudge.id,
      notification_id: notif?.id,
    });
  }

  messages.sort((a, b) => {
    const ta = Date.parse(a.timestamp) || 0;
    const tb = Date.parse(b.timestamp) || 0;
    return tb - ta;
  });

  res.json({ messages });
});

router.patch('/me/messages/:id/read', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const db = getDb();
  const rawId = req.params.id;

  if (rawId.startsWith('rx_')) {
    const rxId = rawId.slice(3);
    const rx = db.prescriptions.find((p) => p.id === rxId && p.patient_id === patient.id);
    if (!rx) return res.status(404).json({ error: '消息不存在' });
    const notif = findPrescriptionNotification(db, patient.user_id, rx);
    if (notif) notif.read = true;
    persist();
    return res.json({ success: true, id: rawId, read: true });
  }

  if (rawId.startsWith('nudge_')) {
    const nudgeId = rawId.slice(6);
    const nudge = db.nudges.find((n) => n.id === nudgeId && n.patient_id === patient.id);
    if (!nudge) return res.status(404).json({ error: '消息不存在' });
    nudge.read = true;
    const snippet = nudge.message.slice(0, 12);
    const notif = db.notifications.find(
      (n) =>
        n.user_id === patient.user_id &&
        n.type === 'nudge' &&
        n.message.includes(snippet)
    );
    if (notif) notif.read = true;
    persist();
    return res.json({ success: true, id: rawId, read: true });
  }

  if (rawId.startsWith('notif_')) {
    const notifId = rawId.slice(6);
    const notif = db.notifications.find((n) => n.id === notifId && n.user_id === patient.user_id);
    if (!notif) return res.status(404).json({ error: '消息不存在' });
    notif.read = true;
    persist();
    return res.json({ success: true, id: rawId, read: true });
  }

  return res.status(400).json({ error: '无效的消息 ID' });
});

router.get('/me/nudges', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const nudges = getDb()
    .nudges.filter((n) => n.patient_id === patient.id)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  res.json({ nudges });
});

router.get('/me/nudges/unread', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const nudges = getDb().nudges.filter((n) => n.patient_id === patient.id && !n.read);
  res.json({ nudges });
});

router.patch('/me/nudges/:id/read', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const nudge = getDb().nudges.find((n) => n.id === req.params.id && n.patient_id === patient.id);
  if (!nudge) return res.status(404).json({ error: '催促不存在' });
  nudge.read = true;
  persist();
  res.json(nudge);
});

router.get('/me/prescriptions/pending', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const pending = getDb().prescriptions.filter(
    (p) => p.patient_id === patient.id && p.status === 'pending'
  );
  res.json({ prescriptions: pending });
});

router.post('/me/prescriptions/:id/accept', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const db = getDb();
  const rx = db.prescriptions.find((p) => p.id === req.params.id && p.patient_id === patient.id);
  if (!rx) return res.status(404).json({ error: '处方不存在' });
  rx.status = 'accepted';
  patient.current_prescription = rx.params;
  const device = db.devices[patient.id];
  if (device) {
    Object.assign(device, rx.params, { time_left_seconds: rx.params.duration * 60 });
  }
  persist();
  res.json({ prescription: rx, device });
});

router.post('/onboarding/doctor-code', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const { code } = req.body as { code?: string };
  if (!code) return res.status(400).json({ error: '请提供授权码' });
  const normalized = code.trim();
  const db = getDb();

  let params: TreatmentParams | undefined;
  let doctorId: string | undefined;

  const profileMatch =
    patient.auth_code === normalized &&
    !patient.auth_code_used &&
    patient.binding_doctor_id;

  if (profileMatch) {
    const rx = db.auth_codes.find(
      (a) => a.code === normalized && a.doctor_id === patient.binding_doctor_id
    );
    params = rx?.params ?? patient.current_prescription;
    doctorId = patient.binding_doctor_id;
    patient.auth_code_used = true;
    if (rx) rx.used = true;
  } else {
    const authCode = db.auth_codes.find(
      (a) => a.code.toUpperCase() === normalized.toUpperCase() && !a.used
    );
    if (!authCode) return res.status(404).json({ error: '授权码无效或已使用' });
    authCode.used = true;
    params = authCode.params;
    doctorId = authCode.doctor_id;
    patient.binding_doctor_id = authCode.doctor_id;
    patient.auth_code = normalized;
    patient.auth_code_used = true;
    patient.current_prescription = authCode.params;
  }

  if (!params) return res.status(404).json({ error: '授权码无效或已使用' });

  patient.onboarding_completed = true;
  const doctor = doctorId ? db.doctors.find((d) => d.id === doctorId) : undefined;
  const device = db.devices[patient.id];
  if (device) {
    Object.assign(device, params, {
      connection: 'bluetooth',
      time_left_seconds: params.duration * 60,
    });
  }
  persist();
  res.json({
    params,
    device,
    doctor_name: doctor?.name,
    binding_doctor_id: doctorId,
  });
});

router.post('/onboarding/assessment', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const symptoms = req.body as SymptomInput;
  if (!symptoms.age || !symptoms.cartilage_wear || !symptoms.joint_fluid || !symptoms.pain_score) {
    return res.status(400).json({ error: '请完整填写症状自评' });
  }
  const db = getDb();
  const match = calculateEuclideanMatch(symptoms, db.clinical_cases);
  patient.age = symptoms.age;
  patient.cartilage_wear = symptoms.cartilage_wear;
  patient.joint_fluid = symptoms.joint_fluid;
  patient.pain_score = symptoms.pain_score;
  const device = db.devices[patient.id];
  if (device) {
    Object.assign(device, match.matchedCase.treatment, {
      connection: 'bluetooth',
      time_left_seconds: match.matchedCase.treatment.duration * 60,
    });
  }
  persist();
  res.json({
    matched_case: match.matchedCase,
    similarity: match.allDistances[0]?.score ?? 90,
    all_distances: match.allDistances,
    params: match.matchedCase.treatment,
    device,
  });
});

router.get('/me/treatment/params', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const device = getDb().devices[patient.id];
  if (!device) return res.status(404).json({ error: '设备未注册' });
  const params: TreatmentParams = {
    left_force: device.left_force,
    right_force: device.right_force,
    duration: device.duration,
    temp: device.temp,
    vibration: device.vibration,
  };
  res.json({ params, current_prescription: patient.current_prescription });
});

router.post('/me/treatment/sessions', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const db = getDb();
  const device = db.devices[patient.id];
  if (!device) return res.status(404).json({ error: '设备未注册' });
  if (device.connection === 'disconnected') {
    return res.status(409).json({ error: '设备未连接' });
  }
  if (!device.is_safety_clip_attached) {
    return res.status(409).json({ error: '安全栓未插紧，无法启动' });
  }
  const body = req.body as TreatmentParams & { source?: string };
  const params: TreatmentParams = {
    left_force: body.left_force ?? device.left_force,
    right_force: body.right_force ?? device.right_force,
    duration: body.duration ?? device.duration,
    temp: body.temp ?? device.temp,
    vibration: body.vibration ?? device.vibration,
  };
  if (params.left_force > device.max_force_limit || params.right_force > device.max_force_limit) {
    return res.status(409).json({ error: `拉力超过安全上限 ${device.max_force_limit}N` });
  }
  const running = findRunningSession(patient.id);
  if (running) {
    if (device.is_running) {
      return res.status(409).json({ error: '已有进行中的理疗会话', session_id: running.id });
    }
    stopRunningSession(running, patient.id);
  }

  Object.assign(device, params, { is_running: true, time_left_seconds: params.duration * 60 });
  const session = {
    id: generateId('sess'),
    patient_id: patient.id,
    params,
    status: 'running' as const,
    source: (body.source as 'ai_recommendation' | 'doctor_prescription' | 'manual' | 'auth_code') ?? 'manual',
    started_at: new Date().toISOString(),
    time_left_seconds: params.duration * 60,
  };
  db.sessions.push(session);
  upsertTodayTherapyLog(patient.id, {
    mode_used: mapSessionSourceToMode(session.source),
    is_completed: false,
    hardware_status: 'Normal',
    left_force: params.left_force,
    right_force: params.right_force,
    temp: params.temp,
  });
  queueDeviceCommand(patient.id, 'START', {
    ...params,
    max_force_limit: device.max_force_limit,
  });
  persist();
  res.status(201).json(session);
});

router.patch('/me/treatment/sessions/:id', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const db = getDb();
  const session = db.sessions.find((s) => s.id === req.params.id && s.patient_id === patient.id);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  const { status } = req.body as { status?: 'stopped' | 'running' };
  if (status === 'stopped') {
    session.status = 'stopped';
    session.ended_at = new Date().toISOString();
    const device = db.devices[patient.id];
    if (device) device.is_running = false;
    queueDeviceCommand(patient.id, 'STOP');
  }
  persist();
  res.json(session);
});

router.post('/me/treatment/sessions/:id/complete', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const db = getDb();
  const session = db.sessions.find((s) => s.id === req.params.id && s.patient_id === patient.id);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  session.status = 'completed';
  session.ended_at = new Date().toISOString();
  session.time_left_seconds = 0;

  const device = db.devices[patient.id];
  if (device) {
    device.is_running = false;
    device.time_left_seconds = 0;
    device.battery_level = Math.max(10, device.battery_level - 3);
  }
  queueDeviceCommand(patient.id, 'STOP');

  const today = todayString();
  const exists = db.check_ins.some((c) => c.patient_id === patient.id && c.date === today);
  if (!exists) {
    db.check_ins.push({
      id: generateId('ci'),
      patient_id: patient.id,
      date: today,
      type: 'therapy',
      created_at: new Date().toISOString(),
    });
    recalcAttendance(patient.id);
    patient.history.push({
      date: today,
      pain_score: patient.pain_score,
      left_force: session.params.left_force,
      right_force: session.params.right_force,
      temp: session.params.temp,
    });
  }

  pushNotification({
    user_id: patient.user_id,
    type: 'system',
    title: '治疗圆满结束并自动打卡',
    message: '今日膝关节拉伸治疗已成功完成，数据已同步给家属！',
  });

  upsertTodayTherapyLog(patient.id, {
    mode_used: mapSessionSourceToMode(session.source),
    is_completed: true,
    hardware_status: 'Normal',
    left_force: session.params.left_force,
    right_force: session.params.right_force,
    temp: session.params.temp,
  });

  const bindings = db.family_bindings.filter((b) => b.patient_id === patient.id);
  for (const b of bindings) {
    pushNotification({
      user_id: b.family_user_id,
      type: 'system',
      title: '✅ 绑定人完成今日理疗',
      message: `${patient.name} 已完成今日康复理疗打卡。`,
    });
  }

  persist();
  res.json({ session, patient, device });
});

router.get('/me/remind-status', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const db = getDb();
  const binding = db.family_bindings.find(
    (b) => b.patient_id === patient.id && b.remind_status
  );
  if (!binding) {
    return res.json({ remind_active: false, message: null });
  }
  const latestNudge = db.nudges
    .filter((n) => n.patient_id === patient.id && !n.read)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  res.json({
    remind_active: true,
    message: latestNudge?.message ?? null,
    nudge_id: latestNudge?.id,
    binding_id: binding.id,
  });
});

router.post('/me/remind-status/ack', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const db = getDb();
  const bindings = db.family_bindings.filter((b) => b.patient_id === patient.id);
  for (const b of bindings) {
    b.remind_status = false;
  }
  for (const nudge of db.nudges.filter((n) => n.patient_id === patient.id && !n.read)) {
    nudge.read = true;
  }
  persist();
  res.json({ success: true });
});

router.get('/me/therapy-logs/today', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const log = getTodayTherapyLog(patient.id);
  res.json({ log });
});

router.patch('/me/treatment/params', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const device = getDb().devices[patient.id];
  if (!device) return res.status(404).json({ error: '设备未注册' });
  if (device.is_running) return res.status(409).json({ error: '理疗进行中，无法修改参数' });
  const body = req.body as Partial<TreatmentParams>;
  if (body.left_force !== undefined) device.left_force = body.left_force;
  if (body.right_force !== undefined) device.right_force = body.right_force;
  if (body.duration !== undefined) {
    device.duration = body.duration;
    device.time_left_seconds = body.duration * 60;
  }
  if (body.temp !== undefined) device.temp = body.temp;
  if (body.vibration !== undefined) device.vibration = body.vibration;
  persist();
  res.json({
    params: {
      left_force: device.left_force,
      right_force: device.right_force,
      duration: device.duration,
      temp: device.temp,
      vibration: device.vibration,
    },
  });
});

export default router;
