import type { ClinicalCase, Database, TherapyLog, TreatmentParams } from '../types.js';

/** 5.1 医生临床经验案例库 — 15 组高保真数据 */
const KNOWLEDGE_BASE_RAW: Array<{
  case_id: number;
  doctor_id: number;
  input_age: number;
  input_wear: number;
  input_fluid: number;
  input_pain: number;
  output_left_force: number;
  output_right_force: number;
  output_duration: number;
  output_temp: number;
  output_vibration: number;
}> = [
  { case_id: 1, doctor_id: 1001, input_age: 65, input_wear: 4, input_fluid: 3, input_pain: 8, output_left_force: 25, output_right_force: 22, output_duration: 25, output_temp: 45, output_vibration: 2 },
  { case_id: 2, doctor_id: 1001, input_age: 55, input_wear: 2, input_fluid: 1, input_pain: 4, output_left_force: 15, output_right_force: 15, output_duration: 20, output_temp: 42, output_vibration: 1 },
  { case_id: 3, doctor_id: 1002, input_age: 72, input_wear: 5, input_fluid: 4, input_pain: 9, output_left_force: 30, output_right_force: 28, output_duration: 30, output_temp: 48, output_vibration: 0 },
  { case_id: 4, doctor_id: 1002, input_age: 32, input_wear: 1, input_fluid: 2, input_pain: 5, output_left_force: 12, output_right_force: 12, output_duration: 15, output_temp: 40, output_vibration: 1 },
  { case_id: 5, doctor_id: 1001, input_age: 60, input_wear: 3, input_fluid: 2, input_pain: 6, output_left_force: 18, output_right_force: 18, output_duration: 20, output_temp: 43, output_vibration: 2 },
  { case_id: 6, doctor_id: 1001, input_age: 68, input_wear: 4, input_fluid: 2, input_pain: 7, output_left_force: 22, output_right_force: 20, output_duration: 25, output_temp: 44, output_vibration: 1 },
  { case_id: 7, doctor_id: 1002, input_age: 50, input_wear: 2, input_fluid: 2, input_pain: 5, output_left_force: 16, output_right_force: 16, output_duration: 20, output_temp: 41, output_vibration: 2 },
  { case_id: 8, doctor_id: 1001, input_age: 75, input_wear: 5, input_fluid: 5, input_pain: 10, output_left_force: 32, output_right_force: 30, output_duration: 30, output_temp: 46, output_vibration: 0 },
  { case_id: 9, doctor_id: 1002, input_age: 28, input_wear: 1, input_fluid: 1, input_pain: 3, output_left_force: 10, output_right_force: 10, output_duration: 12, output_temp: 39, output_vibration: 1 },
  { case_id: 10, doctor_id: 1001, input_age: 63, input_wear: 3, input_fluid: 3, input_pain: 7, output_left_force: 20, output_right_force: 18, output_duration: 22, output_temp: 43, output_vibration: 2 },
  { case_id: 11, doctor_id: 1001, input_age: 57, input_wear: 3, input_fluid: 1, input_pain: 5, output_left_force: 16, output_right_force: 15, output_duration: 20, output_temp: 42, output_vibration: 1 },
  { case_id: 12, doctor_id: 1002, input_age: 70, input_wear: 4, input_fluid: 4, input_pain: 8, output_left_force: 26, output_right_force: 25, output_duration: 25, output_temp: 45, output_vibration: 0 },
  { case_id: 13, doctor_id: 1002, input_age: 35, input_wear: 2, input_fluid: 2, input_pain: 6, output_left_force: 14, output_right_force: 14, output_duration: 15, output_temp: 41, output_vibration: 1 },
  { case_id: 14, doctor_id: 1001, input_age: 66, input_wear: 4, input_fluid: 3, input_pain: 9, output_left_force: 28, output_right_force: 26, output_duration: 25, output_temp: 46, output_vibration: 2 },
  { case_id: 15, doctor_id: 1001, input_age: 52, input_wear: 1, input_fluid: 1, input_pain: 4, output_left_force: 12, output_right_force: 12, output_duration: 15, output_temp: 40, output_vibration: 1 },
];

function buildCaseName(age: number, wear: number, fluid: number, pain: number): string {
  return `临床案例 · ${age}岁 · 磨损${wear}级 · 积液${fluid}级 · 痛${pain}分`;
}

