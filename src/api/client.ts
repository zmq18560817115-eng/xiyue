/**
 * KneeJoy REST API 客户端
 */

import type {
  AppNotification,
  ClinicalCase,
  HardwareState,
  PatientMessage,
  PatientProfile,
  TherapyLog,
  TreatmentParams,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('kneejoy_token', token);
  } else {
    localStorage.removeItem('kneejoy_token');
  }
}

export function getAuthToken(): string | null {
  if (authToken) return authToken;
  return localStorage.getItem('kneejoy_token');
}

export interface AuthUser {
  id: string;
  role: 'patient' | 'doctor' | 'family';
  name: string;
  phone: string;
  patient_id?: string;
  doctor_id?: string;
  family_id?: string;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error(
      '无法连接后端 API。请在项目目录执行 npm run start（同时启动前端 :3000 与后端 :3001）'
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const serverMsg = (data as { error?: string }).error;
    if (res.status >= 500 && !serverMsg) {
      throw new Error(
        '后端服务异常或未启动。请运行 npm run start，并确认 http://localhost:3001/api/v1/health 返回 ok'
      );
    }
    throw new Error(serverMsg ?? `请求失败 ${res.status}`);
  }
  return data as T;
}

// ─── 认证 ───────────────────────────────────────────

export async function sendSmsCode(phone: string) {
  return request<{ success: boolean; message: string }>('/auth/sms/send', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export async function loginWithPhone(
  phone: string,
  code: string,
  role: 'patient' | 'doctor' | 'family'
) {
  const data = await request<{ token: string; user: AuthUser }>('/auth/login/phone', {
    method: 'POST',
    body: JSON.stringify({ phone, code, role }),
  });
  setAuthToken(data.token);
  return data;
}

export async function loginWithPassword(
  phone: string,
  password: string,
  role: 'patient' | 'doctor' | 'family'
) {
  const data = await request<{ token: string; user: AuthUser }>('/auth/login/password', {
    method: 'POST',
    body: JSON.stringify({ phone, password, role }),
  });
  setAuthToken(data.token);
  return data;
}

export async function logoutApi() {
  try {
    await request('/auth/logout', { method: 'POST' });
  } finally {
    setAuthToken(null);
  }
}

export async function getMe() {
  return request<AuthUser>('/auth/me');
}

// ─── 患者 ───────────────────────────────────────────

export async function getPatientProfile() {
  return request<PatientProfile>('/patients/me');
}

export async function getPatientFamilyBindings() {
  return request<{
    bindings: Array<{
      id: string;
      family_user_id: string;
      family_name: string;
      family_phone: string;
      emergency_contact?: boolean;
    }>;
  }>('/patients/me/family-bindings');
}

export async function updatePatientSymptoms(
  symptoms: {
    age: number;
    cartilage_wear: number;
    joint_fluid: number;
    pain_score: number;
  },
  options?: { onboarding_completed?: boolean }
) {
  return request<PatientProfile>('/patients/me/symptoms', {
    method: 'PATCH',
    body: JSON.stringify({ ...symptoms, ...options }),
  });
}

export async function getPatientDevice() {
  return request<HardwareState>('/patients/me/device');
}

export async function updateDeviceConnection(
  connection: 'disconnected' | 'bluetooth' | 'wifi'
) {
  return request<HardwareState>('/patients/me/device/connection', {
    method: 'PATCH',
    body: JSON.stringify({ connection }),
  });
}

export async function updateDeviceSettings(updates: Partial<HardwareState>) {
  return request<HardwareState>('/patients/me/device/settings', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function syncDeviceTelemetry(updates: Partial<HardwareState>) {
  return request<HardwareState>('/patients/me/device/telemetry', {
    method: 'POST',
    body: JSON.stringify(updates),
  });
}

export async function addCheckIn(date: string, type: 'manual' | 'therapy' | 'exercise' = 'manual') {
  return request<{ dates: string[]; attendance_rate: number }>('/patients/me/check-ins', {
    method: 'POST',
    body: JSON.stringify({ date, type }),
  });
}

export async function getCheckIns(month?: string) {
  return request<{
    dates: string[];
    attendance_rate: number;
    check_ins: unknown[];
    therapy_logs?: TherapyLog[];
  }>(`/patients/me/check-ins${month ? `?month=${month}` : ''}`);
}

export async function getPatientRemindStatus() {
  return request<{
    remind_active: boolean;
    message: string | null;
    nudge_id?: string;
    binding_id?: string;
  }>('/patients/me/remind-status');
}

export async function ackPatientRemindStatus() {
  return request<{ success: boolean }>('/patients/me/remind-status/ack', {
    method: 'POST',
  });
}

export async function getPendingPrescriptions() {
  return request<{ prescriptions: Array<{ id: string; params: TreatmentParams; status: string }> }>(
    '/patients/me/prescriptions/pending'
  );
}

export async function markPatientMessageRead(messageId: string) {
  return request<{ success: boolean; id: string; read: boolean }>(
    `/patients/me/messages/${encodeURIComponent(messageId)}/read`,
    { method: 'PATCH' }
  );
}

export async function acceptPrescription(prescriptionId: string) {
  return request<{ prescription: unknown; device: HardwareState }>(
    `/patients/me/prescriptions/${prescriptionId}/accept`,
    { method: 'POST' }
  );
}

export async function getUnreadNudges() {
  return request<{ nudges: Array<{ id: string; message: string }> }>(
    '/patients/me/nudges/unread'
  );
}

export async function markNudgeRead(nudgeId: string) {
  return request(`/patients/me/nudges/${nudgeId}/read`, { method: 'PATCH' });
}

export async function startTreatmentSession(
  params: TreatmentParams & { source?: string }
) {
  return request<{ id: string; status: string; time_left_seconds: number }>(
    '/patients/me/treatment/sessions',
    { method: 'POST', body: JSON.stringify(params) }
  );
}

export async function stopTreatmentSession(sessionId: string) {
  return request(`/patients/me/treatment/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'stopped' }),
  });
}

export async function completeTreatmentSession(sessionId: string) {
  return request<{
    session: unknown;
    patient: PatientProfile;
    device: HardwareState;
  }>(`/patients/me/treatment/sessions/${sessionId}/complete`, { method: 'POST' });
}

export async function redeemDoctorCode(code: string) {
  return request<{
    params: TreatmentParams;
    device: HardwareState;
    doctor_name?: string;
    binding_doctor_id?: string;
  }>('/patients/onboarding/doctor-code', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function submitOnboardingAssessment(symptoms: {
  age: number;
  cartilage_wear: number;
  joint_fluid: number;
  pain_score: number;
}) {
  return request<{
    matched_case: ClinicalCase;
    similarity: number;
    params: TreatmentParams;
    device: HardwareState;
  }>('/patients/onboarding/assessment', {
    method: 'POST',
    body: JSON.stringify(symptoms),
  });
}

export async function matchTreatment(symptoms: {
  age: number;
  cartilage_wear: number;
  joint_fluid: number;
  pain_score: number;
}) {
  return request<{
    matched_case: ClinicalCase;
    similarity: number;
    all_distances: unknown[];
  }>('/treatment/match', {
    method: 'POST',
    body: JSON.stringify(symptoms),
  });
}

// ─── 医生 ───────────────────────────────────────────

export async function getDoctorProfile() {
  return request<{
    id: string;
    user_id: string;
    name: string;
    is_verified: boolean;
    dept?: string;
    license_id?: string;
    certificate_file?: string;
  }>('/doctors/me');
}

export async function getDoctorPatients() {
  return request<{
    patients: Array<{
      id: string;
      name: string;
      age: number;
      wear: number;
      fluid: number;
      pain: number;
      attendance: number;
      phone: string;
      avatar?: string;
      today_done: boolean;
      is_signed?: boolean;
      today_mode?: string | null;
      hardware_status?: string;
    }>;
    total: number;
  }>('/doctors/me/patients');
}

export async function getDoctorVerification() {
  return request<{ is_verified: boolean; dept?: string; license_id?: string }>(
    '/doctors/me/verification'
  );
}

export async function submitDoctorVerification(data: {
  dept: string;
  license_id: string;
  certificate_file?: string;
}) {
  return request<{ is_verified: boolean; dept?: string; license_id?: string }>(
    '/doctors/me/verification',
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

export async function sendPrescription(patientId: string, params: TreatmentParams) {
  return request<{ id: string; params: TreatmentParams }>(
    `/doctors/me/patients/${patientId}/prescriptions`,
    { method: 'POST', body: JSON.stringify(params) }
  );
}

export async function getClinicalCases() {
  return request<{ cases: ClinicalCase[] }>('/clinical-cases');
}

export async function addClinicalCase(caseData: {
  case_name: string;
  symptoms: { age: number; cartilage_wear: number; joint_fluid: number; pain_score: number };
  treatment: TreatmentParams;
}) {
  return request<ClinicalCase>('/clinical-cases', {
    method: 'POST',
    body: JSON.stringify(caseData),
  });
}

// ─── 家属 ───────────────────────────────────────────

export async function bindFamilyByPhone(patientPhone: string) {
  return request('/family/bindings/phone', {
    method: 'POST',
    body: JSON.stringify({ patient_phone: patientPhone }),
  });
}

export async function bindFamilyByQr(qrToken: string) {
  return request('/family/bindings/qr', {
    method: 'POST',
    body: JSON.stringify({ qr_token: qrToken }),
  });
}

export async function getFamilyBindings() {
  return request<{ bindings: Array<{ patient_id: string; patient_name: string }> }>(
    '/family/bindings'
  );
}

export async function getFamilyPatientDevice(patientId: string) {
  return request<{
    patient: { id: string; name: string };
    device: HardwareState;
    hardware_status?: string;
    remind_sent?: boolean;
  }>(`/family/patients/${patientId}/device-status`);
}

export async function sendFamilyNudge(patientId: string, message: string) {
  return request(`/family/patients/${patientId}/nudges`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function getFamilyCheckInStats(patientId: string) {
  return request<{
    total_check_ins: number;
    attendance_rate: number;
    check_in_dates: string[];
    weekly_rate?: number;
    weekly_completed?: number;
    weekly?: Array<{ label: string; value: number }>;
  }>(`/family/patients/${patientId}/check-ins/stats`);
}

// ─── 通知 ───────────────────────────────────────────

export async function getNotifications(unreadOnly = false) {
  return request<{ notifications: AppNotification[] }>(
    `/notifications${unreadOnly ? '?unread=true' : ''}`
  );
}

export async function markNotificationRead(id: string) {
  return request(`/notifications/${id}/read`, { method: 'PATCH' });
}

function parsePrescriptionParamsFromText(message: string): TreatmentParams | undefined {
  const left = message.match(/左侧\s*(\d+)N/);
  const right = message.match(/右侧\s*(\d+)N/);
  const temp = message.match(/(\d+)℃/);
  const duration = message.match(/(\d+)\s*分钟/);
  if (!left || !right || !temp) return undefined;
  return {
    left_force: Number(left[1]),
    right_force: Number(right[1]),
    temp: Number(temp[1]),
    duration: duration ? Number(duration[1]) : 20,
    vibration: 1,
  };
}

function matchPendingPrescription(
  params: TreatmentParams | undefined,
  pending: Array<{ id: string; params: TreatmentParams; status: string }>
) {
  if (!params) return undefined;
  return pending.find(
    (p) =>
      p.params.left_force === params.left_force &&
      p.params.right_force === params.right_force &&
      p.params.temp === params.temp
  );
}

async function buildPatientMessagesFallback(): Promise<PatientMessage[]> {
  const [{ notifications }, { prescriptions: pendingRx }] = await Promise.all([
    getNotifications(false),
    getPendingPrescriptions(),
  ]);

  const messages: PatientMessage[] = [];

  for (const n of notifications) {
    if (n.type !== 'prescription' && n.type !== 'nudge') continue;

    const category = n.type === 'nudge' ? 'family' : 'doctor';
    let prescription_params: TreatmentParams | undefined;
    let prescription_id: string | undefined;
    let prescription_status: 'pending' | 'accepted' | undefined;

    if (n.type === 'prescription') {
      const parsed = parsePrescriptionParamsFromText(n.message);
      const match = matchPendingPrescription(parsed, pendingRx);
      if (match) {
        prescription_id = match.id;
        prescription_params = match.params;
        prescription_status = 'pending';
      } else if (parsed) {
        prescription_params = parsed;
        prescription_status = 'accepted';
      }
    }

    messages.push({
      id: `notif_${n.id}`,
      category,
      title: n.title,
      message: n.message,
      timestamp: n.timestamp,
      read: n.read ?? false,
      action_by: n.action_by,
      notification_id: n.id,
      prescription_params,
      prescription_id,
      prescription_status,
    });
  }

  messages.sort((a, b) => {
    const ta = Date.parse(a.timestamp.replace(/\//g, '-')) || 0;
    const tb = Date.parse(b.timestamp.replace(/\//g, '-')) || 0;
    return tb - ta;
  });

  return messages;
}

export async function getPatientMessages() {
  try {
    return await request<{ messages: PatientMessage[] }>('/patients/me/messages');
  } catch {
    const messages = await buildPatientMessagesFallback();
    return { messages };
  }
}

export async function checkApiHealth() {
  return request<{ status: string }>('/health');
}
