import { Router } from 'express';
import {
  generateId,
  getDb,
  normalizePhone,
  persist,
  todayString,
} from '../db/store.js';
import type { AuthedRequest } from '../middleware/auth.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getPatientUserId, pushNotification } from '../services/notifications.js';
import type { TreatmentParams } from '../types.js';

const router = Router();

function getDoctorForUser(userId: string) {
  const user = getDb().users.find((u) => u.id === userId);
  if (!user?.doctor_id) return null;
  return getDb().doctors.find((d) => d.id === user.doctor_id) ?? null;
}

router.get('/me', requireAuth, requireRole('doctor'), (req: AuthedRequest, res) => {
  const doctor = getDoctorForUser(req.user!.id);
  if (!doctor) return res.status(404).json({ error: '医生档案不存在' });
  res.json(doctor);
});

router.get('/me/verification', requireAuth, requireRole('doctor'), (req: AuthedRequest, res) => {
  const doctor = getDoctorForUser(req.user!.id);
  if (!doctor) return res.status(404).json({ error: '医生档案不存在' });
  res.json({
    is_verified: doctor.is_verified,
    dept: doctor.dept,
    license_id: doctor.license_id,
    certificate_file: doctor.certificate_file,
  });
});

router.post('/me/verification', requireAuth, requireRole('doctor'), (req: AuthedRequest, res) => {
  const doctor = getDoctorForUser(req.user!.id);
  if (!doctor) return res.status(404).json({ error: '医生档案不存在' });
  const { dept, license_id, certificate_file } = req.body as {
    dept?: string;
    license_id?: string;
    certificate_file?: string;
  };
  doctor.dept = dept ?? doctor.dept ?? '骨科康复科';
  doctor.license_id = license_id ?? doctor.license_id;
  doctor.certificate_file = certificate_file ?? doctor.certificate_file;
  doctor.is_verified = true;
  persist();
  res.json({ is_verified: true, dept: doctor.dept, license_id: doctor.license_id });
});

router.get('/me/patients', requireAuth, requireRole('doctor'), (req: AuthedRequest, res) => {
  const db = getDb();
  const doctor = getDoctorForUser(req.user!.id);
  if (!doctor) return res.status(404).json({ error: '医生档案不存在' });
  const today = todayString();

  // 签约患者（binding_doctor_id）+ 全库患者监控大盘
  const monitored = db.patients.filter(
    (p) => p.binding_doctor_id === doctor.id || db.patients.length <= 5
  );

  const patients = monitored.map((p) => {
    const todayLog = db.therapy_logs.find(
      (l) => l.patient_id === p.id && l.therapy_date === today
    );
    return {
      id: p.id,
      name: p.name,
      age: p.age,
      wear: p.cartilage_wear,
      fluid: p.joint_fluid,
      pain: p.pain_score,
      attendance: p.attendance_rate,
      phone: p.phone,
      avatar: '',
      today_done: todayLog?.is_completed ?? false,
      is_signed: p.binding_doctor_id === doctor.id,
      today_mode: todayLog?.mode_used ?? null,
      hardware_status: todayLog?.hardware_status ?? 'Normal',
    };
  });
  res.json({ patients, total: patients.length });
});

router.get('/me/patients/:id', requireAuth, requireRole('doctor'), (req, res) => {
  const patient = getDb().patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: '患者不存在' });
  const device = getDb().devices[patient.id];
  res.json({ patient, device });
});

router.post('/me/patients/:id/prescriptions', requireAuth, requireRole('doctor'), (req: AuthedRequest, res) => {
  const doctor = getDoctorForUser(req.user!.id);
  if (!doctor) return res.status(404).json({ error: '医生档案不存在' });
  if (!doctor.is_verified) {
    return res.status(403).json({ error: '医生资质未认证，无法下发处方' });
  }
  const patient = getDb().patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: '患者不存在' });
  const params = req.body as TreatmentParams;
  if (
    params.left_force === undefined ||
    params.right_force === undefined ||
    params.duration === undefined ||
    params.temp === undefined ||
    params.vibration === undefined
  ) {
    return res.status(400).json({ error: '请提供完整 TreatmentParams' });
  }
  const db = getDb();
  const rx = {
    id: generateId('rx'),
    doctor_id: doctor.id,
    patient_id: patient.id,
    params,
    status: 'pending' as const,
    created_at: new Date().toISOString(),
  };
  db.prescriptions.push(rx);
  patient.current_prescription = params;

  const patientUserId = getPatientUserId(patient.id);
  if (patientUserId) {
    pushNotification({
      user_id: patientUserId,
      type: 'prescription',
      title: '主治医生下发特制理疗贴方',
      message: `${doctor.dept ?? '骨科康复科'}${doctor.name}针对您今日的疼痛指数，特别下发了左侧 ${params.left_force}N, 右侧 ${params.right_force}N, 恒温温热 ${params.temp}℃ 的处方方案。`,
      action_by: doctor.name,
    });
  }
  persist();
  res.status(201).json(rx);
});

router.post('/me/patients/:id/auth-codes', requireAuth, requireRole('doctor'), (req: AuthedRequest, res) => {
  const doctor = getDoctorForUser(req.user!.id);
  if (!doctor?.is_verified) {
    return res.status(403).json({ error: '医生资质未认证' });
  }
  const patient = getDb().patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: '患者不存在' });
  const params = req.body as TreatmentParams;
  const code = `KOA${Math.floor(100 + Math.random() * 900)}`;
  const db = getDb();
  db.auth_codes.push({
    code,
    doctor_id: doctor.id,
    patient_id: patient.id,
    params,
    used: false,
  });
  persist();
  res.status(201).json({ code, params });
});

export default router;