export function buildClinicalCases(): ClinicalCase[] {
  return KNOWLEDGE_BASE_RAW.map((row) => ({
    case_id: row.case_id,
    case_name: buildCaseName(row.input_age, row.input_wear, row.input_fluid, row.input_pain),
    doctor_id: String(row.doctor_id),
    symptoms: {
      age: row.input_age,
      cartilage_wear: row.input_wear,
      joint_fluid: row.input_fluid,
      pain_score: row.input_pain,
    },
    treatment: {
      left_force: row.output_left_force,
      right_force: row.output_right_force,
      duration: row.output_duration,
      temp: row.output_temp,
      vibration: row.output_vibration,
    },
  }));
}

export const initialClinicalCases = buildClinicalCases();

const DEMO_THERAPY_DATE = '2026-06-09';

function defaultDevice(params: TreatmentParams) {
  return {
    is_mock_mode: true,
    connection: 'bluetooth' as const,
    is_running: false,
    left_force: params.left_force,
    right_force: params.right_force,
    duration: params.duration,
    temp: params.temp,
    vibration: params.vibration,
    time_left_seconds: params.duration * 60,
    max_force_limit: 35,
    is_safety_clip_attached: true,
    battery_level: 92,
  };
}

function buildTherapyLogs(): TherapyLog[] {
  const base: TherapyLog[] = [
    {
      log_id: '9001',
      patient_id: '2001',
      therapy_date: DEMO_THERAPY_DATE,
      mode_used: 'Manual',
      is_completed: true,
      hardware_status: 'Normal',
      left_force: 22,
      right_force: 20,
      temp: 44,
    },
    {
      log_id: '9002',
      patient_id: '2002',
      therapy_date: DEMO_THERAPY_DATE,
      mode_used: 'AI',
      is_completed: false,
      hardware_status: 'Normal',
      left_force: 16,
      right_force: 15,
      temp: 42,
    },
    {
      log_id: '9003',
      patient_id: '2003',
      therapy_date: DEMO_THERAPY_DATE,
      mode_used: 'Cloud',
      is_completed: true,
      hardware_status: 'Normal',
    },
  ];

  // 过去 7 天依从性样本（王大爷 2001）
  const pastDays = ['2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07', '2026-06-08'];
  pastDays.forEach((date, i) => {
    base.push({
      log_id: `9001_${date}`,
      patient_id: '2001',
      therapy_date: date,
      mode_used: i % 2 === 0 ? 'AI' : 'Manual',
      is_completed: i >= 2,
      hardware_status: 'Normal',
      left_force: 20,
      right_force: 18,
      temp: 43,
    });
  });

  return base;
}

