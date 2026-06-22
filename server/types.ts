/**
 * 后端共享类型 — 与前端 src/types.ts 对齐并扩展持久化字段
 */

export type UserRole = 'patient' | 'doctor' | 'family';

export interface SymptomInput {
  age: number;
  cartilage_wear: number;
  joint_fluid: number;
  pain_score: number;
}

export interface TreatmentParams {
  left_force: number;
  right_force: number;
  duration: number;
  temp: number;
  vibration: number;
}

export interface ClinicalCase {
  case_id: number;
  case_name: string;
  doctor_id?: string;
  symptoms: SymptomInput;
  treatment: TreatmentParams;
}

export interface TreatmentHistoryEntry {
  date: string;
  pain_score: number;
  left_force: number;
  right_force: number;
  temp: number;
}

export interface PatientProfile {
  id: string;
  user_id: string;
  name: string;
  age: number;
  phone: string;
  cartilage_wear: number;
  joint_fluid: number;
  pain_score: number;
  auth_code?: string | null;
  binding_doctor_id?: string | null;
  auth_code_used?: boolean;
  onboarding_completed?: boolean;
  symptoms_assessed?: boolean;
  attendance_rate: number;
  check_in_dates: string[];
  history: TreatmentHistoryEntry[];
  current_prescription?: TreatmentParams;
  binding_doctor_name?: string;
}

export interface HardwareState {
  is_mock_mode: boolean;
  connection: 'disconnected' | 'bluetooth' | 'wifi';
  is_running: boolean;
  left_force: number;
  right_force: number;
  duration: number;
  temp: number;
  vibration: number;
  time_left_seconds: number;
  max_force_limit: number;
  is_safety_clip_attached: boolean;
  battery_level: number;
}

export type NotificationType = 'nudge' | 'alarm' | 'prescription' | 'system';

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  action_by?: string;
}

export interface User {
  id: string;
  role: UserRole;
  phone: string;
  password?: string;
  name: string;
  patient_id?: string;
  doctor_id?: string;
  family_id?: string;
  created_at?: string;
}

export interface DoctorProfile {
  id: string;
  user_id: string;
  name: string;
  is_verified: boolean;
  dept?: string;
  license_id?: string;
  certificate_file?: string;
}

export interface DoctorPatientSummary {
  id: string;
  name: string;
  age: number;
  wear: number;
  fluid: number;
  pain: number;
  attendance: number;
  phone: string;
  avatar: string;
  today_done: boolean;
}

export interface FamilyBinding {
  id: string;
  family_user_id: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  remind_status?: boolean;
  emergency_contact?: boolean;
  created_at: string;
}

export type TherapyMode = 'AI' | 'Manual' | 'Cloud';
export type HardwareStatus = 'Normal' | 'Error';

export interface TherapyLog {
  log_id: string;
  patient_id: string;
  therapy_date: string;
  mode_used: TherapyMode;
  is_completed: boolean;
  hardware_status: HardwareStatus;
  left_force?: number;
  right_force?: number;
  temp?: number;
}

export interface Nudge {
  id: string;
  family_user_id: string;
  patient_id: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface Prescription {
  id: string;
  doctor_id: string;
  patient_id: string;
  params: TreatmentParams;
  status: 'pending' | 'accepted';
  created_at: string;
}

export interface TreatmentSession {
  id: string;
  patient_id: string;
  params: TreatmentParams;
  status: 'running' | 'stopped' | 'completed';
  source: 'ai_recommendation' | 'doctor_prescription' | 'manual' | 'auth_code';
  started_at: string;
  ended_at?: string;
  time_left_seconds: number;
}

export interface CheckIn {
  id: string;
  patient_id: string;
  date: string;
  type: 'manual' | 'therapy' | 'exercise';
  created_at: string;
}

export interface AuthCode {
  code: string;
  doctor_id: string;
  patient_id?: string;
  params: TreatmentParams;
  used: boolean;
}

/** ESP32 等物理设备 ↔ 云端指令队列 */
export type DeviceCommandType = 'NONE' | 'START' | 'STOP' | 'SYNC';

export interface DeviceCommand {
  id: string;
  command: DeviceCommandType;
  left_force?: number;
  right_force?: number;
  temp?: number;
  vibration?: number;
  duration?: number;
  max_force_limit?: number;
  issued_at: string;
}

export interface PhysicalDevice {
  device_id: string;
  /** 设备密钥，HTTP 头 X-Device-Token */
  token: string;
  patient_id: string;
  name?: string;
  pending_command: DeviceCommand | null;
  last_seen_at?: string | null;
}

export interface Database {
  schema_version?: number;
  users: User[];
  patients: PatientProfile[];
  doctors: DoctorProfile[];
  clinical_cases: ClinicalCase[];
  devices: Record<string, HardwareState>;
  sessions: TreatmentSession[];
  prescriptions: Prescription[];
  nudges: Nudge[];
  notifications: AppNotification[];
  family_bindings: FamilyBinding[];
  check_ins: CheckIn[];
  therapy_logs: TherapyLog[];
  auth_codes: AuthCode[];
  bind_qr_tokens: Record<string, { patient_id: string; expires_at: string }>;
  sms_codes: Record<string, { code: string; expires_at: string }>;
  physical_devices: PhysicalDevice[];
  /** 登录 token → user_id，持久化以免 dev 热重载丢会话 */
  auth_tokens?: Record<string, string>;
}
