import { Router } from 'express';
import { getDb, persist } from '../db/store.js';
import type { AuthedRequest } from '../middleware/auth.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, (_req, res) => {
  res.json({ cases: getDb().clinical_cases });
});

router.get('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const found = getDb().clinical_cases.find((c) => c.case_id === id);
  if (!found) return res.status(404).json({ error: '病例不存在' });
  res.json(found);
});

router.post('/', requireAuth, requireRole('doctor'), (req: AuthedRequest, res) => {
  const doctor = getDb().doctors.find((d) => d.id === req.user!.doctor_id);
  if (!doctor?.is_verified) {
    return res.status(403).json({ error: '医生资质未认证，无法录入病例' });
  }
  const body = req.body as {
    case_name?: string;
    symptoms?: { age: number; cartilage_wear: number; joint_fluid: number; pain_score: number };
    treatment?: { left_force: number; right_force: number; duration: number; temp: number; vibration: number };
  };
  if (!body.case_name || !body.symptoms || !body.treatment) {
    return res.status(400).json({ error: '缺少 case_name、symptoms 或 treatment' });
  }
  const db = getDb();
  const newCase = {
    case_id: Date.now(),
    case_name: body.case_name,
    symptoms: body.symptoms,
    treatment: body.treatment,
  };
  db.clinical_cases.push(newCase);
  persist();
  res.status(201).json(newCase);
});

export default router;