export function createSeedDatabase(): Database {
  const clinical_cases = buildClinicalCases();
  const caseFor2002 = clinical_cases.find((c) => c.case_id === 2)!;
  const wangPrescription = clinical_cases.find((c) => c.case_id === 1)!.treatment;

  const demoPrescriptionId = 'rx_seed_2001';
  const demoPrescriptionCreatedAt = '2026-06-22 10:00:00';

  return {
    schema_version: 2,
    users: [
      {
        id: '1001',
        role: 'doctor',
        phone: '13800138001',
        password: 'pass_doc_1',
        name: '李正清主任',
        doctor_id: '1001',
        created_at: '2026-05-01 09:00:00',
      },
      {
        id: '2001',
        role: 'patient',
        phone: '18612345678',
        password: 'pass_pat_1',
        name: '王大爷(自购型)',
        patient_id: '2001',
        created_at: '2026-06-01 08:30:00',
      },
      {
        id: '2002',
        role: 'patient',
        phone: '15599998888',
        password: 'pass_pat_2',
        name: '张阿姨(医嘱型)',
        patient_id: '2002',
        created_at: '2026-06-02 10:15:00',
      },
      {
        id: '2003',
        role: 'patient',
        phone: '17744445555',
        password: 'pass_pat_3',
        name: '程序员小李(年轻退行性)',
        patient_id: '2003',
        created_at: '2026-06-05 19:00:00',
      },
      {
        id: '3001',
        role: 'family',
        phone: '13099990000',
        password: 'pass_fam_1',
        name: '家人守护者(小王)',
        family_id: '3001',
        created_at: '2026-06-01 09:00:00',
      },
      {
        id: '1002',
        role: 'doctor',
        phone: '13800002002',
        password: 'pass_doc_2',
        name: '周慧敏医师',
        doctor_id: '1002',
        created_at: '2026-06-10 09:00:00',
      },
      {
        id: '2004',
        role: 'patient',
        phone: '18800002004',
        password: 'pass_pat_4',
        name: '刘女士(检流程)',
        patient_id: '2004',
        created_at: '2026-06-10 09:00:00',
      },
      {
        id: '3002',
        role: 'family',
        phone: '13000002002',
        password: 'pass_fam_2',
        name: '李先生(检流程)',
        family_id: '3002',
        created_at: '2026-06-10 09:00:00',
      },
      {
        id: '2005',
        role: 'patient',
        phone: '18900003005',
        password: 'pass_pat_5',
        name: '新人小陈(全新检流程)',
        patient_id: '2005',
        created_at: '2026-06-11 10:00:00',
      },
    ],
    patients: [
      {
        id: '2001',
        user_id: '2001',
        name: '王大爷',
        age: 67,
        phone: '186****5678',
        cartilage_wear: 4,
        joint_fluid: 3,
        pain_score: 7,
        auth_code: null,
        binding_doctor_id: '1001',
        auth_code_used: true,
        onboarding_completed: true,
        attendance_rate: 75,
        check_in_dates: ['2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07', '2026-06-08', DEMO_THERAPY_DATE],
        history: [
          { date: '2026-06-08', pain_score: 7, left_force: 20, right_force: 18, temp: 43 },
          { date: DEMO_THERAPY_DATE, pain_score: 7, left_force: 22, right_force: 20, temp: 44 },
        ],
        current_prescription: wangPrescription,
      },
      {
        id: '2002',
        user_id: '2002',
        name: '张阿姨',
        age: 58,
        phone: '155****8888',
        cartilage_wear: 2,
        joint_fluid: 1,
        pain_score: 4,
        auth_code: '883912',
        binding_doctor_id: '1001',
        auth_code_used: false,
        onboarding_completed: true,
        attendance_rate: 50,
        check_in_dates: ['2026-06-05', '2026-06-07'],
        history: [],
        current_prescription: caseFor2002.treatment,
      },
      {
        id: '2003',
        user_id: '2003',
        name: '程序员小李',
        age: 32,
        phone: '177****5555',
        cartilage_wear: 1,
        joint_fluid: 2,
        pain_score: 5,
        auth_code: null,
        binding_doctor_id: null,
        onboarding_completed: true,
        attendance_rate: 60,
        check_in_dates: ['2026-06-06', '2026-06-08', DEMO_THERAPY_DATE],
        history: [
          { date: DEMO_THERAPY_DATE, pain_score: 5, left_force: 12, right_force: 12, temp: 40 },
        ],
      },
      {
        id: '2004',
        user_id: '2004',
        name: '刘女士',
        age: 62,
        phone: '188****2004',
        cartilage_wear: 3,
        joint_fluid: 2,
        pain_score: 6,
        auth_code: null,
        binding_doctor_id: null,
        onboarding_completed: false,
        symptoms_assessed: false,
        attendance_rate: 0,
        check_in_dates: [],
        history: [],
      },
      {
        id: '2005',
        user_id: '2005',
        name: '小陈',
        age: 55,
        phone: '189****3005',
        cartilage_wear: 3,
        joint_fluid: 2,
        pain_score: 5,
        auth_code: null,
        binding_doctor_id: null,
        onboarding_completed: false,
        symptoms_assessed: false,
        attendance_rate: 0,
        check_in_dates: [],
        history: [],
      },
    ],
    doctors: [
      {
        id: '1001',
        user_id: '1001',
        name: '李正清主任',
        is_verified: true,
        dept: '骨科康复科',
        license_id: 'DOC-1001-KNEE',
      },
      {
        id: '1002',
        user_id: '1002',
        name: '周慧敏医师',
        is_verified: true,
        dept: '骨科康复科',
        license_id: 'DOC-1002-TEST',
      },
    ],
    clinical_cases,
    devices: {
      '2001': defaultDevice(wangPrescription),
      '2002': defaultDevice(caseFor2002.treatment),
      '2003': defaultDevice({ left_force: 12, right_force: 12, duration: 15, temp: 40, vibration: 1 }),
      '2004': {
        is_mock_mode: true,
        connection: 'disconnected',
        is_running: false,
        left_force: 15,
        right_force: 15,
        duration: 20,
        temp: 42,
        vibration: 1,
        time_left_seconds: 1200,
        max_force_limit: 35,
        is_safety_clip_attached: true,
        battery_level: 100,
      },
      '2005': {
        is_mock_mode: true,
        connection: 'disconnected',
        is_running: false,
        left_force: 15,
        right_force: 15,
        duration: 20,
        temp: 42,
        vibration: 1,
        time_left_seconds: 1200,
        max_force_limit: 35,
        is_safety_clip_attached: true,
        battery_level: 100,
      },
    },
    sessions: [],
    prescriptions: [
      {
        id: demoPrescriptionId,
        doctor_id: '1001',
        patient_id: '2001',
        params: wangPrescription,
        status: 'pending',
        created_at: demoPrescriptionCreatedAt,
      },
    ],
    nudges: [],
    notifications: [
      {
        id: 'not_seed_rx_2001',
        user_id: '2001',
        type: 'prescription',
        title: '主治医生下发特制理疗贴方',
        message:
          '骨科康复科李正清主任针对您今日的疼痛指数，特别下发了左侧 25N, 右侧 22N, 恒温温热 45℃ 的处方方案。',
        timestamp: demoPrescriptionCreatedAt,
        read: false,
        action_by: '李正清主任',
      },
    ],
    family_bindings: [
      {
        id: '501',
        family_user_id: '3001',
        patient_id: '2001',
        patient_name: '王大爷',
        patient_phone: '186****5678',
        remind_status: false,
        emergency_contact: true,
        created_at: '2026-06-01 10:00:00',
      },
    ],
    check_ins: [
      { id: 'ci_2001_1', patient_id: '2001', date: '2026-06-03', type: 'therapy', created_at: '2026-06-03T08:00:00Z' },
      { id: 'ci_2001_2', patient_id: '2001', date: '2026-06-04', type: 'therapy', created_at: '2026-06-04T08:00:00Z' },
      { id: 'ci_2001_3', patient_id: '2001', date: '2026-06-05', type: 'therapy', created_at: '2026-06-05T08:00:00Z' },
      { id: 'ci_2001_4', patient_id: '2001', date: '2026-06-06', type: 'therapy', created_at: '2026-06-06T08:00:00Z' },
      { id: 'ci_2001_5', patient_id: '2001', date: '2026-06-07', type: 'therapy', created_at: '2026-06-07T08:00:00Z' },
      { id: 'ci_2001_6', patient_id: '2001', date: '2026-06-08', type: 'therapy', created_at: '2026-06-08T08:00:00Z' },
      { id: 'ci_2001_7', patient_id: '2001', date: DEMO_THERAPY_DATE, type: 'therapy', created_at: `${DEMO_THERAPY_DATE}T08:00:00Z` },
      { id: 'ci_2002_1', patient_id: '2002', date: '2026-06-05', type: 'therapy', created_at: '2026-06-05T08:00:00Z' },
      { id: 'ci_2002_2', patient_id: '2002', date: '2026-06-07', type: 'therapy', created_at: '2026-06-07T08:00:00Z' },
      { id: 'ci_2003_1', patient_id: '2003', date: '2026-06-06', type: 'exercise', created_at: '2026-06-06T08:00:00Z' },
      { id: 'ci_2003_2', patient_id: '2003', date: '2026-06-08', type: 'therapy', created_at: '2026-06-08T08:00:00Z' },
      { id: 'ci_2003_3', patient_id: '2003', date: DEMO_THERAPY_DATE, type: 'exercise', created_at: `${DEMO_THERAPY_DATE}T08:00:00Z` },
    ],
    therapy_logs: buildTherapyLogs(),
    auth_codes: [
      {
        code: '883912',
        doctor_id: '1001',
        patient_id: '2002',
        params: caseFor2002.treatment,
        used: false,
      },
      {
        code: '662918',
        doctor_id: '1002',
        patient_id: '2004',
        params: {
          left_force: 18,
          right_force: 16,
          duration: 20,
          temp: 43,
          vibration: 1,
        },
        used: false,
      },
      {
        code: '775520',
        doctor_id: '1002',
        patient_id: '2005',
        params: {
          left_force: 17,
          right_force: 15,
          duration: 20,
          temp: 42,
          vibration: 1,
        },
        used: false,
      },
    ],
    bind_qr_tokens: {},
    sms_codes: {},
    physical_devices: [
      {
        device_id: 'KJ-DEMO-001',
        token: 'kneejoy-demo-token-2026',
        patient_id: '2001',
        name: '膝悦演示理疗仪 #1',
        pending_command: null,
        last_seen_at: null,
      },
      {
        device_id: 'KJ-DEMO-002',
        token: 'kneejoy-demo-token-2026',
        patient_id: '2002',
        name: '膝悦演示理疗仪 #2',
        pending_command: null,
        last_seen_at: null,
      },
    ],
    auth_tokens: {},
  };
}
