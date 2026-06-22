/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SymptomInput {
  age: number;
  cartilage_wear: number; // 1-5 级 (软骨磨损度)
  joint_fluid: number;    // 1-5 级 (关节积液量)
  pain_score: number;     // 1-10 VAS 疼痛评分
}

export interface TreatmentParams {
  left_force: number;     // 左推杆力值 (N)
  right_force: number;    // 右推杆力值 (N)
  duration: number;       // 治疗时间 (分钟)
  temp: number;           // 加热温度 (℃)
  vibration: number;      // 振动频率/模式 (0-无, 1-低频, 2-高频)
}

export interface ClinicalCase {
  case_id: number;
  case_name: string;
  symptoms: SymptomInput;
  treatment: TreatmentParams;
}

export interface PatientProfile {
  id: string;
  name: string;
  age: number;
  phone: string;
  cartilage_wear: number;
  joint_fluid: number;
  pain_score: number;
  auth_code?: string | null;
  binding_doctor_id?: string | null;
  binding_doctor_name?: string;
  auth_code_used?: boolean;
  onboarding_completed?: boolean;
  symptoms_assessed?: boolean;
  attendance_rate: number; // 依从性打卡率 e.g. 85%
  check_in_dates: string[]; // 打卡成功的日期 YYYY-MM-DD
  history: {
    date: string;
    pain_score: number;
    left_force: number;
    right_force: number;
    temp: number;
  }[];
  current_prescription?: TreatmentParams; // 医生远程下发的处方
}

export interface PatientFamilyBinding {
  id: string;
  family_user_id: string;
  family_name: string;
  family_phone: string;
  emergency_contact?: boolean;
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
  max_force_limit: number; // 安全防夹预扣
  is_safety_clip_attached: boolean;
  battery_level: number;
  /** 设备实时急停（MQTT/HTTP status） */
  estop?: boolean;
  /** 是否为软件急停（可云端复位） */
  sw_estop?: boolean;
  /** 物理急停键 GPIO 仍为高电平 */
  hw_estop?: boolean;
  /** 设备 fault 码，0=正常 */
  device_fault?: number;
}

/** 传给 onUpdateHardware 的可选参数 */
export interface HardwareUpdateOptions {
  /** 仅「开始/结束治疗」时为 true，才会向设备发 therapy/stop（急停） */
  syncRunToDevice?: boolean;
}

export interface AppNotification {
  id: string;
  type: 'nudge' | 'alarm' | 'prescription' | 'system';
  title: string;
  message: string;
  timestamp: string;
  read?: boolean;
  action_by?: string;
}

export type PatientMessageFilter = 'all' | 'doctor' | 'family';

export interface PatientMessage {
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
}
