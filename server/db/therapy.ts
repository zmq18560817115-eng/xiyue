import type { TherapyLog, TherapyMode } from '../types.js';
import { generateId, getDb, persist, todayString } from './store.js';

const DEMO_ANCHOR_DATE = '2026-06-09';

/** 将种子数据中的演示日期对齐到当前日期，保证红绿灯/今日日志可用 */
export function alignDemoTherapyDates(): void {
  const db = getDb();
  if (!db.therapy_logs) db.therapy_logs = [];
  const today = todayString();
  if (today === DEMO_ANCHOR_DATE) return;

  const replaceDate = (d: string) => (d === DEMO_ANCHOR_DATE ? today : d);

  for (const log of db.therapy_logs) {
    log.therapy_date = replaceDate(log.therapy_date);
  }
  for (const patient of db.patients) {
    patient.check_in_dates = patient.check_in_dates.map(replaceDate);
    patient.history = patient.history.map((h) => ({ ...h, date: replaceDate(h.date) }));
  }
  for (const ci of db.check_ins) {
    ci.date = replaceDate(ci.date);
  }
  persist();
}

export function getTodayTherapyLog(patientId: string): TherapyLog | undefined {
  const today = todayString();
  return getDb().therapy_logs.find(
    (l) => l.patient_id === patientId && l.therapy_date === today
  );
}

export function upsertTodayTherapyLog(
  patientId: string,
  patch: Partial<TherapyLog> & { mode_used?: TherapyMode }
): TherapyLog {
  const db = getDb();
  const today = todayString();
  let log = db.therapy_logs.find(
    (l) => l.patient_id === patientId && l.therapy_date === today
  );
  if (!log) {
    log = {
      log_id: generateId('log'),
      patient_id: patientId,
      therapy_date: today,
      mode_used: patch.mode_used ?? 'Manual',
      is_completed: false,
      hardware_status: 'Normal',
    };
    db.therapy_logs.push(log);
  }
  Object.assign(log, patch);
  persist();
  return log;
}

export function mapSessionSourceToMode(
  source: string
): TherapyMode {
  if (source === 'ai_recommendation') return 'AI';
  if (source === 'auth_code' || source === 'doctor_prescription') return 'Cloud';
  return 'Manual';
}

export function countCompletedLogsInRange(
  patientId: string,
  startDate: string,
  endDate: string
): number {
  return getDb().therapy_logs.filter(
    (l) =>
      l.patient_id === patientId &&
      l.is_completed &&
      l.therapy_date >= startDate &&
      l.therapy_date <= endDate
  ).length;
}
