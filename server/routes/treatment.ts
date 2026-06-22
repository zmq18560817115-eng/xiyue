import { Router } from 'express';
import { getDb, persist } from '../db/store.js';
import type { AuthedRequest } from '../middleware/auth.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { calculateEuclideanMatch } from '../services/match.js';
import type { SymptomInput } from '../types.js';

const router = Router();

function getPatientForUser(userId: string) {
  const user = getDb().users.find((u) => u.id === userId);
  if (!user?.patient_id) return null;
  return getDb().patients.find((p) => p.id === user.patient_id) ?? null;
}

router.post('/match', requireAuth, (req, res) => {
  const symptoms = req.body as SymptomInput;
  if (!symptoms.age || symptoms.cartilage_wear === undefined) {
    return res.status(400).json({ error: '请提供完整 SymptomInput' });
  }
  const match = calculateEuclideanMatch(symptoms, getDb().clinical_cases);
  res.json({
    matched_case: match.matchedCase,
    distance: match.distance,
    similarity: match.allDistances[0]?.score ?? 0,
    all_distances: match.allDistances,
  });
});

router.post('/recommendations/:caseId/accept', requireAuth, requireRole('patient'), (req: AuthedRequest, res) => {
  const patient = getPatientForUser(req.user!.id);
  if (!patient) return res.status(404).json({ error: '患者档案不存在' });
  const caseId = Number(req.params.caseId);
  const clinicalCase = getDb().clinical_cases.find((c) => c.case_id === caseId);
  if (!clinicalCase) return res.status(404).json({ error: '病例不存在' });
  const device = getDb().devices[patient.id];
  if (!device) return res.status(404).json({ error: '设备未注册' });
  Object.assign(device, clinicalCase.treatment, {
    time_left_seconds: clinicalCase.treatment.duration * 60,
  });
  persist();
  res.json({ params: clinicalCase.treatment, device });
});

export default router;
