/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Square, Sparkles, Sliders, Calendar, CalendarDays, Award, Settings, 
  HelpCircle, ShieldCheck, Heart, Radio, RefreshCw, UserCheck, AlertTriangle,
  ArrowLeft, MessageSquare, Check, ChevronRight, Bell, ClipboardList, Lightbulb,
  PersonStanding, Zap, Footprints, BookOpen, Timer, Lock, Sprout, Trees, Shield,
  HeartHandshake, Users, LogOut, Trophy, TrendingUp, Mountain, Bluetooth, Wifi, Send,
} from 'lucide-react';
import {
  SymptomInput,
  TreatmentParams,
  ClinicalCase,
  HardwareState,
  PatientProfile,
  PatientFamilyBinding,
  PatientMessage,
  HardwareUpdateOptions,
} from '../types';
import { calculateEuclideanMatch } from '../data';
import {
  redeemDoctorCode,
  updatePatientSymptoms,
  getPatientMessages,
  markPatientMessageRead,
  markNotificationRead,
  markNudgeRead,
} from '../api/client';
import HardwareConnectingOverlay from './HardwareConnectingOverlay';
import PatientMessageCenter from './PatientMessageCenter';
import AppNavBar, { AppNavStatusBadge } from './AppNavBar';
import KneeJoyBrandIcon from './KneeJoyBrandIcon';
import type { ConnectionPhase, ConnectionProgress, HardwareTransport } from '../hardware/types';
import {
  getStoredDeviceId,
  isMqttHardwareMode,
  canSyncToPhysicalDevice,
} from '../hardware';
import MotorRetractPanel from './MotorRetractPanel';
import EstopControl from './EstopControl';

type SymptomFormState = {
  age: number | '';
  cartilage_wear: number | '';
  joint_fluid: number | '';
  pain_score: number | '';
};

const EMPTY_SYMPTOM: SymptomFormState = {
  age: '',
  cartilage_wear: '',
  joint_fluid: '',
  pain_score: '',
};

/** 是否已有可执行的理疗方案（自评匹配已采纳 / 医嘱导入 / 医生处方） */
function hasTreatmentPlan(profile: PatientProfile): boolean {
  return (
    profile.onboarding_completed === true ||
    profile.auth_code_used === true ||
    Boolean(profile.current_prescription)
  );
}

function shouldActivateColdBoot(profile: PatientProfile): boolean {
  if (hasTreatmentPlan(profile)) return false;
  if (profile.symptoms_assessed) return false;
  return true;
}

function resolveInitialTherapyStep(
  profile: PatientProfile
): 'symptom' | 'matching' | 'chat_support' | 'control' {
  return hasTreatmentPlan(profile) ? 'control' : 'symptom';
}

function isSymptomComplete(form: SymptomFormState): boolean {
  return (
    form.age !== '' &&
    form.cartilage_wear !== '' &&
    form.joint_fluid !== '' &&
    form.pain_score !== ''
  );
}

function toSymptomInput(form: SymptomFormState): SymptomInput {
  return {
    age: Number(form.age),
    cartilage_wear: Number(form.cartilage_wear),
    joint_fluid: Number(form.joint_fluid),
    pain_score: Number(form.pain_score),
  };
}

function profileToSymptomForm(profile: PatientProfile): SymptomFormState {
  return {
    age: profile.age,
    cartilage_wear: profile.cartilage_wear,
    joint_fluid: profile.joint_fluid,
    pain_score: profile.pain_score,
  };
}

interface PatientAppProps {
  clinicalCases: ClinicalCase[];
  patientProfile: PatientProfile;
  hardwareState: HardwareState;
  onUpdateHardware: (updates: Partial<HardwareState>, options?: HardwareUpdateOptions) => void;
  onSendHardwareAction: (commandLog: string) => void;
  checkInDates: string[];
  onAddCheckIn: (date: string) => void;
  familyNudgeReceived: string | null;
  onClearNudge: () => void;
  remotePrescription: TreatmentParams | null;
  onAcceptPrescription: (prescription: TreatmentParams) => Promise<void>;
  prescriptionDetailOpen?: boolean;
  prescriptionReviewMeta?: {
    title: string;
    message: string;
    timestamp: string;
    action_by?: string;
  } | null;
  onClosePrescriptionDetail?: () => void;
  onOpenDoctorMessage?: (message: PatientMessage) => void;
  onLogout?: () => void;
  apiOnline?: boolean;
  familyBindings?: PatientFamilyBinding[];
  connectionPhase?: ConnectionPhase;
  connectingTransport?: HardwareTransport | null;
  connectionProgress?: ConnectionProgress | null;
  connectionError?: string | null;
  onConnectDevice?: (transport: HardwareTransport) => void;
  onDisconnectDevice?: () => void;
  onCancelConnect?: () => void;
  onPatientProfileUpdate?: (profile: PatientProfile) => void;
}

export default function PatientApp({
  clinicalCases,
  patientProfile,
  hardwareState,
  onUpdateHardware,
  onSendHardwareAction,
  checkInDates,
  onAddCheckIn,
  familyNudgeReceived,
  onClearNudge,
  remotePrescription,
  onAcceptPrescription,
  prescriptionDetailOpen = false,
  prescriptionReviewMeta = null,
  onClosePrescriptionDetail,
  onOpenDoctorMessage,
  onLogout,
  apiOnline = false,
  familyBindings = [],
  connectionPhase = 'disconnected',
  connectingTransport = null,
  connectionProgress = null,
  connectionError = null,
  onConnectDevice,
  onDisconnectDevice,
  onCancelConnect,
  onPatientProfileUpdate,
}: PatientAppProps) {
  const isConnecting = connectionPhase === 'connecting';
  const isHardwareLinked =
    !isConnecting &&
    connectionPhase !== 'failed' &&
    (isMqttHardwareMode()
      ? hardwareState.connection === 'wifi' && !hardwareState.is_mock_mode
      : hardwareState.connection !== 'disconnected');

  const [activeTab, setActiveTab] = useState<'therapy' | 'incentive' | 'settings'>('therapy');
  const [therapyStep, setTherapyStep] = useState<
    'symptom' | 'matching' | 'chat_support' | 'control'
  >(() => resolveInitialTherapyStep(patientProfile));

  const isClinicalAssessmentFlow =
    therapyStep === 'symptom' ||
    therapyStep === 'matching' ||
    therapyStep === 'chat_support';
  const showOfflineRehabDashboard = false;
  const showControlPanel = therapyStep === 'control';
  /** 详细徒手动作库与控制面板/离线简版首页分开展示，避免同屏混排 */
  const showDetailedManualExerciseLibrary = false;

  // Inner step sequence for 'therapy' tab:
  // - 'symptom': Step 1 form
  // - 'matching': The optimal recommendation reviewed by user to Accept / Refuse
  // - 'chat_support': Live interactive chat support with Dr. Li
  // - 'control': Step 2 treatment console

  // Live chat messages state for clinical assistance
  const [chatMessages, setChatMessages] = useState<Array<{ 
    sender: 'user' | 'doctor', 
    text: string, 
    time: string, 
    isAction?: boolean,
    actionParams?: TreatmentParams 
  }>>([
    { 
      sender: 'doctor', 
      text: '您好！我是三甲博爱医学中心的李敬东主任医师。我收到了您的智能自测数据（62岁伴随中度软骨磨损与积液）。请问推荐的智能配方在强度或时效上，您有任何疑问或不适顾虑吗？我会在线协助您修正特定参数。', 
      time: '18:29' 
    }
  ]);

  // Is typing simulator state for doctor chatbot realism
  const [isDoctorTyping, setIsDoctorTyping] = useState<boolean>(false);
  const [chatDraft, setChatDraft] = useState<string>('');

  // Newcomer Coldboot States
  const [isColdBootActive, setIsColdBootActive] = useState<boolean>(() =>
    shouldActivateColdBoot(patientProfile)
  );
  const [coldBootMethod, setColdBootMethod] = useState<'selection' | 'doctor' | 'assessment'>(
    'selection'
  );
  const [doctorCodeInput, setDoctorCodeInput] = useState<string>('');
  const [coldBootForm, setColdBootForm] = useState<SymptomFormState>(EMPTY_SYMPTOM);

  const [symptomForm, setSymptomForm] = useState<SymptomFormState>(() =>
    hasTreatmentPlan(patientProfile) || patientProfile.symptoms_assessed
      ? profileToSymptomForm(patientProfile)
      : EMPTY_SYMPTOM
  );

  const [messageCenterOpen, setMessageCenterOpen] = useState(false);
  const [patientMessages, setPatientMessages] = useState<PatientMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const loadPatientMessages = async () => {
    if (!apiOnline) return;
    setMessagesLoading(true);
    try {
      const res = await getPatientMessages();
      setPatientMessages((prev) => {
        const prevRead = new Map(prev.map((m) => [m.id, m.read]));
        return res.messages.map((m) => ({
          ...m,
          read: m.read || prevRead.get(m.id) === true,
        }));
      });
    } catch {
      /* offline fallback */
    } finally {
      setMessagesLoading(false);
    }
  };

  useEffect(() => {
    if (apiOnline) loadPatientMessages();
  }, [apiOnline, patientProfile.id]);

  useEffect(() => {
    if (messageCenterOpen && apiOnline) loadPatientMessages();
  }, [messageCenterOpen]);

  useEffect(() => {
    if (!apiOnline) return;
    const timer = setInterval(() => loadPatientMessages(), 5000);
    return () => clearInterval(timer);
  }, [apiOnline, patientProfile.id]);

  useEffect(() => {
    if (apiOnline && familyNudgeReceived) loadPatientMessages();
  }, [familyNudgeReceived, apiOnline]);

  const messageUnreadCount = patientMessages.filter((m) => !m.read).length;

  const handleMarkMessageRead = (msg: PatientMessage) => {
    if (msg.read) return;
    setPatientMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, read: true } : m))
    );
    if (!apiOnline) return;
    markPatientMessageRead(msg.id)
      .catch(() => {
        if (msg.nudge_id) markNudgeRead(msg.nudge_id).catch(() => undefined);
        if (msg.notification_id) markNotificationRead(msg.notification_id).catch(() => undefined);
      });
  };

  const handleSelectMessage = (msg: PatientMessage) => {
    if (msg.category === 'doctor' && msg.prescription_params) {
      setMessageCenterOpen(false);
      onOpenDoctorMessage?.(msg);
    }
  };

  const patientBootRef = useRef<string | null>(null);

  useEffect(() => {
    if (patientBootRef.current === patientProfile.id) return;
    patientBootRef.current = patientProfile.id;

    const planReady = hasTreatmentPlan(patientProfile);
    if (planReady) {
      setIsColdBootActive(false);
      setTherapyStep('control');
      setSymptomForm(profileToSymptomForm(patientProfile));
      return;
    }
    if (patientProfile.symptoms_assessed) {
      setIsColdBootActive(false);
      setTherapyStep('symptom');
      setSymptomForm(profileToSymptomForm(patientProfile));
      return;
    }
    setIsColdBootActive(true);
    setColdBootMethod(
      patientProfile.binding_doctor_id && !patientProfile.auth_code_used
        ? 'doctor'
        : 'selection'
    );
    setTherapyStep('symptom');
    setColdBootForm(EMPTY_SYMPTOM);
    setSymptomForm(EMPTY_SYMPTOM);
    setDoctorCodeInput('');
  }, [patientProfile.id]);

  // 已移除：连接设备后强制跳回自评的 effect（会导致连上 MQTT 后控制面板闪退）

  const [lastMatchResult, setLastMatchResult] = useState<{
    case_name: string;
    similarity: number;
    details: ClinicalCase;
  } | null>(null);

  // Manual parameters override toggler
  const [isManualMode, setIsManualMode] = useState<boolean>(false);

  // Temporary holding parameters for editing
  const [tempParams, setTempParams] = useState<TreatmentParams>({
    left_force: 15,
    right_force: 15,
    duration: 20,
    temp: 42,
    vibration: 1
  });

  // 设备参数变更时同步到微调缓存（处方更新、医嘱下发等）
  useEffect(() => {
    if (hardwareState.is_running) return;
    setTempParams({
      left_force: hardwareState.left_force,
      right_force: hardwareState.right_force,
      duration: hardwareState.duration,
      temp: hardwareState.temp,
      vibration: hardwareState.vibration,
    });
  }, [
    hardwareState.is_running,
    hardwareState.left_force,
    hardwareState.right_force,
    hardwareState.duration,
    hardwareState.temp,
    hardwareState.vibration,
  ]);

  /** 控制面板展示：未解锁微调时显示设备当前参数，解锁后显示微调缓存 */
  const controlPanelParams: TreatmentParams = isManualMode
    ? tempParams
    : {
        left_force: hardwareState.left_force,
        right_force: hardwareState.right_force,
        duration: hardwareState.duration,
        temp: hardwareState.temp,
        vibration: hardwareState.vibration,
      };

  // Connections and offline exercise states
  const [errConnectionLockMessage, setErrConnectionLockMessage] = useState<string | null>(null);
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [exerciseTimer, setExerciseTimer] = useState<number>(30);
  const [isExerciseRunning, setIsExerciseRunning] = useState<boolean>(false);
  const [completedExercises, setCompletedExercises] = useState<string[]>([]);
  const [activeScienceArticleId, setActiveScienceArticleId] = useState<string | null>(null);
  const [isApplyingPrescription, setIsApplyingPrescription] = useState(false);

  const vibrationLabel = (v: number) => {
    if (v === 0) return '无振动';
    if (v === 1) return '低频揉和';
    return '高频舒张';
  };

  const getExerciseName = (id: string) => {
    if (id === 'wall_squat') return '靠墙无感静蹲';
    if (id === 'leg_raise') return '坐姿单腿平抬';
    if (id === 'ankle_pump') return '踝泵消胀拉伸';
    return '徒手运动';
  };

  useEffect(() => {
    let interval: any = null;
    if (isExerciseRunning && exerciseTimer > 0) {
      interval = setInterval(() => {
        setExerciseTimer(prev => prev - 1);
      }, 1000);
    } else if (exerciseTimer === 0 && isExerciseRunning) {
      setIsExerciseRunning(false);
      if (activeExerciseId) {
        if (!completedExercises.includes(activeExerciseId)) {
          setCompletedExercises(prev => [...prev, activeExerciseId]);
        }
        onSendHardwareAction(`[物理运动完成] 患者免设备完成了【${getExerciseName(activeExerciseId)}】30秒标准呼吸等长练习跟练打卡！`);
      }
    }
    return () => clearInterval(interval);
  }, [isExerciseRunning, exerciseTimer, activeExerciseId]);

  // Handle AI Recommendation logic
  const handleAIRecommendation = () => {
    if (!isSymptomComplete(symptomForm)) {
      alert('请先完整填写症状自评信息');
      return;
    }
    const symptoms = toSymptomInput(symptomForm);
    const { matchedCase, distance, allDistances } = calculateEuclideanMatch(symptoms, clinicalCases);
    const selfDistance = allDistances.find(d => d.case_id === matchedCase.case_id);
    const similarity = selfDistance ? selfDistance.score : 90;

    // Set match result but do NOT inject directly yet. Let patient review first.
    setLastMatchResult({
      case_name: matchedCase.case_name,
      similarity: similarity,
      details: matchedCase
    });

    // Take patient to the Matching Review screen to accept or contact online doctor
    setTherapyStep('matching');

    // Send mock packages logs
    const triggerLog = `[AI推荐诊断] 智能症状自评估(欧氏距离D=${distance.toFixed(3)})计算成功。最佳重合病历方案: "${matchedCase.case_name}" (相似度: ${similarity}%)。正在呈递方案予患者审阅。`;
    onSendHardwareAction(triggerLog);
  };

  // Helper: Patient Accepts recommended design parameters
  const handleAcceptAIRecommendation = () => {
    if (!lastMatchResult) return;
    const matched = lastMatchResult.details;

    // Safe loads to treatment params and hardware state
    setTempParams({
      left_force: matched.treatment.left_force,
      right_force: matched.treatment.right_force,
      duration: matched.treatment.duration,
      temp: matched.treatment.temp,
      vibration: matched.treatment.vibration
    });

    onUpdateHardware({
      left_force: matched.treatment.left_force,
      right_force: matched.treatment.right_force,
      duration: matched.treatment.duration,
      temp: matched.treatment.temp,
      vibration: matched.treatment.vibration,
      time_left_seconds: matched.treatment.duration * 60
    });

    setIsManualMode(false);
    setTherapyStep('control');
    if (apiOnline) {
      updatePatientSymptoms(toSymptomInput(symptomForm), { onboarding_completed: true }).catch(
        () => undefined
      );
    }

    const logMsg = `[患者采纳方案] 用户接受并加载了"${lastMatchResult.case_name}"的推荐AI理疗方案！参数已成功下发至底层传感器。`;
    onSendHardwareAction(logMsg);
  };

  // Interactive Live Chat response simulation
  const handleSendChatMessage = (optionText: string, actionType?: number) => {
    const trimmed = optionText.trim();
    if (!trimmed || isDoctorTyping) return;

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const userMsg = { sender: 'user' as const, text: trimmed, time: timeStr };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatDraft('');
    setIsDoctorTyping(true);

    setTimeout(() => {
      let docText = '';
      let targetParams: TreatmentParams = {
        left_force: 15,
        right_force: 15,
        temp: 42,
        duration: 20,
        vibration: 1,
      };

      if (actionType === 1) {
        docText = `针对您反馈的高痛感局域表现（当前自测VAS ${symptomForm.pain_score}分），强牵拉容易引起韧带与滑液囊的防御性紧绷。建议您第一周期采用温和的12N拉力自适应微调！红外热敷保持在43℃，促进局部炎性物质消退。我已经为您专门重新配置了下方的特配理疗包。`;
        targetParams = { left_force: 12, right_force: 12, temp: 43, duration: 20, vibration: 1 };
      } else if (actionType === 2) {
        docText = `关节积液量在 ${symptomForm.joint_fluid} 级（少量中量出液）通常处于炎症发红消胀期。此时建议温度控制在39℃低温热敷促进吸收，不宜大负荷揉捏。我已将时限改短为15分钟以保万全，您可以直接一键应用特配方案。`;
        targetParams = { left_force: 11, right_force: 11, temp: 39, duration: 15, vibration: 0 };
      } else if (actionType === 3) {
        docText = `陈旧性骨折与半月板退行性损伤对高负载极为抗拒。为了防止二次剪切压强伤害，建议使用特配的“陈旧性小肌群微负压防护操”。牵引拉力卡死在 10N 起步安全阈值，热温40℃配合低频轻震。配方已为您定制！`;
        targetParams = { left_force: 10, right_force: 10, temp: 40, duration: 18, vibration: 1 };
      } else {
        docText = `我已收到您的补充描述。结合您当前 VAS ${symptomForm.pain_score} 分、磨损 ${symptomForm.cartilage_wear} 级与积液 ${symptomForm.joint_fluid} 级的自评结果，建议先从低拉力、短时长起步，若出现刺痛或肿胀加重请立即停止并告知我。下方为您生成一版更保守的特调参数，可一键同步至理疗中枢。`;
        const base = lastMatchResult?.details?.treatment;
        targetParams = {
          left_force: Math.max(10, (base?.left_force ?? 15) - 3),
          right_force: Math.max(10, (base?.right_force ?? 15) - 3),
          temp: Math.min(43, base?.temp ?? 42),
          duration: Math.max(15, (base?.duration ?? 20) - 3),
          vibration: base?.vibration ?? 1,
        };
      }

      setChatMessages((prev) => [
        ...prev,
        { sender: 'doctor' as const, text: docText, time: timeStr },
        {
          sender: 'doctor' as const,
          text: `【三甲专家特配处方包】参数已为您直接回传至中枢：拉引力 ${targetParams.left_force}N, 恒温加热 ${targetParams.temp}℃, 恒湿理疗 ${targetParams.duration}分钟。`,
          time: timeStr,
          isAction: true,
          actionParams: targetParams,
        },
      ]);
      setIsDoctorTyping(false);

      onSendHardwareAction(
        `[医患在线干预] 临床支持专家李敬东重设底层处方：L_F=${targetParams.left_force}N, Temp=${targetParams.temp}℃, 时限 ${targetParams.duration}m`
      );
    }, 1200);
  };

  const handleSendChatOption = (optionText: string, actionType: number) => {
    handleSendChatMessage(optionText, actionType);
  };

  // Doctor treatment parameter adoption
  const handleAcceptDoctorParams = (params: TreatmentParams) => {
    setTempParams(params);
    onUpdateHardware({
      left_force: params.left_force,
      right_force: params.right_force,
      duration: params.duration,
      temp: params.temp,
      vibration: params.vibration,
      time_left_seconds: params.duration * 60
    });
    setIsManualMode(false); // Lock to physician safe parameters
    setTherapyStep('control');

    onSendHardwareAction(`[专家组套确认] 患者采纳了博爱在线医学团队推荐并特别定制调整的随诊物理参数！`);
  };

  // Toggle Therapy
  const handleToggleTherapy = () => {
    if (!canSyncToPhysicalDevice(hardwareState)) {
      if (isMqttHardwareMode()) {
        alert('请先完成 MQTT 云端连接：点击顶部连接开关，或到「设置 → MQTT 云端连接」。');
      } else {
        alert('未连接物理理疗硬件！已经为您激活【居家徒手云康复模式】。请在上方黄色卡片处一键点击“跟练并完成今日打卡”，或者点击上方滑钮开启蓝牙并开启设备后再开始高压引索。');
      }
      return;
    }
    if (hardwareState.is_running) {
      // STOP
      onUpdateHardware({ is_running: false }, { syncRunToDevice: true });
      onSendHardwareAction(`[物理治疗阻断] 患者手动紧急终止了当前治疗进程，机械缸卸载压力清空`);
    } else {
      // Verify safety clip
      if (!hardwareState.is_safety_clip_attached) {
        onSendHardwareAction(`[硬件报警终止] 发送错误: 物理防夹防滑空载保护塞(Safety-Clip)未插紧！治疗无法启动。`);
        alert('安全警报：请在左侧硬件面板上先插紧物理安全塞以确保操作安全。');
        return;
      }

      // START
      const runningLeft = isManualMode ? tempParams.left_force : hardwareState.left_force;
      const runningRight = isManualMode ? tempParams.right_force : hardwareState.right_force;
      const runningDur = isManualMode ? tempParams.duration : hardwareState.duration;
      const runningTemp = isManualMode ? tempParams.temp : hardwareState.temp;
      const runningVib = isManualMode ? tempParams.vibration : hardwareState.vibration;

      // safety cap overrides
      if (runningLeft > hardwareState.max_force_limit || runningRight > hardwareState.max_force_limit) {
        onSendHardwareAction(`[超限防护重整] 系统检测到力值设定过高。安全过载保护已激活，强制重调拉力至安全范围最大限度${hardwareState.max_force_limit}N`);
        return;
      }

      onUpdateHardware(
        {
          is_running: true,
          left_force: runningLeft,
          right_force: runningRight,
          duration: runningDur,
          temp: runningTemp,
          vibration: runningVib,
          time_left_seconds: runningDur * 60,
        },
        { syncRunToDevice: true }
      );

      onSendHardwareAction(`[理疗开始命令] 软件封装串行指令发包 -> @STxCMD: L_F=${runningLeft}N, R_F=${runningRight}N, TEMP=${runningTemp}℃, VIB=${runningVib}档`);
    }
  };

  const handleConfirmPrescriptionUpdate = async () => {
    if (!remotePrescription || isApplyingPrescription) return;
    setIsApplyingPrescription(true);
    const rx = remotePrescription;
    setTempParams({
      left_force: rx.left_force,
      right_force: rx.right_force,
      duration: rx.duration,
      temp: rx.temp,
      vibration: rx.vibration,
    });
    try {
      await onAcceptPrescription(rx);
      setIsManualMode(false);
      setTherapyStep('control');
      setActiveTab('therapy');
    } catch (err) {
      alert(err instanceof Error ? err.message : '处方应用失败，请重试');
    } finally {
      setIsApplyingPrescription(false);
    }
  };

  const handleApplyDoctorPrescription = async () => {
    const rx = patientProfile.current_prescription;
    if (!rx || isApplyingPrescription) return;
    setIsApplyingPrescription(true);
    setTempParams({
      left_force: rx.left_force,
      right_force: rx.right_force,
      duration: rx.duration,
      temp: rx.temp,
      vibration: rx.vibration,
    });
    try {
      await onAcceptPrescription(rx);
      setIsManualMode(false);
      setTherapyStep('control');
      setActiveTab('therapy');
    } catch (err) {
      alert(err instanceof Error ? err.message : '医嘱应用失败，请重试');
    } finally {
      setIsApplyingPrescription(false);
    }
  };

  // Cold start completion triggers
  const handleDoctorCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = doctorCodeInput.trim();
    if (code.length < 4) {
      alert('授权码有误，请输入医生提供的 6 位数字授权码（张阿姨演示码：883912）');
      return;
    }
    try {
      if (apiOnline) {
        const res = await redeemDoctorCode(code);
        onUpdateHardware(res.device);
        onSendHardwareAction(
          `[授权码导入成功] 已导入${res.doctor_name ?? '主治医生'}定制处方 -> L=${res.params.left_force}N, R=${res.params.right_force}N`
        );
      } else {
        onUpdateHardware({
          left_force: 15,
          right_force: 15,
          duration: 20,
          temp: 42,
          vibration: 1,
          connection: 'bluetooth',
          time_left_seconds: 20 * 60,
        });
        onSendHardwareAction(`[离线模式] 授权码「${code}」已本地载入演示参数`);
      }
      setIsManualMode(false);
      setIsColdBootActive(false);
      setTherapyStep('control');
      setActiveTab('therapy');
    } catch (err) {
      alert(err instanceof Error ? err.message : '授权码无效或已使用');
    }
  };

  const handleAssessmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSymptomComplete(coldBootForm)) {
      alert('请完整填写年龄、磨损度、积液量和疼痛评分');
      return;
    }
    const symptoms = toSymptomInput(coldBootForm);
    try {
      if (apiOnline) {
        const updated = await updatePatientSymptoms(symptoms);
        onPatientProfileUpdate?.(updated);
      }
      setSymptomForm(coldBootForm);
      setIsColdBootActive(false);
      setTherapyStep('symptom');
      setActiveTab('therapy');
      onSendHardwareAction(
        `[新手症状填报] 用户完成初次症状自评：年龄${symptoms.age}岁，进入智能评估匹配流程`
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : '症状保存失败');
    }
  };

  const mqttMode = isMqttHardwareMode();
  const preferredTransport = (): HardwareTransport => (mqttMode ? 'wifi' : 'bluetooth');

  const handleConnectionToggle = () => {
    if (hardwareState.is_running) {
      setErrConnectionLockMessage(
        '温馨提示：理疗仪正在带载高压牵引！这时候断开蓝牙可能容易发生意外。系统安全保护已经锁死开关。如果您想断开，请先至下方点击【结束治疗 (紧急停机卸压)】。'
      );
      onSendHardwareAction(
        '[安全阻断] 拦截用户在带载拉伸热敷阶段断开蓝牙的操作，防止意外高压无法泄压。'
      );
      window.setTimeout(() => setErrConnectionLockMessage(null), 8000);
      return;
    }
    setErrConnectionLockMessage(null);
    if (isHardwareLinked) {
      onDisconnectDevice?.();
      onSendHardwareAction('[蓝牙切换] 用户手动断开设备硬件连接');
    } else if (!isConnecting) {
      onConnectDevice?.(preferredTransport());
      onSendHardwareAction(
        mqttMode
          ? '[云端连接] 用户发起 MQTT/Wi-Fi 连接请求'
          : '[蓝牙切换] 用户发起蓝牙连接请求，进入配对流程'
      );
    }
  };

  const handleTransportConnect = (transport: HardwareTransport) => {
    if (isConnecting) return;
    const effective = mqttMode && transport === 'bluetooth' ? 'wifi' : transport;
    if (isHardwareLinked && hardwareState.connection === effective) return;
    onConnectDevice?.(effective);
    onSendHardwareAction(
      mqttMode
        ? `[云端绑定] 用户发起 MQTT 连接（设备 ${getStoredDeviceId() || '未配置 ID'}）`
        : `[端口绑定] 用户发起 ${transport === 'bluetooth' ? '蓝牙 BLE' : 'Wi-Fi'} 连接请求`
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full select-none text-slate-800 relative bg-slate-50">

      {isConnecting && connectingTransport && onCancelConnect && (
        <HardwareConnectingOverlay
          transport={connectingTransport}
          progress={connectionProgress}
          onCancel={onCancelConnect}
        />
      )}

      {messageCenterOpen && (
        <PatientMessageCenter
          messages={patientMessages}
          loading={messagesLoading}
          onClose={() => setMessageCenterOpen(false)}
          onSelectMessage={handleSelectMessage}
          onMarkRead={handleMarkMessageRead}
        />
      )}

      {prescriptionDetailOpen && (
        <div
          className="absolute inset-0 z-[60] bg-slate-50 flex flex-col animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-label="医生处方详情"
        >
          <AppNavBar
            title="医生处方详情"
            onBack={onClosePrescriptionDetail}
            className="bg-white"
          />

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            <div className="bg-indigo-950 text-white rounded-3xl p-4 shadow-lg">
              <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider inline-flex items-center gap-1">
                <ClipboardList size={12} strokeWidth={2.2} />
                权威医生处方
              </span>
              <h3 className="text-sm font-black mt-1 leading-snug">
                {prescriptionReviewMeta?.title ?? '主治医生下发特制理疗贴方'}
              </h3>
              {prescriptionReviewMeta?.action_by && (
                <p className="text-[10px] text-indigo-200 mt-1">
                  开具医生：{prescriptionReviewMeta.action_by}
                </p>
              )}
              <p className="text-xs text-indigo-100/90 mt-2 leading-relaxed">
                {prescriptionReviewMeta?.message ??
                  '您的医生为您更新了今日理疗参数，请确认后一键同步至设备。'}
              </p>
              {prescriptionReviewMeta?.timestamp && (
                <p className="text-[9px] text-indigo-300/80 mt-2 font-mono">
                  {prescriptionReviewMeta.timestamp}
                </p>
              )}
            </div>

            {remotePrescription ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm flex flex-col gap-3">
                <h4 className="text-xs font-black text-slate-800">新方案参数预览</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[9px] text-slate-400 font-bold">左侧牵引拉力</span>
                    <p className="text-lg font-black text-indigo-600 font-mono mt-0.5">
                      {remotePrescription.left_force} N
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[9px] text-slate-400 font-bold">右侧牵引拉力</span>
                    <p className="text-lg font-black text-indigo-600 font-mono mt-0.5">
                      {remotePrescription.right_force} N
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[9px] text-slate-400 font-bold">红外热敷温度</span>
                    <p className="text-lg font-black text-rose-500 font-mono mt-0.5">
                      {remotePrescription.temp} ℃
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[9px] text-slate-400 font-bold">理疗时长</span>
                    <p className="text-lg font-black text-slate-800 font-mono mt-0.5">
                      {remotePrescription.duration} 分钟
                    </p>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[9px] text-slate-400 font-bold">按摩振动模式</span>
                  <p className="text-sm font-black text-slate-800 mt-0.5">
                    {vibrationLabel(remotePrescription.vibration)}
                  </p>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-100 rounded-2xl text-[10px] text-amber-900 leading-relaxed">
                  当前控制面板参数：
                  左 {hardwareState.left_force}N / 右 {hardwareState.right_force}N /{' '}
                  {hardwareState.temp}℃ / {hardwareState.duration} 分钟。确认更新后将替换为上方新方案。
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                正在加载处方参数…
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-100 bg-white flex flex-col gap-2 shrink-0">
            <button
              type="button"
              disabled={!remotePrescription || isApplyingPrescription}
              onClick={handleConfirmPrescriptionUpdate}
              className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-black shadow-lg shadow-indigo-200 transition active:scale-[0.98]"
            >
              {isApplyingPrescription ? '正在更新…' : '一键更新治疗方案'}
            </button>
            <button
              type="button"
              onClick={onClosePrescriptionDetail}
              className="w-full py-2.5 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
            >
              稍后再说
            </button>
          </div>
        </div>
      )}

      {!isColdBootActive && (
        <AppNavBar
          title={
            activeTab === 'therapy'
              ? '智能膝关节康复理疗'
              : activeTab === 'incentive'
                ? '患者康复打卡与积分'
                : '物理设备与参数设定'
          }
          left={
            <button
              type="button"
              onClick={() => setMessageCenterOpen(true)}
              className="relative p-1.5 -ml-1 rounded-lg hover:bg-indigo-50 active:scale-95 transition"
              aria-label="消息中心"
            >
              <Bell size={18} className="text-indigo-600" strokeWidth={2.2} />
              {messageUnreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 bg-rose-500 text-white text-[8px] font-black rounded-full flex items-center justify-center leading-none">
                  {messageUnreadCount > 9 ? '9+' : messageUnreadCount}
                </span>
              )}
            </button>
          }
          right={<AppNavStatusBadge label="LIVE" />}
        />
      )}
      
      {/* ======================================================== */}
      {/* THREE ROLES INITIAL NEWCOMER COLD START GUIDANCE OVERLAY */}
      {/* ======================================================== */}
      {isColdBootActive && (
        <div
          className="fixed inset-0 z-[70] mx-auto flex max-w-[480px] flex-col bg-slate-950/98 p-6 text-white backdrop-blur-md animate-in fade-in duration-300 select-none"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {/* Logo Heading */}
          <div className="flex flex-col items-center text-center mt-4 shrink-0">
            <KneeJoyBrandIcon size="lg" className="mb-3 animate-bounce" />
            <h3 className="text-lg font-black font-display tracking-tight text-slate-100 leading-normal">
              欢迎使用「膝悦 (KneeJoy)」
            </h3>
            <p className="text-xs text-zinc-400 mt-1 uppercase font-bold">
              —— 您的专属居家膝关节理疗仪 ——
            </p>
          </div>

          <div className="flex-1 my-4 flex flex-col justify-center gap-4">
            {/* PATH SELECTION STEP */}
            {coldBootMethod === 'selection' && (
              <div className="flex flex-col gap-4 animate-in slide-in-from-bottom duration-300 text-left">
                <span className="text-xs font-bold text-zinc-400 tracking-wider">
                  请选择您的开始方式：
                </span>

                {/* Path A: Clinical Import */}
                <button
                  type="button"
                  onClick={() => setColdBootMethod('doctor')}
                  className="p-4 bg-gradient-to-br from-indigo-900 to-indigo-950/90 border border-indigo-500/40 rounded-2xl text-left hover:border-indigo-400 transition cursor-pointer flex flex-col gap-1.5"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-black text-indigo-300">方式一：医生方案 一键导入</span>
                    <span className="text-[10px] bg-indigo-500/50 text-indigo-200 px-1.5 py-0.5 rounded font-black">适合已有处方</span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed font-normal">
                    如果您手里有医生给的 6 位数字授权码（比如预设的 KOA602），输入后可以一键载入医生配好的牵引拉伸方案。
                  </p>
                </button>

                {/* Path B: Self Assessment Match */}
                <button
                  type="button"
                  onClick={() => setColdBootMethod('assessment')}
                  className="p-4 bg-gradient-to-br from-emerald-950 to-zinc-950 border border-emerald-500/40 rounded-2xl text-left hover:border-emerald-400 transition cursor-pointer flex flex-col gap-1.5"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-black text-emerald-300">方式二：智能助理 帮我推荐</span>
                    <span className="text-[10px] bg-emerald-500/50 text-emerald-200 px-1.5 py-0.5 rounded font-black">适合居家理疗</span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed font-normal">
                    如果您没有去过医院，只需简单填报您的年龄和膝盖状况，智能助理会自动推荐适合您的起步拉伸方案。
                  </p>
                </button>
              </div>
            )}

            {/* PATH A: DOCTOR PRESCRIBED ENTRY FORM */}
            {coldBootMethod === 'doctor' && (
              <form onSubmit={handleDoctorCodeSubmit} className="flex flex-col gap-4 bg-zinc-900 border border-zinc-805 p-5 rounded-3xl animate-in slide-in-from-right duration-200 animate-out shrink-0">
                <div className="flex items-center justify-between pb-1">
                  <span className="text-sm font-black text-indigo-300 font-display">请输入医生给您的 6 位验证码</span>
                  <button
                    type="button"
                    onClick={() => setColdBootMethod('selection')}
                    className="text-xs text-zinc-400 hover:text-white underline font-bold"
                  >
                    返回切换
                  </button>
                </div>

                <div className="flex flex-col gap-2 mt-1">
                  <label className="text-xs font-bold text-zinc-400 tracking-wide text-left">
                    请输入 6 位授权码
                  </label>
                  <input
                    type="text"
                    value={doctorCodeInput}
                    onChange={(e) => setDoctorCodeInput(e.target.value)}
                    placeholder="请输入授权码"
                    className="w-full text-center text-lg font-black text-white font-mono py-3 bg-black border border-zinc-750 rounded-xl uppercase tracking-widest focus:border-indigo-500 focus:outline-none"
                    maxLength={10}
                    required
                  />
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed text-left">
                  <Lightbulb size={11} strokeWidth={2.2} className="inline shrink-0" />
                  说明：输入并确认后，系统会自动为您载入主治专家李敬东主任为您配置的定制理疗处方。
                </p>

                <button
                  type="submit"
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition flex items-center justify-center gap-1.5"
                >
                  确认导入医生方案
                </button>
              </form>
            )}

            {/* PATH B: SELF ASSESSMENT MAPPING FORM */}
            {coldBootMethod === 'assessment' && (
              <form onSubmit={handleAssessmentSubmit} className="flex flex-col gap-3.5 bg-zinc-900 border border-zinc-800 p-5 rounded-3xl animate-in slide-in-from-left duration-200 text-xs text-left">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-black text-emerald-300 font-display">填报您目前的症状</span>
                  <button
                    type="button"
                    onClick={() => setColdBootMethod('selection')}
                    className="text-xs text-zinc-400 hover:text-white underline font-bold"
                  >
                    返回切换
                  </button>
                </div>

                {/* Age Input */}
                <div className="flex justify-between items-center bg-black/40 p-3 rounded-xl border border-zinc-800/40">
                  <span className="text-xs font-semibold text-zinc-300">您的年龄:</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={coldBootForm.age}
                      onChange={(e) => {
                        const v = e.target.value;
                        setColdBootForm({
                          ...coldBootForm,
                          age: v === '' ? '' : parseInt(v, 10) || '',
                        });
                      }}
                      placeholder="请输入"
                      min={1}
                      max={120}
                      className="w-16 bg-black text-center text-white border border-zinc-700 py-1.5 rounded-lg text-sm font-bold font-mono placeholder:text-zinc-600"
                    />
                    <span className="text-zinc-300 text-xs font-bold">岁</span>
                  </div>
                </div>

                {/* Cartilage Wear */}
                <div className="flex flex-col gap-1 bg-black/40 p-3 rounded-xl border border-zinc-800/40 text-left">
                  <span className="text-xs font-semibold text-zinc-300 mb-0.5">膝关节磨损感觉:</span>
                  <select
                    value={coldBootForm.cartilage_wear}
                    onChange={(e) => {
                      const v = e.target.value;
                      setColdBootForm({
                        ...coldBootForm,
                        cartilage_wear: v === '' ? '' : parseInt(v, 10),
                      });
                    }}
                    className="bg-black text-white border border-zinc-700 text-xs py-2 rounded-lg px-2 focus:outline-none w-full"
                  >
                    <option value="" disabled>请选择磨损程度</option>
                    <option value={1}>1级 (磨损较轻 · 偶尔有些酸痛)</option>
                    <option value={2}>2级 (软骨有磨损 · 上下楼觉得膝盖酸软)</option>
                    <option value={3}>3级 (轻中度磨损 · 弯曲或者走路常发胀)</option>
                    <option value={4}>4级 (磨损严重 · 只要踩地负重就痛得难受)</option>
                  </select>
                </div>

                {/* Joint Fluid */}
                <div className="flex flex-col gap-1 bg-black/40 p-3 rounded-xl border border-zinc-800/40 text-left">
                  <span className="text-xs font-semibold text-zinc-300 mb-0.5">髌骨积液肿胀度:</span>
                  <select
                    value={coldBootForm.joint_fluid}
                    onChange={(e) => {
                      const v = e.target.value;
                      setColdBootForm({
                        ...coldBootForm,
                        joint_fluid: v === '' ? '' : parseInt(v, 10),
                      });
                    }}
                    className="bg-black text-white border border-zinc-700 text-xs py-2 rounded-lg px-2 focus:outline-none w-full"
                  >
                    <option value="" disabled>请选择积液肿胀度</option>
                    <option value={1}>1级 (没有明显水肿发胀)</option>
                    <option value={2}>2级 (轻微水肿 · 触摸有软绵感觉)</option>
                    <option value={3}>3级 (中度积水 · 感觉膝盖被撑满发酸)</option>
                    <option value={4}>4级 (明显红肿 · 滑膜积液红肿刺痛)</option>
                  </select>
                </div>

                {/* Pain Score */}
                <div className="flex flex-col bg-black/40 p-3 rounded-xl border border-zinc-800/40 text-left">
                  <div className="flex justify-between items-center text-xs text-zinc-300 mb-1.5 font-sans">
                    <span className="font-semibold">您主观疼得厉害吗？</span>
                    <span className="text-emerald-400 font-black font-mono text-sm">
                      {coldBootForm.pain_score === '' ? '—' : coldBootForm.pain_score} 分
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1} max={10}
                    value={coldBootForm.pain_score === '' ? 5 : coldBootForm.pain_score}
                    onChange={(e) =>
                      setColdBootForm({ ...coldBootForm, pain_score: parseInt(e.target.value, 10) })
                    }
                    className="w-full h-1.5 cursor-pointer accent-emerald-500 rounded-lg bg-zinc-700"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500 font-bold mt-1">
                    <span>不大痛 (1分)</span>
                    <span>正疼得厉害 (10分)</span>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full mt-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition"
                >
                  确认推荐并一键获取方案
                </button>
              </form>
            )}
          </div>

          <div className="text-[10px] text-zinc-500 text-center leading-normal mb-2 shrink-0">
            医疗声明：膝悦理疗方案由三甲物理医疗康复中心提供科学依据支持。
          </div>
        </div>
      )}

      {/* Scrollable content — bottom padding leaves room for fixed tab bar */}
      {!isColdBootActive && !isConnecting && (
      <div
        className="flex-1 overflow-y-auto overscroll-y-contain px-4 pt-3 flex flex-col gap-4"
        style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
      >

        {/* 1. FAMILY NUDGE TOAST BANNER */}
        {familyNudgeReceived !== null && (
          <div className="mb-1 bg-pink-50 border border-pink-100 rounded-2xl px-3 py-2.5 shadow-md text-slate-800 relative z-40">
            <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-pink-500 rounded-l-2xl" />
            <button
              type="button"
              onClick={onClearNudge}
              className="absolute top-2 right-2 text-pink-400 hover:text-pink-600 font-bold text-xs leading-none z-10"
              aria-label="关闭提醒"
            >
              ✕
            </button>
            <div className="flex flex-col items-center justify-center text-center px-6 py-1 gap-1.5 min-h-[52px]">
              <span className="text-[11px] font-semibold text-pink-700 flex items-center justify-center gap-1.5 leading-snug">
                <Heart size={13} className="fill-pink-500 text-pink-500 shrink-0" />
                家属发送了康复关怀提醒
              </span>
              {familyNudgeReceived.trim().length > 0 && (
                <p className="text-[10px] text-slate-600 font-medium leading-relaxed max-w-full break-words">
                  {familyNudgeReceived}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  onClearNudge();
                  setActiveTab('therapy');
                }}
                className="mt-0.5 px-3 py-1 bg-pink-500 text-white rounded-lg text-[9.5px] font-bold shadow-sm shadow-pink-500/20 active:scale-95 transition cursor-pointer"
              >
                立刻理疗
              </button>
            </div>
          </div>
        )}

        {patientProfile.binding_doctor_id && patientProfile.binding_doctor_name && (
          <div className="mb-1 bg-emerald-50 border border-emerald-100 rounded-2xl p-3 shadow-sm flex flex-col gap-1">
            <span className="text-[11px] font-bold text-emerald-800">
              医嘱绿色通道 · 您的主治医生【{patientProfile.binding_doctor_name}】
            </span>
            <p className="text-[10px] text-emerald-700 leading-relaxed">
              {patientProfile.current_prescription
                ? '已为您更新今日治疗处方，可在控制面板一键应用。'
                : '已成功建立医患绑定，可接收远程处方与随访提醒。'}
            </p>
            {patientProfile.current_prescription && (
              <button
                type="button"
                disabled={isApplyingPrescription}
                onClick={handleApplyDoctorPrescription}
                className="self-end cursor-pointer rounded-lg bg-emerald-600 px-2.5 py-1 text-[9px] font-bold text-white transition hover:bg-emerald-700 active:scale-95 disabled:opacity-60"
              >
                {isApplyingPrescription ? '正在应用…' : '一键应用医嘱方案'}
              </button>
            )}
          </div>
        )}

        {/* 3. TAB PANEL WINDOWS */}
        <div className="flex-1 flex flex-col gap-4">
        {/* ===================================== */}
        {/* TAB 1: SMART REHAB THERAPY CONTROL PANEL */}
        {/* ===================================== */}
        {activeTab === 'therapy' && (
          <div className="flex-1 flex flex-col gap-4">
            
            {/* 1.0 BLUETOOTH DEVICE CONNECTION STATUS WIDGET — 仅在控制面板/离线首页展示 */}
            {!isClinicalAssessmentFlow && (
            <div className="bg-white rounded-3xl p-4.5 shadow-md shadow-slate-100/60 flex flex-col gap-2.5 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-left">
                  <div
                    className={`p-2.5 rounded-2xl flex items-center justify-center transition ${
                      isHardwareLinked
                        ? 'bg-indigo-100 text-indigo-700'
                        : isConnecting
                          ? 'bg-indigo-50 text-indigo-500'
                          : 'bg-amber-100 text-amber-600'
                    }`}
                  >
                    <Radio
                      size={20}
                      className={isHardwareLinked || isConnecting ? 'animate-pulse' : ''}
                    />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800 flex items-center gap-2 leading-tight">
                      理疗仪连接状态：
                      {isConnecting ? (
                        <span className="text-indigo-600 bg-indigo-50 border border-indigo-150 px-2 py-0.5 rounded text-[11px] font-black animate-pulse whitespace-nowrap">
                          连接中…
                        </span>
                      ) : isHardwareLinked ? (
                        <span className="text-indigo-600 bg-indigo-50 border border-indigo-150 px-2 py-0.5 rounded text-[11px] font-black animate-pulse whitespace-nowrap">
                          已配对
                        </span>
                      ) : connectionPhase === 'failed' ? (
                        <span className="text-rose-700 bg-rose-50 border border-rose-150 px-2 py-0.5 rounded text-[11px] font-black whitespace-nowrap">
                          连接失败
                        </span>
                      ) : (
                        <span className="text-amber-700 bg-amber-50 border border-amber-150 px-2 py-0.5 rounded text-[11px] font-black whitespace-nowrap">
                          离线模式
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 leading-normal">
                      {isConnecting
                        ? mqttMode
                          ? '正在连接 EMQX 云端并等待设备上报状态，请确认设备已联网。'
                          : '正在搜索并配对您的膝悦理疗仪，请保持设备开机并靠近手机。'
                        : isHardwareLinked
                          ? hardwareState.connection === 'wifi'
                            ? mqttMode
                              ? '设备已通过 MQTT 云端连接，随时可以远程控制。'
                              : '您的膝关节理疗仪已通过家庭 Wi-Fi 连接，随时可以开启理疗。'
                            : '您的膝关节理疗仪已通过蓝牙连接，随时可以开启理疗。'
                          : connectionError
                            ? connectionError
                            : mqttMode
                              ? '点击右侧开关连接云端设备（MQTT），或先在「硬件联调」确认设备 ID。'
                              : '现在还没连接物理设备，您可以点击右侧滑钮开启蓝牙，或者点击下方徒手练习。'}
                    </p>
                  </div>
                </div>

                {/* Slider Toggle Switch for Bluetooth */}
                <button
                  type="button"
                  onClick={handleConnectionToggle}
                  disabled={isConnecting}
                  className={`w-11 h-6 rounded-full p-1 transition-colors duration-200 shrink-0 ${
                    isConnecting
                      ? 'bg-indigo-300 cursor-wait'
                      : isHardwareLinked
                        ? 'bg-indigo-600 cursor-pointer'
                        : 'bg-slate-205 cursor-pointer'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
                      isHardwareLinked ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* High-Fidelity geriatric anti-misclick health alert */}
              {errConnectionLockMessage && (
                <div className="bg-rose-55 border border-rose-200 rounded-2xl p-3.5 flex gap-2.5 text-rose-800 text-xs leading-relaxed font-bold animate-in slide-in-from-top-1 duration-250 text-left mt-1.5">
                  <div className="text-rose-500 pt-0.5 shrink-0">
                    <AlertTriangle size={15} fill="currentColor" className="text-white" />
                  </div>
                  <div>
                    <span className="text-rose-950 font-extrabold flex items-center gap-0.5 mb-0.5">
                      <AlertTriangle size={12} strokeWidth={2.2} />
                      安全提醒：
                    </span>
                    {errConnectionLockMessage}
                  </div>
                </div>
              )}

              {isHardwareLinked && (
                <EstopControl
                  variant="alert"
                  hardwareState={hardwareState}
                  onUpdateHardware={onUpdateHardware}
                  onLog={onSendHardwareAction}
                />
              )}
            </div>
            )}

            {/* 1.0b / 1.1 离线徒手康复 — 仅在控制面板且未连接设备时展示，不与自评/匹配/聊天混排 */}
            {showOfflineRehabDashboard && (
              <>
            {/* 1.0b DUAL-MODE DISCONNECTED AIR TRACTION REHAB CARD */}
            <div className="bg-gradient-to-r from-amber-550/10 to-amber-50 rounded-3xl p-4.5 border border-amber-200 shadow-sm shrink-0 text-slate-800 flex flex-col gap-3 animate-in slide-in-from-top duration-300">
                <span className="inline-flex max-w-fit items-center gap-1.5 text-xs font-black text-amber-800 uppercase bg-amber-100 px-2.5 py-1 rounded-lg">
                  <Lightbulb size={13} strokeWidth={2.2} />
                  居家自练保健指南
                </span>
                <p className="text-xs text-amber-900 leading-relaxed font-medium text-left">
                  目前连接不到您的理疗仪，已经自动为您开启<strong>【居家徒手康复课程】</strong>。您可以在床上或沙发上跟着下面的视频练习膝盖理疗操，完成后点击打卡，成果也会同步至家属端。
                </p>

                {/* Simulated Air video with breathing loop indicator */}
                <div className="bg-slate-900/90 text-white rounded-2xl p-3 flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center animate-bounce shrink-0">
                      <PersonStanding size={22} strokeWidth={2.2} className="text-white" />
                    </span>
                    <div className="text-left">
                      <h5 className="text-xs font-bold text-slate-100">第1套：居家股四头肌徒手牵引操</h5>
                      <p className="text-[10px] text-slate-400">顺畅呼吸，跟随视频动作做拉伸 · 正在播放</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-[10px] text-emerald-400 font-bold bg-white/10 px-2 py-0.5 rounded-lg shrink-0">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                    <span>进行中</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const todayStr = '2026-05-31';
                    if (!checkInDates.includes(todayStr)) {
                      onAddCheckIn(todayStr);
                      onSendHardwareAction(`[空气牵引操完成] 用户免设备进行【吸气舒展等长牵引跟练】并完成5月31日打卡！已极速上传家属端`);
                    }
                  }}
                  className="py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-bold rounded-2xl shadow-md align-middle cursor-pointer active:scale-97 transition text-center flex items-center justify-center gap-1.5 font-sans"
                >
                  <Trophy size={14} strokeWidth={2.2} />
                  跟着做完了（点这里一键打卡）
                </button>
              </div>

            {/* 1.1 ADDED OFFLINE REHAB CONTENT & HEALTH普及 SECTIONS FOR GERIATRICS */}
            <div className="flex flex-col gap-4 animate-in slide-in-from-bottom duration-350">
                {/* 1.1a Other Exercises section */}
                <div className="bg-white rounded-3xl p-4.5 shadow-md shadow-slate-100/40 flex flex-col gap-3 text-left">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-slate-800 flex items-center gap-1.5 leading-none">
                      <Mountain size={16} strokeWidth={2.2} className="text-amber-550" />
                      适老居家健康理疗操推荐
                    </h4>
                    <span className="text-[10px] text-slate-400 font-bold">全年龄段免费安全</span>
                  </div>
                  
                  <div className="flex flex-col gap-2.5">
                    {/* Ex 1 */}
                    <div className="p-3 bg-slate-50/70 hover:bg-slate-100 border border-slate-100 rounded-2xl flex items-center justify-between gap-2.5 transition">
                      <div className="flex items-center gap-2.5 text-left">
                        <span className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                          <Mountain size={18} strokeWidth={2.2} className="text-amber-600" />
                        </span>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-800 leading-tight">第2套：靠墙静蹲稳固髌骨法</span>
                          <span className="text-[10px] text-slate-400 mt-1">适合感觉膝盖发软、走路没劲的康复人群</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => onSendHardwareAction(`[课程切换] 用户切换跟练课程为：第2套「靠墙静蹲稳固髌骨法」`)}
                        className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-black cursor-pointer shadow-sm transition"
                      >
                        去自练
                      </button>
                    </div>

                    {/* Ex 2 */}
                    <div className="p-3 bg-slate-50/70 hover:bg-slate-100 border border-slate-100 rounded-2xl flex items-center justify-between gap-2.5 transition">
                      <div className="flex items-center gap-2.5 text-left">
                        <span className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                          <Footprints size={18} strokeWidth={2.2} className="text-amber-600" />
                        </span>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-800 leading-tight">第3套：卧姿踝泵膝部消肿操</span>
                          <span className="text-[10px] text-slate-400 mt-1">专门针对晨起膝盖僵硬发胀、下不来床</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => onSendHardwareAction(`[课程切换] 用户切换跟练课程为：第3套「卧姿踝泵膝部消肿操」`)}
                        className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-black cursor-pointer shadow-sm transition"
                      >
                        去自练
                      </button>
                    </div>
                  </div>
                </div>

                {/* 1.1b Popular Health Science column */}
                <div className="bg-white rounded-3xl p-4.5 shadow-md shadow-slate-100/40 flex flex-col gap-3 text-left">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-slate-800 flex items-center gap-1.5 leading-none">
                      <BookOpen size={16} strokeWidth={2.2} className="text-rose-500" />
                      居家骨关节健康科普
                    </h4>
                    <span className="text-[10px] text-indigo-600 font-bold">李敬东主任专业审核</span>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {/* Article 1 */}
                    <div className="p-3 bg-slate-50/50 hover:bg-slate-100 border border-slate-100/80 rounded-2xl flex flex-col gap-1 transition">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-black">科学热敷</span>
                        <span className="text-[9px] text-slate-400">阅读：1.2万同类病友</span>
                      </div>
                      <h5 className="text-xs font-black text-slate-800 mt-1 leading-normal">
                        为什么红外热敷能缓解寒凉引起的膝盖发胀？
                      </h5>
                      <p className="text-[10px] text-slate-450 leading-relaxed font-medium">
                        李主任：红外热敷能直观促进滑液腔血液循环。当腔内循环通畅，多余的关节水肿积液自然更易被人体自身吸收。
                      </p>
                    </div>

                    {/* Article 2 */}
                    <div className="p-3 bg-slate-50/50 hover:bg-slate-100 border border-slate-100/80 rounded-2xl flex flex-col gap-1 transition">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] bg-emerald-50 text-emerald-750 px-1.5 py-0.5 rounded font-black">避免误区</span>
                        <span className="text-[9px] text-slate-400">阅读：9500位家属</span>
                      </div>
                      <h5 className="text-xs font-black text-slate-800 mt-1 leading-normal">
                        关节处骨质增生，为什么不能使劲按揉揉捏？
                      </h5>
                      <p className="text-[10px] text-slate-450 leading-relaxed font-medium">
                        切忌盲目相信重度推拿。关节软骨稀薄，用力过猛会导致半月板受损甚至二次挫伤，居家最安全的应当是适度自拉伸康复。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              </>
            )}

            {/* 1.2 THREE-STAGE HIGH-FIDELITY MEDICAL CLINIC FLOW SEQUENCER */}
            {therapyStep === 'symptom' && (
              <div className="bg-white rounded-3xl p-5 shadow-md shadow-slate-100/60 flex flex-col gap-4 shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-4 bg-indigo-500 rounded-full"></div>
                    <h3 className="text-sm font-black text-slate-900 font-display">自评：当前膝盖感受</h3>
                  </div>
                  <span className="text-xs text-slate-400 font-bold">1 / 2 步</span>
                </div>
                
                <div className="flex flex-col gap-3 text-left">
                  {/* Age Row */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100">
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-bold text-slate-700">您今年多大年龄了？</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">我们会以此核对您的关节情况</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        value={symptomForm.age}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSymptomForm({
                            ...symptomForm,
                            age: v === '' ? '' : parseInt(v, 10) || '',
                          });
                        }}
                        placeholder="请输入"
                        min={1}
                        max={120}
                        className="w-16 text-center py-2 rounded-xl text-sm font-black bg-white ring-1 ring-slate-200 text-slate-800 focus:outline-none focus:ring-indigo-500 placeholder:text-slate-400"
                      />
                      <span className="text-xs font-bold text-slate-500">岁</span>
                    </div>
                  </div>

                  {/* Cartilage Wear level Row */}
                  <div className="flex flex-col gap-1.5 p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        您平常膝盖骨磨损情况：
                        <HelpCircle size={12} className="text-slate-400" />
                      </span>
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50/85 px-2 py-0.5 rounded-lg">
                        {symptomForm.cartilage_wear === '' ? '—' : symptomForm.cartilage_wear} 级
                      </span>
                    </div>
                    <select
                      value={symptomForm.cartilage_wear}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSymptomForm({
                          ...symptomForm,
                          cartilage_wear: v === '' ? '' : parseInt(v, 10),
                        });
                      }}
                      className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-white text-slate-700 ring-1 ring-slate-150 cursor-pointer focus:outline-none mt-1"
                    >
                      <option value="" disabled>请选择磨损程度</option>
                      <option value={1}>1级 (磨损较轻 · 偶尔有些酸痛)</option>
                      <option value={2}>2级 (软骨有磨损 · 上下楼觉得膝盖酸软)</option>
                      <option value={3}>3级 (轻中度磨损 · 弯曲或者走路常发胀)</option>
                      <option value={4}>4级 (磨损严重 · 只要踩地负重就痛得难受)</option>
                    </select>
                  </div>

                  {/* Joint Fluid level Row */}
                  <div className="flex flex-col gap-1.5 p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        您髌骨滑液积水和水肿度：
                        <HelpCircle size={12} className="text-slate-400" />
                      </span>
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50/85 px-2 py-0.5 rounded-lg">
                        {symptomForm.joint_fluid === '' ? '—' : symptomForm.joint_fluid} 级
                      </span>
                    </div>
                    <select
                      value={symptomForm.joint_fluid}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSymptomForm({
                          ...symptomForm,
                          joint_fluid: v === '' ? '' : parseInt(v, 10),
                        });
                      }}
                      className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-white text-slate-700 ring-1 ring-slate-150 cursor-pointer focus:outline-none mt-1"
                    >
                      <option value="" disabled>请选择积液肿胀度</option>
                      <option value={1}>1级 (没有明显水肿发胀)</option>
                      <option value={2}>2级 (轻微水肿 · 触摸有软绵感觉)</option>
                      <option value={3}>3级 (中度积水 · 感觉膝盖被撑满发酸)</option>
                      <option value={4}>4级 (明显红肿 · 滑膜积液红肿刺痛)</option>
                    </select>
                  </div>

                  {/* Pain score slider display Row */}
                  <div className="flex flex-col gap-2 p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                      <span>您现在主观痛不疼？</span>
                      <span className="text-xs font-bold text-indigo-650 bg-indigo-50 px-2 py-0.5 rounded-lg">
                        {symptomForm.pain_score === '' ? '—' : symptomForm.pain_score} 分
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={symptomForm.pain_score === '' ? 5 : symptomForm.pain_score}
                      onChange={(e) =>
                        setSymptomForm({ ...symptomForm, pain_score: parseInt(e.target.value, 10) })
                      }
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-650 mt-1"
                    />
                    <div className="flex justify-between text-[10px] text-slate-405 font-bold mt-1">
                      <span>不大疼 (1分)</span>
                      <span>痛得特别厉害 (10分)</span>
                    </div>
                  </div>
                </div>

                {/* Primary matching execution action */}
                <button
                  onClick={handleAIRecommendation}
                  className="w-full py-3.5 border border-transparent rounded-2xl text-xs font-bold text-white shadow-md bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 active:scale-97 cursor-pointer flex items-center justify-center gap-2 transition"
                >
                  <Sparkles size={16} className="animate-spin-slow" />
                  <span>生成智能评估匹配方案</span>
                </button>

                {/* Patient Shortcut: "我已有治疗方案" Bottom Link */}
                <div className="flex flex-col items-center mt-3 pt-3 border-t border-slate-100/80">
                  <span className="text-[10px] text-slate-400">如果您已经懂了怎么物理拉伸：</span>
                  <button
                    type="button"
                    onClick={() => {
                      setTherapyStep('control');
                      onSendHardwareAction(`[通道重开] 患者跳过症状医学测算诊断，一键前往中枢面板，启用自定义手动调节模式。`);
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-750 font-black underline cursor-pointer mt-1 transition flex items-center justify-center gap-1"
                  >
                    我有预设治疗方案，直接跳到控制面板 <ChevronRight size={14} className="inline ml-0.5" />
                  </button>
                </div>
              </div>
            )}
            {/* STEP B: OPTIMIZED TREATMENT PLAN MATCHING REVIEW */}
            {therapyStep === 'matching' && lastMatchResult && (
              <div className="bg-white rounded-3xl p-4 shadow-md shadow-slate-150/60 flex flex-col gap-3 shrink-0 animate-in zoom-in-95 duration-200 text-slate-800">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <button 
                    onClick={() => setTherapyStep('symptom')}
                    className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                  >
                    <ArrowLeft size={12} />
                    <span>返回重改症状</span>
                  </button>
                  <span className="text-[9px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full font-bold">自评方案匹配成功</span>
                </div>

                {/* Recommendation details card details card */}
                <div className="bg-gradient-to-b from-indigo-50/50 to-indigo-50/10 rounded-2xl p-3 border border-indigo-100/70">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] text-indigo-700 font-extrabold flex items-center gap-1">
                      <Award size={12} strokeWidth={2.2} />
                      完美匹配三甲临床专家相似案列
                    </span>
                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-850 rounded text-[9.5px] font-bold font-mono">
                      相似度 {lastMatchResult.similarity}%
                    </span>
                  </div>
                  
                  <h4 className="text-xs font-black text-slate-900 leading-normal">{lastMatchResult.case_name}</h4>
                  <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                    根据欧氏距离聚类诊断，该方案由博爱医院膝病研委会审定，专职减轻滑液腔积液胀痛，提供阶梯式物理牵引拉力支持。
                  </p>
                </div>

                {/* Parameters Breakdown Grid breakdown bento */}
                <div className="grid grid-cols-2 gap-2.5 my-1.5">
                  <div className="bg-slate-50/90 rounded-xl p-3 border border-slate-100 flex flex-col">
                    <span className="text-xs font-black text-slate-500">左侧推荐拉力</span>
                    <span className="text-sm font-black font-mono text-indigo-600 mt-1">{lastMatchResult.details.treatment.left_force} N <span className="text-[10px] text-slate-400 font-sans font-medium">(中等偏高)</span></span>
                  </div>
                  <div className="bg-slate-50/90 rounded-xl p-3 border border-slate-100 flex flex-col">
                    <span className="text-xs font-black text-slate-500">右侧推荐拉力</span>
                    <span className="text-sm font-black font-mono text-indigo-600 mt-1">{lastMatchResult.details.treatment.right_force} N <span className="text-[10px] text-slate-400 font-sans font-medium">(轻度防护)</span></span>
                  </div>
                  <div className="bg-slate-50/90 rounded-xl p-3 border border-slate-100 flex flex-col">
                    <span className="text-xs font-black text-slate-500">红外热敷温度</span>
                    <span className="text-sm font-black font-mono text-rose-600 mt-1">{lastMatchResult.details.treatment.temp} ℃ <span className="text-[10px] text-slate-400 font-sans font-medium">(恒温舒缓)</span></span>
                  </div>
                  <div className="bg-slate-50/90 rounded-xl p-3 border border-slate-100 flex flex-col">
                    <span className="text-xs font-black text-slate-500">推荐理疗时间</span>
                    <span className="text-sm font-black font-mono text-slate-800 mt-1">{lastMatchResult.details.treatment.duration} 分钟</span>
                  </div>
                </div>

                {/* User Options Section: Accept or Refuse options */}
                <div className="flex flex-col gap-2 mt-2 pt-2.5 border-t border-slate-105/60">
                  {/* Route 1: ACCEPT CANONICAL SCHEMA FORMULA */}
                  <button
                    onClick={handleAcceptAIRecommendation}
                    className="w-full h-11 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-2xl text-sm font-black shadow-md shadow-indigo-600/10 active:scale-98 transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Check size={16} className="stroke-[3]" />
                    <span>接受并载入此项AI推荐方案</span>
                  </button>

                  {/* Route 2: REFUSE SCHEMA OPTIONS */}
                  <div className="grid grid-cols-2 gap-2 mt-0.5">
                    <button
                      onClick={() => setTherapyStep('symptom')}
                      className="py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-black rounded-xl active:scale-97 cursor-pointer transition text-center"
                    >
                      修改我的膝盖症状
                    </button>
                    <button
                      onClick={() => {
                        setTherapyStep('chat_support');
                        onSendHardwareAction(`[挂号专家] 匹配后用户有疑问决定寻求人工审验，直连博爱李主任在线学术客服中心。`);
                      }}
                      className="py-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-black rounded-xl active:scale-97 cursor-pointer transition text-center flex items-center justify-center gap-1"
                    >
                      <MessageSquare size={12} className="stroke-[2.5]" />
                      <span>咨询在线医生</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP C: CLINICAL CO-STUDY ONLINE DOCTOR CHAT SERVICE */}
            {therapyStep === 'chat_support' && (
              <div className="bg-white rounded-3xl p-4 shadow-md shadow-slate-250/30 flex flex-col min-h-[480px] shrink-0 animate-in slide-in-from-right duration-350 text-slate-800">
                
                {/* Chat header area with doctor avatar */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 shrink-0">
                  <button 
                    onClick={() => setTherapyStep('matching')}
                    className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                  >
                    <ArrowLeft size={12} />
                    <span>返回上步推荐</span>
                  </button>
                  
                  <div className="flex items-center gap-1.5">
                    <div className="relative">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center border border-indigo-200 text-xs font-bold text-indigo-700">李</div>
                      <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 rounded-full border-2 border-white animate-pulse"></span>
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-[10px] font-black leading-tight">李敬东 主任医师</span>
                      <span className="text-[8px] text-slate-400 font-bold">三甲博爱关节医学在线支持</span>
                    </div>
                  </div>

                  <span className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full font-bold">临床会诊中</span>
                </div>

                {/* Chat message timeline section wrapper */}
                <div className="flex-1 overflow-y-auto py-3 px-1.5 flex flex-col gap-3 min-h-0">
                  {chatMessages.map((msg, idx) => (
                    <div 
                      key={idx} 
                      className={`flex flex-col gap-1 max-w-[85%] ${
                        msg.sender === 'user' ? 'self-end items-end' : 'self-start items-start'
                      }`}
                    >
                      {/* Speaker Badge */}
                      <span className="text-[8px] font-bold text-slate-400 font-mono pl-1">
                        {msg.sender === 'user' ? '我' : '李敬东 主任'} · {msg.time}
                      </span>

                      {/* Msg text bubble bubble */}
                      <div className={`p-2.5 rounded-2xl shadow-sm text-[11px] leading-relaxed font-medium ${
                        msg.sender === 'user'
                          ? 'bg-indigo-600 text-white rounded-tr-none'
                          : 'bg-slate-50 text-slate-800 border border-slate-100 rounded-tl-none'
                      }`}>
                        {msg.text}
                      </div>

                      {/* Doctor Action Injection prescription attachment */}
                      {msg.isAction && msg.actionParams && (
                        <div className="mt-1 bg-gradient-to-r from-emerald-50 to-indigo-50 border border-emerald-200 rounded-2xl p-3 flex flex-col gap-2 shadow-sm shadow-indigo-100/50 text-left w-[240px]">
                          <div className="flex items-center gap-1 font-black text-emerald-800 text-[10px]">
                            <ShieldCheck size={13} className="text-emerald-600" />
                            <span>李主任下发特配精调参数：</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-1.5 bg-white/60 p-2 rounded-xl border border-emerald-100 font-mono text-[10px] font-bold text-slate-700">
                            <div>左缸推力: {msg.actionParams.left_force}N</div>
                            <div>右缸推力: {msg.actionParams.right_force}N</div>
                            <div>红外温度: {msg.actionParams.temp}℃</div>
                            <div>时钟定时: {msg.actionParams.duration}分钟</div>
                          </div>

                          <button
                            onClick={() => handleAcceptDoctorParams(msg.actionParams!)}
                            className="py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black rounded-lg transition active:scale-97 cursor-pointer text-center flex items-center justify-center gap-1"
                          >
                            <Check size={11} className="stroke-[3]" />
                            <span>采纳特配并同步至我的理疗中枢</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Typing simulated element */}
                  {isDoctorTyping && (
                    <div className="self-start flex flex-col gap-1 items-start max-w-[80%]">
                      <span className="text-[8px] font-bold text-slate-400">李主任正在输入...</span>
                      <div className="p-2 bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-none flex items-center gap-1.5 text-[10px] text-slate-500 font-medium">
                        <span className="flex gap-0.5 items-center">
                          <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce"></span>
                          <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce delay-150"></span>
                          <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce delay-300"></span>
                        </span>
                        <span>正在详细诊查，评估定制气动过气阀比对配比...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Predefined patient quick choice selections scrollbar */}
                <div className="border-t border-slate-100 pt-2 shrink-0 flex flex-col gap-1.5">
                  <span className="text-[9px] text-slate-400 font-extrabold text-left flex items-center gap-1">
                    <Lightbulb size={11} strokeWidth={2.2} className="shrink-0" />
                    针对自检结果（VAS 疼痛评分 {symptomForm.pain_score}），您可以直接追问：
                  </span>
                  
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      disabled={isDoctorTyping}
                      onClick={() => handleSendChatOption(`我当前的自测疼痛值比较高（${symptomForm.pain_score}分），这个推荐拉伸拉力会不会拉力过载？`, 1)}
                      className="py-1.5 px-2.5 bg-indigo-50/55 hover:bg-indigo-55/75 border border-indigo-100/40 text-[10px] font-bold text-indigo-800 rounded-xl transition text-left cursor-pointer truncate disabled:opacity-50"
                    >
                      ❓ 疼痛感达到{symptomForm.pain_score}分，拉力会拉伤韧带吗？我怕疼。
                    </button>
                    <button
                      type="button"
                      disabled={isDoctorTyping}
                      onClick={() => handleSendChatOption(`我目前膝周依然酸胀、发红，热敷温度设在 ${lastMatchResult?.details?.treatment?.temp || 42}℃ 是否可以消胀？`, 2)}
                      className="py-1.5 px-2.5 bg-indigo-50/55 hover:bg-indigo-55/75 border border-indigo-100/40 text-[10px] font-bold text-indigo-800 rounded-xl transition text-left cursor-pointer truncate disabled:opacity-50"
                    >
                      ❓ 积液处于{symptomForm.joint_fluid}阶酸胀明显的发炎期，如何安全热敷？
                    </button>
                    <button
                      type="button"
                      disabled={isDoctorTyping}
                      onClick={() => handleSendChatOption(`我的关节软骨属于陈旧性慢磨损，希望能有高适应度、极其柔和的减阻慢拉理疗方案。`, 3)}
                      className="py-1.5 px-2.5 bg-indigo-50/55 hover:bg-indigo-55/75 border border-indigo-100/40 text-[10px] font-bold text-indigo-800 rounded-xl transition text-left cursor-pointer truncate disabled:opacity-50"
                    >
                      ❓ 慢磨损退行性病理，可以采用全方位的弱压抗拉低震防护吗？
                    </button>
                  </div>

                  {/* Direct text input for free-form doctor Q&A */}
                  <div className="border-t border-slate-100 pt-2 shrink-0 flex flex-col gap-1.5">
                    <span className="text-[9px] text-slate-400 font-bold text-left">
                      或直接输入您的问题，李主任在线回复：
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={chatDraft}
                        onChange={(e) => setChatDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSendChatMessage(chatDraft);
                          }
                        }}
                        placeholder="例如：我膝盖弯曲时有咔咔声，还能拉伸吗？"
                        disabled={isDoctorTyping}
                        className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-medium text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none disabled:opacity-50"
                      />
                      <button
                        type="button"
                        disabled={!chatDraft.trim() || isDoctorTyping}
                        onClick={() => handleSendChatMessage(chatDraft)}
                        className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="发送消息"
                      >
                        <Send size={16} strokeWidth={2.2} />
                      </button>
                    </div>
                  </div>

                  {/* Return quick buttons */}
                  <div className="flex justify-center mt-2 border-t border-slate-50 pt-1">
                    <button
                      onClick={() => setTherapyStep('symptom')}
                      className="text-xs text-slate-500 hover:text-indigo-650 font-black flex items-center gap-1 cursor-pointer py-1"
                    >
                      ⬅ 重新进行症状自评
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP D: THE CENTRAL THERAPEUTIC HARDWARE CONTROL PANEL Dashboard */}
            {showControlPanel && (
              <div className="bg-white rounded-3xl p-5 shadow-md shadow-slate-100/60 flex flex-col gap-4 animate-in fade-in duration-200">
                {!isHardwareLinked && !isConnecting && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] font-bold text-amber-900 leading-relaxed">
                    {mqttMode
                      ? '设备未连接云端：请先在上方打开连接开关，或到「设置 → MQTT 云端连接」。连接成功后即可在本页开始治疗。'
                      : '设备未连接：请先在上方打开连接开关后再开始治疗。'}
                  </div>
                )}
                <div className="flex justify-between items-center mb-1">
                  <div className="flex flex-col text-left">
                    <button
                      type="button"
                      onClick={() => setTherapyStep('symptom')}
                      className="text-xs font-black text-indigo-600 hover:text-indigo-750 flex items-center gap-1 cursor-pointer mb-1.5"
                    >
                      <ArrowLeft size={12} />
                      <span>返回重新自评诊断</span>
                    </button>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-4 bg-indigo-500 rounded-full"></div>
                      <h3 className="text-sm font-black text-slate-900 font-display">理疗控制面板</h3>
                    </div>
                  </div>
                  
                  {/* Manual control toggle switch */}
                  <div className="flex items-center gap-2 select-none">
                    <span className="text-xs text-slate-650 font-black">解锁微调</span>
                    <button
                      onClick={() => {
                        if (!hardwareState.is_running) {
                          setIsManualMode(!isManualMode);
                          onSendHardwareAction(`[模式变更] 患者${!isManualMode ? '开启了拉力与温度手动微调' : '退出了自定义模式，恢复AI推荐设计'}`);
                        }
                      }}
                      disabled={hardwareState.is_running}
                      className={`w-10 h-5.5 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                        isManualMode ? 'bg-indigo-600' : 'bg-slate-200'
                      } ${hardwareState.is_running ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      <div className={`w-4.5 h-4.5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
                        isManualMode ? 'translate-x-4.5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>

                {/* Status display: Countdowns / active indicators */}
                {hardwareState.is_running ? (
                  <div className="bg-indigo-950 text-white rounded-2xl p-4 flex flex-col items-center gap-2.5 border border-indigo-500/20 shadow-md">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-xs text-emerald-400 font-bold animate-pulse">
                      <Radio size={12} /> 理疗仪运行中 (ACTIVE)
                    </span>
                    
                    {/* Digital countdown stopwatch */}
                    <div className="flex items-baseline gap-1 text-slate-200 my-1">
                      <span className="text-3xl font-mono font-bold text-white tracking-widest">
                        {Math.floor(hardwareState.time_left_seconds / 60).toString().padStart(2, '0')}
                      </span>
                      <span className="text-sm font-black text-zinc-400 mr-2">分</span>
                      <span className="text-3xl font-mono font-bold text-white tracking-widest">
                        {(hardwareState.time_left_seconds % 60).toString().padStart(2, '0')}
                      </span>
                      <span className="text-sm font-black text-zinc-400">秒</span>
                    </div>

                    {/* Indicators panel */}
                    <div className="grid grid-cols-4 gap-2 w-full mt-1 bg-white/5 p-3 rounded-xl border border-white/5">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-zinc-400 font-bold mb-0.5">左侧拉力</span>
                        <span className="text-sm font-black font-mono text-indigo-300">{hardwareState.left_force}N</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-zinc-400 font-bold mb-0.5">右侧拉力</span>
                        <span className="text-sm font-black font-mono text-indigo-300">{hardwareState.right_force}N</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-zinc-400 font-bold mb-0.5">红外热敷</span>
                        <span className="text-sm font-black font-mono text-red-300">{hardwareState.temp}℃</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-zinc-400 font-bold mb-0.5">温和按摩</span>
                        <span className="text-sm font-black font-mono text-cyan-300">{hardwareState.vibration === 0 ? '关' : hardwareState.vibration === 1 ? '低频' : '高频'}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-2.5 px-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center gap-2 text-slate-500 font-bold text-xs">
                    <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
                    <span>理疗仪已就绪，请启动康复理疗</span>
                  </div>
                )}

                {/* Slider adjustment bars (active only when unlocked/not running) */}
                <div className={`p-4.5 bg-slate-50/80 rounded-2xl flex flex-col gap-4.5 font-bold border border-slate-100/50 ${
                  (!isManualMode || hardwareState.is_running) ? 'opacity-55 cursor-not-allowed pointer-events-none' : ''
                }`}>
                  {/* 1. Left Force Slider */}
                  <div className="flex flex-col gap-1.5 animate-none">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-800">
                      <span className="text-slate-800 font-black text-sm">左侧牵引拉力</span>
                      <span className="font-mono font-black text-indigo-700 bg-indigo-100/80 px-2.5 py-0.5 rounded-full text-xs">{controlPanelParams.left_force} N</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={40}
                      value={controlPanelParams.left_force}
                      onChange={(e) => setTempParams({ ...tempParams, left_force: parseInt(e.target.value) })}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>

                  {/* 2. Right Force Slider */}
                  <div className="flex flex-col gap-1.5 animate-none">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-800">
                      <span className="text-slate-800 font-black text-sm">右侧牵引拉力</span>
                      <span className="font-mono font-black text-indigo-700 bg-indigo-100/80 px-2.5 py-0.5 rounded-full text-xs">{controlPanelParams.right_force} N</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={40}
                      value={controlPanelParams.right_force}
                      onChange={(e) => setTempParams({ ...tempParams, right_force: parseInt(e.target.value) })}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>

                  {/* 3. Temp Slider */}
                  <div className="flex flex-col gap-1.5 animate-none">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-800">
                      <span className="text-slate-800 font-black text-sm">红外热敷温度</span>
                      <span className="font-mono font-black text-red-600 bg-red-100/80 px-2.5 py-0.5 rounded-full text-xs">{controlPanelParams.temp} ℃</span>
                    </div>
                    <input
                      type="range"
                      min={35}
                      max={50}
                      value={controlPanelParams.temp}
                      onChange={(e) => setTempParams({ ...tempParams, temp: parseInt(e.target.value) })}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-500"
                    />
                  </div>

                  {/* 4. Dur Slider */}
                  <div className="flex flex-col gap-1.5 animate-none">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-800">
                      <span className="text-slate-800 font-black text-sm">定时理疗时间</span>
                      <span className="font-mono font-black text-indigo-700 bg-indigo-100/80 px-2.5 py-0.5 rounded-full text-xs">{controlPanelParams.duration} 分钟</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={45}
                      value={controlPanelParams.duration}
                      onChange={(e) => setTempParams({ ...tempParams, duration: parseInt(e.target.value) })}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>

                  {/* 5. Vibration dropdown switches */}
                  <div className="flex justify-between items-center text-slate-850">
                    <span className="text-sm text-slate-800 font-black">按摩振动模式</span>
                    <div className="flex gap-2">
                      {[0, 1, 2].map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setTempParams({ ...tempParams, vibration: mode })}
                          className={`px-3 py-1.5 text-xs font-black rounded-xl border-2 cursor-pointer transition ${
                            controlPanelParams.vibration === mode
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-600/10'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {mode === 0 ? '无振动' : mode === 1 ? '低频揉和' : '高频舒张'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* CORE LAUNCH SWITCHES BUTTONS */}
                <button
                  onClick={handleToggleTherapy}
                  className={`py-3.5 rounded-2xl font-black text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer ${
                    hardwareState.is_running
                      ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/15'
                      : 'bg-indigo-600 hover:bg-indigo-750 text-white shadow-indigo-650/15'
                  }`}
                >
                  {hardwareState.is_running ? (
                    <>
                      <Square size={16} fill="white" />
                      <span>结束治疗 (紧急停机卸压)</span>
                    </>
                  ) : (
                    <>
                      <Play size={16} fill="white" />
                      <span>开始物理康复治疗</span>
                    </>
                  )}
                </button>

                <EstopControl
                  hardwareState={hardwareState}
                  onUpdateHardware={onUpdateHardware}
                  onLog={onSendHardwareAction}
                />

                <MotorRetractPanel
                  variant="control"
                  hardwareState={hardwareState}
                  onUpdateHardware={onUpdateHardware}
                  onLog={onSendHardwareAction}
                />
              </div>
            )}

            {/* 1.3 免设备动作库 — 独立模块，不与控制面板或离线简版首页同屏 */}
            {showOfflineRehabDashboard && showDetailedManualExerciseLibrary && (
              <div className="flex flex-col gap-4 animate-in fade-in duration-300">
                
                {/* 1.3a No-Equipment Stretching Action Library */}
                <div className="bg-white rounded-3xl p-4 shadow-md shadow-slate-100/60 flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-indigo-50/40 pb-2.5">
                    <div className="flex items-center gap-1.5 justify-start text-left">
                      <div className="w-1.5 h-3.5 bg-amber-500 rounded-full"></div>
                      <h3 className="text-xs font-bold text-slate-900 font-display">徒手自健拉伸动作库 (免设备训练)</h3>
                    </div>
                    <span className="text-[9px] text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full font-bold">每日必练推荐</span>
                  </div>
                  
                  <p className="text-[10px] text-slate-500 leading-normal text-left">
                    专为居家无仪器的用户研发。通过股四头肌等长收缩和膝关节低幅自重拉伸，有效刺激髌周侧支韧带，建立微循环：
                  </p>

                  <div className="flex flex-col gap-3 mt-1 text-slate-800 font-sans">
                    {[
                      {
                        id: 'wall_squat',
                        name: '动作一：靠墙无感静蹲 (减阻肌群训练)',
                        desc: '背部肌肉紧贴墙壁慢慢下滑，大腿与小腿呈现135度长开角，双脚在膝盖正下方稍微前伸。主攻大腿前侧股四头肌，为膝盖受磨损关节增加天然肌肉保护气垫。',
                        tips: '患者跟练要诀：双手可撑在大腿上辅助泄力，切忌用力蹲得太深，前侧大腿感到微热即可。对髌骨关节软骨磨损有良好保护作用。',
                        Icon: Mountain,
                        duration: '30秒等长跟练'
                      },
                      {
                        id: 'leg_raise',
                        name: '动作二：坐姿膝伸平抬 (关节控积消胀)',
                        desc: '端坐在牢固长椅前部，提起一侧大腿慢直向前平伸，同时脚尖大角度勾起并向内对拉。该等长运动能调动髌骨脂肪垫及滑囊新陈代谢，加速重力积液水的自我吸收。',
                        tips: '患者跟练要诀：坐姿挺拔，大腿前部肌肉会有微酸热感，坚持30秒后换另一侧，能有效缓解上下楼梯时的膝盖酥软发飘。',
                        Icon: PersonStanding,
                        duration: '30秒耐力保持'
                      },
                      {
                        id: 'ankle_pump',
                        name: '动作三：踝泵双向促返 (淋巴循环提升)',
                        desc: '平躺或靠坐仰卧在软榻上，用力使一侧脚背向上勾起，维持5秒，再全力将脚背向前下踩压，维持5秒。踝关节运动像物理活塞泵一样推动下肢血液淋巴迅速返流。',
                        tips: '患者跟练要诀：该动作最适用于滑膜炎髌骨红胀、积水无法负重下地的患者，可在肢体无自重负荷状态下安全跟练促进循环。',
                        Icon: Footprints,
                        duration: '30秒微舒张练习'
                      }
                    ].map((act) => {
                      const isCompleted = completedExercises.includes(act.id);
                      const isCurrent = activeExerciseId === act.id;

                      return (
                        <div key={act.id} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-200/60 transition flex flex-col gap-2 text-left animate-in slide-in-from-bottom-1 duration-150">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2">
                              <span className="w-8 h-8 rounded-lg bg-white border border-slate-200/60 flex items-center justify-center shrink-0">
                                <act.Icon size={18} strokeWidth={2.2} className="text-slate-600" />
                              </span>
                              <div>
                                <h4 className="text-[11px] font-bold text-slate-900 leading-snug">{act.name}</h4>
                                <span className="text-[8.5px] bg-slate-200 text-slate-650 px-1.5 py-0.2 rounded font-mono font-bold mt-0.5 inline-block">{act.duration}</span>
                              </div>
                            </div>

                            {/* Completed Status Badge */}
                            {isCompleted ? (
                              <span className="flex items-center gap-0.5 text-[9px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full font-bold">
                                <Check size={10} className="stroke-[3]" /> 已完成
                              </span>
                            ) : isCurrent ? (
                              <span className="flex items-center gap-1 text-[9.5px] text-indigo-650 bg-indigo-50 border border-indigo-150 px-2 py-0.5 rounded-full font-bold animate-pulse font-mono">
                                <Timer size={10} strokeWidth={2.2} />
                                {exerciseTimer} 秒
                              </span>
                            ) : (
                              <span className="text-[9px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-bold">待跟练</span>
                            )}
                          </div>

                          <p className="text-[10.5px] text-slate-600 leading-relaxed font-normal">{act.desc}</p>
                          <div className="text-[9px] text-amber-800 bg-amber-50/80 p-2 rounded-xl border border-amber-100/60 leading-relaxed italic">{act.tips}</div>

                          {/* Action Controls */}
                          <div className="flex justify-end mt-1 gap-2">
                            {/* Toggle trainer button */}
                            {!isCompleted && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (isCurrent) {
                                    setIsExerciseRunning(false);
                                    setActiveExerciseId(null);
                                    onSendHardwareAction(`[手操中止] 患者中止了免设备跟练动作：${act.name}`);
                                  } else {
                                    setActiveExerciseId(act.id);
                                    setExerciseTimer(30);
                                    setIsExerciseRunning(true);
                                    onSendHardwareAction(`[手操锻炼] 患者激活免设备跟练动作：${act.name}，30秒跟练计时已校准运行`);
                                  }
                                }}
                                className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black cursor-pointer transition active:scale-95 flex items-center gap-1 ${
                                  isCurrent
                                    ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-md'
                                    : 'bg-indigo-600 hover:bg-indigo-750 text-white shadow-sm font-sans'
                                }`}
                              >
                                {isCurrent ? (
                                  '停止练习'
                                ) : (
                                  <>
                                    <Zap size={11} strokeWidth={2.2} />
                                    开启30秒跟练计时
                                  </>
                                )}
                              </button>
                            )}

                            {/* Direct completed logger */}
                            <button
                              type="button"
                              onClick={() => {
                                const todayStr = '2026-05-31';
                                if (!checkInDates.includes(todayStr)) {
                                  onAddCheckIn(todayStr);
                                }
                                if (!completedExercises.includes(act.id)) {
                                  setCompletedExercises(prev => [...prev, act.id]);
                                }
                                onSendHardwareAction(`[徒手训练完成] 患者免设备手法登记【${act.name}】并完成5月31日康复打卡！已极速上传家属端。`);
                              }}
                              className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black cursor-pointer transition active:scale-95 border flex items-center gap-1 ${
                                isCompleted
                                  ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                                  : 'bg-emerald-50 border-emerald-150 text-emerald-800 hover:bg-emerald-100 font-sans'
                              }`}
                              disabled={isCompleted}
                            >
                              <Check size={11} className="stroke-[2.5]" />
                              <span>{isCompleted ? '跟练完毕' : '已练完，打卡积分'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 1.3b Science & Education Hub */}
                <div className="bg-white rounded-3xl p-4 shadow-md shadow-slate-100/60 flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-indigo-50/40 pb-2.5">
                    <div className="flex items-center gap-1.5 align-middle text-left justify-start">
                      <div className="w-1.5 h-3.5 bg-violet-500 rounded-full"></div>
                      <h3 className="text-xs font-bold text-slate-900 font-display">膝盖保健康复科普：医学讲堂</h3>
                    </div>
                    <span className="text-[9px] text-violet-750 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-full font-bold">李敬东教授编审</span>
                  </div>

                  <p className="text-[10px] text-slate-500 mt-0.5 leading-normal text-left">
                    由膝盖临床病理研委会荣誉出品。用严谨生动、浅显易懂的内容阐明积液吸收和肌肉防护的基本物理解析：
                  </p>

                  <div className="flex flex-col gap-2.5 mt-1 font-sans">
                    {[
                      {
                        id: 'sci_1',
                        title: '❓ 膝关节磨损发胀，可以盲目冷敷吗？患者常见什么误区？',
                        summary: '【李教授科普】：如果是剧烈运动意外扭伤韧带、或者是剧烈运动后膝盖摸上去滚烫红肿的急性炎症期（突发性发炎的第1-2天），为了降温阻断体内积水渗油，采取冰敷是正确的。但是临床常见的关节陈旧性退行性病变、滑膜腔积液酸胀，表现为晨起紧绷发木、阴雨天僵冷刺痛（VAS评分在3-6分之间），这时候万万不能盲目冰敷！应该坚持在39-44℃恒温热敷（配合膝悦热贴红外辐射），能彻底释放滑膜孔毛细血管通透性，利用人体自身的血管淋巴回流，将骨关节深层的积液缓慢吸收排走！',
                        meta: '点击阅读 · 本周推荐酸胀患者阅读过1.2w次'
                      },
                      {
                        id: 'sci_2',
                        title: '❓ 膝关节积液越抽产积液越多？膝盖绝对不能随便去抽黄水吗？',
                        summary: '【李教授科普】：很多患者一感到膝盖红肿酸胀、飘浮感，就去社区打针抽积液，结果两周后又胀得更大。关节出水其实是人体滑膜由于软骨垫子发生磨损后，主动代偿分泌保护膜的“天然骨轴承防磨油”。只要根本的软骨变窄磨损退化未治，一旦贸然抽取，骨面摩擦力骤升，人体反馈机制反而会刺激滑膜以更可怕的数倍水量再次泵满。此外关节穿刺极易将耐药菌带入导致剧烈感染。使用中低频拉力微动能和热贴温敷能有效重组大腿侧支力学平衡，彻底依靠淋巴毛细循环把“积水黄液”天然回吸，无需忍痛用针乱抽。',
                        meta: '点击阅读 · 髌骨不适活动时常伴有异物感患者必读'
                      },
                      {
                        id: 'sci_3',
                        title: '❓ 走台阶时感觉膝盖深层有嘎吱嘎吱摩擦响，这严重吗？',
                        summary: '【李教授科普】：这是临床非常普遍的“髌股关节软骨破损层软化退行”。在健康的关节中，骨端包裹着一层极为光滑呈珍珠质感的软骨作为抗震阻减速。当由于由于长期负重、上下楼梯骨骼产生的剪拉力超过其承受极值（大于4级磨损），软骨层发生剥落并露出参差不齐的骨面。再次过度活动就会因骨面上粗糙的微刺相互啃咬发嘎吱声。平时应极力避免双手提重物、过度爬楼，而应通过【静蹲】或【坐姿单腿抬】动作等长收缩力量，增强大腿功能韧带张力，分担对拉拉应力。',
                        meta: '点击阅读 · 膝关节松弛重塑红线指南'
                      }
                    ].map((art) => {
                      const isExpanded = activeScienceArticleId === art.id;

                      return (
                        <div key={art.id} className="p-3 bg-violet-50/25 rounded-2xl border border-violet-100/30 text-left transition duration-200">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveScienceArticleId(isExpanded ? null : art.id);
                              if (!isExpanded) {
                                onSendHardwareAction(`[科普阅读] 用户主动学习了博爱李主任膝悦科普指南：《${art.title.replace('❓ ', '')}》`);
                              }
                            }}
                            className="w-full flex justify-between items-start text-left cursor-pointer gap-2"
                          >
                            <span className="text-[11.5px] font-bold text-slate-800 hover:text-indigo-600 leading-relaxed flex-1">{art.title}</span>
                            <span className="text-[9.5px] text-violet-600 font-extrabold whitespace-nowrap pt-0.5">{isExpanded ? '收起 ▴' : '展开全文 ▾'}</span>
                          </button>

                          {isExpanded && (
                            <div className="mt-2 pl-1 border-l-2 border-violet-300 animate-in slide-in-from-top-1 duration-205">
                              <p className="text-[10.5px] text-slate-650 leading-relaxed font-normal bg-white/75 p-2.5 rounded-xl border border-violet-100/30">{art.summary}</p>
                              
                              <div className="mt-2 flex justify-between items-center text-[8.5px] text-slate-500 px-1 font-sans">
                                <span>1.2w+ 患者已学习</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSendHardwareAction(`[知识掌握] 患者确认完成阅读：掌握了《${art.title.replace('❓ ', '')}》的骨关节避坑常识，健康指数+1。`);
                                    alert('已为您登记“在线科普知识掌握”一次！祝愿您和家人膝关节康健常青。');
                                  }}
                                  className="px-2 py-0.5 bg-violet-100 hover:bg-violet-200 text-violet-800 rounded font-black cursor-pointer transition text-[9px]"
                                >
                                  我已读完并学成 ✔
                                </button>
                              </div>
                            </div>
                          )}

                          {!isExpanded && (
                            <div className="text-[8px] text-slate-400 mt-1 font-sans">1.2w+ 患者已学习</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            )}
            
          </div>
        )}

        {/* ===================================== */}
        {/* TAB 2: HEALTH INCENTIVES (BCW: INTRINSIC) */}
        {/* ===================================== */}
        {activeTab === 'incentive' && (
          <div className="flex-1 flex flex-col gap-4">
            
            {/* 2.1 CHECK-IN CALENDAR CALENDAR */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <CalendarDays size={16} className="text-violet-600" />
                  <h3 className="text-xs font-bold text-slate-900 font-display">本月健康打卡日历</h3>
                </div>
                <span className="text-[9px] px-2 py-0.5 bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-full font-bold">
                  连续打卡：{checkInDates.length} 天
                </span>
              </div>

              {/* Month Cal Layout */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60 mt-2">
                <div className="text-center text-[11px] font-bold text-slate-700 mb-2 font-display">
                  2026年 5月 (膝关节康复周期)
                </div>
                <div className="grid grid-cols-7 gap-1.5 text-center text-[8px] font-bold text-slate-400 mb-1">
                  <span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {/* Empty offsets for May 2026 (Starts on Friday, 5 days offset) */}
                  {[...Array(5)].map((_, i) => (
                    <div key={`empty-${i}`} className="h-6"></div>
                  ))}
                  
                  {/* 31 days representing May */}
                  {[...Array(31)].map((_, i) => {
                    const dayNum = i + 1;
                    const dateStr = `2026-05-${dayNum.toString().padStart(2, '0')}`;
                    const isChecked = checkInDates.includes(dateStr);
                    const isToday = dayNum === 31;

                    return (
                      <button
                        key={dayNum}
                        onClick={() => {
                          if (!isChecked) {
                            onAddCheckIn(dateStr);
                            onSendHardwareAction(`[奖励打卡] 手动点击日历，记录了 5月${dayNum}日 居家康复打卡日志`);
                          }
                        }}
                        className={`h-7 w-7 rounded-lg text-[10px] font-mono leading-none flex items-center justify-center transition cursor-pointer relative ${
                          isChecked
                            ? 'bg-emerald-500 text-white font-bold shadow-sm shadow-emerald-500/20'
                            : isToday
                              ? 'border-2 border-indigo-505 text-indigo-700 font-bold bg-indigo-50'
                              : 'bg-white hover:bg-indigo-50 text-slate-600 border border-slate-200/60'
                        }`}
                      >
                        {dayNum}
                        {isChecked && (
                          <span className="absolute -bottom-0.5 right-0.5 w-1.5 h-1.5 bg-white rounded-full flex items-center justify-center">
                            <span className="w-1 h-1 bg-emerald-600 rounded-full"></span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 2.2 3D NEUMORPHIC VIRTUAL BADGES LIST */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm flex flex-col gap-2 shrink-0">
              <div className="flex items-center gap-1.5 mb-1">
                <Award size={16} className="text-amber-500" />
                <h3 className="text-xs font-bold text-slate-900 font-display">已解锁荣誉勋章</h3>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {[
                  {
                    name: "初出茅庐",
                    desc: "首次启动理疗训练",
                    Icon: Sprout,
                    unlocked: checkInDates.length >= 1,
                    benefit: "理疗拉力限值+2N"
                  },
                  {
                    name: "膝健常青",
                    desc: "累计训练满3次",
                    Icon: Trees,
                    unlocked: checkInDates.length >= 3,
                    benefit: "开启高频揉合模式"
                  },
                  {
                    name: "意志守护",
                    desc: "累计训练满5次",
                    Icon: Shield,
                    unlocked: checkInDates.length >= 5,
                    benefit: "智能算法优先级高"
                  },
                  {
                    name: "孝行自如",
                    desc: "完成亲情账绑守护",
                    Icon: Heart,
                    unlocked: true,
                    benefit: "一键督促双向触达"
                  }
                ].map((badge, idx) => (
                  <div 
                    key={idx}
                    className={`p-2 rounded-2xl border text-center flex flex-col items-center gap-1 transition-all duration-200 ${
                      badge.unlocked 
                        ? 'bg-gradient-to-b from-amber-50 to-orange-50 border-orange-200/60 text-amber-900 shadow-sm scale-100'
                        : 'bg-slate-100 border-slate-200 text-slate-400 opacity-50 scale-95'
                    }`}
                  >
                    <span className="w-8 h-8 flex items-center justify-center">
                      {badge.unlocked ? (
                        <badge.Icon size={20} strokeWidth={2.2} className="text-amber-700" />
                      ) : (
                        <Lock size={18} strokeWidth={2.2} className="text-slate-400" />
                      )}
                    </span>
                    <span className="text-[9px] font-bold font-display tracking-tight leading-tight block truncate w-full">{badge.name}</span>
                    <span className="text-[7px] text-orange-700 font-mono font-semibold truncate block w-full">{badge.unlocked ? badge.benefit : "未解锁"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 2.3 REHABILITATION DATA STOCHASTIC CHARTS — 需已连接设备且有过理疗记录 */}
            {hardwareState.connection !== 'disconnected' &&
              (patientProfile.history.length > 0 || checkInDates.length > 0) && (
              <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm flex flex-col gap-2">
                <h3 className="text-xs font-bold text-slate-900 font-display mb-1 flex items-center gap-1">
                  <TrendingUp size={14} strokeWidth={2.2} />
                  膝痛与应力趋势 (数据看板)
                </h3>

                <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-2 flex flex-col gap-1.5">
                  <div className="text-[8px] font-semibold text-slate-500 ml-1 font-mono flex gap-4 shrink-0">
                    <span className="flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full inline-block"></span>
                      治疗拉应力(N)
                    </span>
                    <span className="flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 bg-rose-500 rounded-full inline-block"></span>
                      膝部VAS疼痛分
                    </span>
                  </div>

                  <div className="h-20 select-none shrink-0">
                    <svg className="w-full h-full" viewBox="0 0 100 30" preserveAspectRatio="none">
                      <line x1="0" y1="5" x2="100" y2="5" stroke="#E2E8F0" strokeWidth="0.3" strokeDasharray="1,1" />
                      <line x1="0" y1="15" x2="100" y2="15" stroke="#E2E8F0" strokeWidth="0.3" strokeDasharray="1,1" />
                      <line x1="0" y1="25" x2="100" y2="25" stroke="#E2E8F0" strokeWidth="0.3" strokeDasharray="1,1" />
                      <path
                        d="M 5,25 Q 25,20 45,15 T 85,8 L 95,6"
                        fill="none"
                        stroke="#4F46E5"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                      <path
                        d="M 5,6 Q 25,12 45,16 T 85,22 L 95,24"
                        fill="none"
                        stroke="#F43F5E"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                      <circle cx="5" cy="25" r="1" fill="#5E4F9E" />
                      <circle cx="45" cy="15" r="1" fill="#5E4F9E" />
                      <circle cx="95" cy="6" r="1" fill="#5E4F9E" />
                      <circle cx="5" cy="6" r="1" fill="#F43F5E" />
                      <circle cx="45" cy="16" r="1" fill="#F43F5E" />
                      <circle cx="95" cy="24" r="1" fill="#F43F5E" />
                    </svg>
                  </div>

                  <div className="flex justify-between text-[7px] text-slate-400 font-mono px-1 shrink-0">
                    <span>第1次理疗 (初)</span>
                    <span>第5次理疗 (析)</span>
                    <span>今日 (效)</span>
                  </div>
                </div>

                <p className="text-[9px] text-slate-400 italic text-center leading-relaxed px-1 pt-1">
                  科研依据：持续的热敏拉伸配合可有效舒展关节滑膜，阻断VAS感觉通路的痛信号传送。
                </p>
              </div>
            )}
          </div>
        )}

        {/* ===================================== */}
        {/* TAB 3: SYSTEM SETTINGS (BCW: PHYSICAL OPPORTUN) */}
        {/* ===================================== */}
        {activeTab === 'settings' && (
          <div className="flex-1 flex flex-col gap-4">
            
            {/* 3.1 DEVICE PROTECTION BRIDGES GUARD DETAILS */}
            <div
              className={`bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm flex flex-col gap-3 shrink-0 transition ${
                !isHardwareLinked ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-center gap-1.5 text-slate-800">
                <ShieldCheck
                  size={18}
                  className={isHardwareLinked ? 'text-emerald-600' : 'text-slate-400'}
                />
                <h3
                  className={`text-xs font-bold font-display ${
                    isHardwareLinked ? 'text-slate-900' : 'text-slate-500'
                  }`}
                >
                  防夹过载安全保护
                </h3>
                {!isHardwareLinked && (
                  <span className="text-[8px] text-slate-400 font-bold ml-auto">未连接设备</span>
                )}
              </div>

              <div
                className={`flex flex-col gap-1 p-3 rounded-2xl border ${
                  isHardwareLinked
                    ? 'bg-rose-50/50 border-rose-100'
                    : 'bg-slate-100/80 border-slate-200'
                }`}
              >
                <div
                  className={`flex justify-between items-center text-[10px] font-semibold ${
                    isHardwareLinked ? 'text-rose-800' : 'text-slate-500'
                  }`}
                >
                  <span className="flex items-center gap-0.5 font-bold">
                    <AlertTriangle size={11} /> 恒定拉力过载保护阀
                  </span>
                  <span
                    className={`font-mono font-bold ${
                      isHardwareLinked ? 'text-rose-700' : 'text-slate-400'
                    }`}
                  >
                    {hardwareState.max_force_limit} N
                  </span>
                </div>
                <p className="text-[9px] text-slate-500 mt-0.5 leading-normal">
                  {isHardwareLinked
                    ? '此阀值防滑齿扣限定：当仪器反馈拉伸拉力超过阀值，系统内置气动泄压阀物理强制降压，保障膝盖软组织安全。'
                    : '请先通过下方蓝牙或 Wi-Fi 连接理疗设备，连接成功后可调节过载保护阀值。'}
                </p>
                <div className="mt-2.5">
                  <input
                    type="range"
                    min={20}
                    max={40}
                    value={hardwareState.max_force_limit}
                    disabled={!isHardwareLinked}
                    onChange={(e) => {
                      const limit = parseInt(e.target.value);
                      onUpdateHardware({ max_force_limit: limit });
                      onSendHardwareAction(`[安全预设] 重置推杆拉伸防护极值安全网：L_lim <= ${limit}N`);
                    }}
                    className={`w-full h-1 rounded-sm ${
                      isHardwareLinked
                        ? 'accent-rose-500 cursor-pointer'
                        : 'accent-slate-300 cursor-not-allowed'
                    }`}
                  />
                  <div className="flex justify-between text-[7px] text-slate-400 mt-1 font-mono font-bold">
                    <span>高度防护档(20N)</span>
                    <span>常规拉伸限(40N)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3.2 DEVICE CONNECTIVITY PORTS PARERS */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between text-slate-800">
                <h3 className="text-xs font-bold text-slate-900 font-display flex items-center gap-1.5">
                  <Radio size={16} className="text-indigo-600" /> 硬件设备物理通信
                </h3>
                <span
                  className={`text-[9px] px-2 py-0.5 rounded-full font-bold font-mono tracking-wider ${
                    isConnecting
                      ? 'bg-indigo-100 text-indigo-800'
                      : isHardwareLinked
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {isConnecting
                    ? '配对中…'
                    : isHardwareLinked
                      ? hardwareState.connection === 'bluetooth'
                        ? 'BLE 已连接'
                        : 'Wi-Fi 已连接'
                      : '未连接'}
                </span>
              </div>

              <div className={`grid gap-2 mt-1 ${mqttMode ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {!mqttMode && (
                <button
                  type="button"
                  disabled={isConnecting}
                  onClick={() => handleTransportConnect('bluetooth')}
                  className={`py-2 px-3 rounded-2xl border text-center text-[10px] font-bold transition flex flex-col items-center gap-1 ${
                    isConnecting
                      ? 'opacity-50 cursor-wait'
                      : 'cursor-pointer'
                  } ${
                    hardwareState.connection === 'bluetooth' && isHardwareLinked
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Bluetooth size={16} strokeWidth={2.2} />
                  蓝牙 BLE 绑定
                  <span className="text-[8px] font-light text-slate-400">更低功耗 无极配对</span>
                </button>
                )}
                <button
                  type="button"
                  disabled={isConnecting}
                  onClick={() => handleTransportConnect('wifi')}
                  className={`py-2 px-3 rounded-2xl border text-center text-[10px] font-bold transition flex flex-col items-center gap-1 ${
                    isConnecting
                      ? 'opacity-50 cursor-wait'
                      : 'cursor-pointer'
                  } ${
                    hardwareState.connection === 'wifi' && isHardwareLinked
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Wifi size={16} strokeWidth={2.2} />
                  {mqttMode ? 'MQTT 云端连接' : '家庭 Wi-Fi 绑定'}
                  <span className="text-[8px] font-light text-slate-400">
                    {mqttMode
                      ? `设备 ID：${getStoredDeviceId() || '未配置'}`
                      : '远程同步 异地数据不漏'}
                  </span>
                </button>
              </div>
            </div>

            {/* 3.3 GUARDIAN DETAILS SYNC */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm flex flex-col gap-2">
              <h3 className="text-xs font-bold text-slate-900 font-display flex items-center gap-1.5">
                <Users size={14} strokeWidth={2.2} />
                绑定的亲友关怀账号
              </h3>
              {familyBindings.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200/80 border-dashed rounded-2xl text-center">
                  <p className="text-[10px] text-slate-500 font-bold">暂无绑定的亲友账号</p>
                  <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">
                    家属可在家属端通过手机号或扫码绑定您的账号，绑定后可远程关注康复进度
                  </p>
                </div>
              ) : (
                familyBindings.map((binding) => (
                  <div
                    key={binding.id}
                    className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-2xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                        <HeartHandshake size={18} strokeWidth={2.2} className="text-indigo-600" />
                      </span>
                      <div>
                        <h4 className="text-[11px] font-bold text-slate-800">
                          {binding.family_name}
                          <span className="text-slate-500 font-medium"> (家属端)</span>
                        </h4>
                        <span className="text-[9px] text-indigo-700 font-semibold bg-indigo-100/80 px-1 rounded-sm font-display">
                          已绑定状态关注中
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      {binding.family_phone}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* 3.4 LOGOUT EXIT SECTION */}
            {onLogout && (
              <div className="mt-2 shrink-0">
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full py-3 bg-slate-200/80 hover:bg-slate-300 hover:text-slate-900 active:scale-95 transition text-[11px] font-bold text-slate-700 rounded-2xl border border-slate-300 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut size={14} strokeWidth={2.2} />
                  安全退出当前账户
                </button>
              </div>
            )}

          </div>
        )}
      </div></div>
      )}

      {/* Fixed bottom tab bar — stays visible while content scrolls */}
      {!isColdBootActive && !isConnecting && (
      <div
        className="pointer-events-none fixed bottom-0 left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="pointer-events-auto mx-4 grid h-[62px] grid-cols-3 items-center justify-center gap-1 rounded-full border border-slate-200/60 bg-white/95 px-3 shadow-lg shadow-indigo-100/30 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setActiveTab('therapy')}
          className={`h-11 rounded-full text-[10px] font-bold font-display flex flex-col items-center justify-center gap-0.5 transition-all duration-200 cursor-pointer ${
            activeTab === 'therapy'
              ? 'text-indigo-600 bg-indigo-50/50'
              : 'text-slate-400 hover:text-slate-655'
          }`}
        >
          <Sparkles size={18} className={activeTab === 'therapy' ? 'scale-105 stroke-[2.25]' : 'stroke-1.5'} />
          <span>智能康复</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('incentive')}
          className={`h-11 rounded-full text-[10px] font-bold font-display flex flex-col items-center justify-center gap-0.5 transition-all duration-200 cursor-pointer ${
            activeTab === 'incentive'
              ? 'text-indigo-600 bg-indigo-50/50'
              : 'text-slate-400 hover:text-slate-655'
          }`}
        >
          <Award size={18} className={activeTab === 'incentive' ? 'scale-105 stroke-[2.25]' : 'stroke-1.5'} />
          <span>健康激励</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`h-11 rounded-full text-[10px] font-bold font-display flex flex-col items-center justify-center gap-0.5 transition-all duration-200 cursor-pointer ${
            activeTab === 'settings'
              ? 'text-indigo-600 bg-indigo-50/50'
              : 'text-slate-400 hover:text-slate-655'
          }`}
        >
          <Settings size={18} className={activeTab === 'settings' ? 'scale-105 stroke-[2.25]' : 'stroke-1.5'} />
          <span>康复设置</span>
        </button>
        </div>
      </div>
      )}

    </div>
  );
}
