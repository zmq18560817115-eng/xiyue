/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  ClinicalCase, SymptomInput, TreatmentParams, PatientProfile, 
  HardwareState, AppNotification 
} from './types';
import type { HardwareUpdateOptions } from './types';
import { initialClinicalCases } from './data';
import AppShell from './components/AppShell';
import PatientApp from './components/PatientApp';
import DoctorApp from './components/DoctorApp';
import FamilyApp from './components/FamilyApp';
import LoginApp from './components/LoginApp';
import {
  addCheckIn,
  bindFamilyByPhone,
  bindFamilyByQr,
  completeTreatmentSession,
  getAuthToken,
  getClinicalCases,
  getFamilyBindings,
  getFamilyCheckInStats,
  getFamilyPatientDevice,
  getMe,
  getNotifications,
  getPatientDevice,
  getPatientProfile,
  getPatientFamilyBindings,
  acceptPrescription,
  getPendingPrescriptions,
  getPatientRemindStatus,
  ackPatientRemindStatus,
  logoutApi,
  markNotificationRead,
  sendFamilyNudge,
  sendPrescription,
  setAuthToken,
  startTreatmentSession,
  stopTreatmentSession,
  syncDeviceTelemetry,
  updateDeviceConnection,
} from './api/client';
import {
  cancelHardwareConnection,
  connectHardwareDevice,
  disconnectHardwareDevice,
} from './hardware/connectionManager';
import {
  deviceController,
  statusToHardwarePatch,
  statusToTelemetryPatch,
} from './hardware/deviceController';
import { canSyncToPhysicalDevice, mergeApiDevice } from './hardware/deviceSync';
import { isMqttHardwareMode } from './hardware/mqttConfig';
import type {
  ConnectionPhase,
  ConnectionProgress,
  HardwareTransport,
} from './hardware/types';
import DeviceDebugPanel from './components/DeviceDebugPanel';

export default function App() {
  // 1. GLOBAL CLINICAL STATES WITH PERSISTENT PROGRESS
  const [clinicalCases, setClinicalCases] = useState<ClinicalCase[]>(initialClinicalCases);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  
  const [patientProfile, setPatientProfile] = useState<PatientProfile>({
    id: '2001',
    name: '王大爷',
    age: 67,
    phone: '186****5678',
    cartilage_wear: 4,
    joint_fluid: 3,
    pain_score: 7,
    auth_code: null,
    binding_doctor_id: null,
    attendance_rate: 75,
    check_in_dates: [],
    history: [],
  });

  // Simulated hardware state initialization in background (keeps mobile UI highly interactive)
  const [hardwareState, setHardwareState] = useState<HardwareState>({
    is_mock_mode: !isMqttHardwareMode(),
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
    battery_level: 95,
    estop: false,
    sw_estop: false,
    hw_estop: false,
    device_fault: 0,
  });

  // Multicast UART Serial logs array saved in state
  const [serialLogs, setSerialLogs] = useState<string[]>([]);

  // Unified Notification node
  const [activeNotification, setActiveNotification] = useState<AppNotification | null>(null);

  // Dynamic role manager
  const [activeRole, setActiveRole] = useState<'patient' | 'doctor' | 'family'>('patient');

  // Triggering nudge parameters holder states
  const [familyNudgeReceived, setFamilyNudgeReceived] = useState<string | null>(null);
  const [remotePrescription, setRemotePrescription] = useState<TreatmentParams | null>(null);
  const [pendingPrescriptionId, setPendingPrescriptionId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [boundPatientId, setBoundPatientId] = useState<string>('2001');
  const [familyHardwareAlert, setFamilyHardwareAlert] = useState<string | null>(null);
  const [familyWeeklyRate, setFamilyWeeklyRate] = useState<number>(0);
  const [apiOnline, setApiOnline] = useState<boolean>(true);
  const [patientFamilyBindings, setPatientFamilyBindings] = useState<
    Array<{
      id: string;
      family_user_id: string;
      family_name: string;
      family_phone: string;
      emergency_contact?: boolean;
    }>
  >([]);
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>('disconnected');
  const [connectingTransport, setConnectingTransport] = useState<HardwareTransport | null>(null);
  const [connectionProgress, setConnectionProgress] = useState<ConnectionProgress | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const connectFailTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [prescriptionDetailOpen, setPrescriptionDetailOpen] = useState(false);
  const [prescriptionReviewMeta, setPrescriptionReviewMeta] = useState<{
    title: string;
    message: string;
    timestamp: string;
    action_by?: string;
  } | null>(null);

  const loadPatientData = useCallback(async () => {
    try {
      const [profile, device, casesRes, rxRes, familyRes] = await Promise.all([
        getPatientProfile(),
        getPatientDevice(),
        getClinicalCases(),
        getPendingPrescriptions(),
        getPatientFamilyBindings(),
      ]);
      setPatientProfile(profile);
      setHardwareState((prev) => {
        const merged = mergeApiDevice(prev, device);
        if (isMqttHardwareMode()) {
          if (prev.connection === 'wifi') setConnectionPhase('connected');
        } else {
          setConnectionPhase(device.connection === 'disconnected' ? 'disconnected' : 'connected');
        }
        return merged;
      });
      setClinicalCases(casesRes.cases);
      setPatientFamilyBindings(familyRes.bindings);
      if (rxRes.prescriptions.length > 0) {
        setRemotePrescription(rxRes.prescriptions[0].params);
        setPendingPrescriptionId(rxRes.prescriptions[0].id);
      }
      setApiOnline(true);
    } catch {
      setApiOnline(false);
      setPatientFamilyBindings([]);
    }
  }, []);

  const loadFamilyData = useCallback(async () => {
    try {
      const bindings = await getFamilyBindings();
      if (bindings.bindings.length > 0) {
        const b = bindings.bindings[0];
        setBoundPatientId(b.patient_id);
        const [status, stats] = await Promise.all([
          getFamilyPatientDevice(b.patient_id),
          getFamilyCheckInStats(b.patient_id),
        ]);
        setHardwareState(status.device);
        setFamilyWeeklyRate(stats.weekly_rate ?? stats.attendance_rate);
        if (status.hardware_status === 'Error') {
          setFamilyHardwareAlert(
            '警告：设备检测到拉伸力异常，已自动紧急停止，请立刻电话关注家人安全！'
          );
        }
        setPatientProfile((prev) => ({
          ...prev,
          id: b.patient_id,
          name: status.patient.name,
          check_in_dates: stats.check_in_dates,
          attendance_rate: stats.attendance_rate,
        }));
      }
      setApiOnline(true);
    } catch {
      setApiOnline(false);
    }
  }, []);

  const loadDoctorData = useCallback(async () => {
    try {
      const casesRes = await getClinicalCases();
      setClinicalCases(casesRes.cases);
      const profile = await getPatientProfile().catch(() => null);
      if (profile) setPatientProfile(profile);
      setApiOnline(true);
    } catch {
      setApiOnline(false);
    }
  }, []);

  const pollNotifications = useCallback(async () => {
    if (!getAuthToken() || activeRole !== 'patient') return;
    try {
      const { notifications } = await getNotifications(true);
      if (notifications.length > 0) {
        const n = notifications[0];
        setActiveNotification({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          timestamp: n.timestamp,
          action_by: n.action_by,
        });
        if (n.type === 'prescription') {
          const pending = await getPendingPrescriptions();
          if (pending.prescriptions.length > 0) {
            setRemotePrescription(pending.prescriptions[0].params);
            setPendingPrescriptionId(pending.prescriptions[0].id);
          }
        }
      }
    } catch {
      /* 轮询静默失败 */
    }
  }, [activeRole]);

  const syncPatientRemind = useCallback(async () => {
    if (!getAuthToken() || activeRole !== 'patient') return;
    try {
      const { remind_active, message } = await getPatientRemindStatus();
      if (remind_active) {
        setFamilyNudgeReceived(message ?? '');
      } else {
        setFamilyNudgeReceived(null);
      }
    } catch {
      setFamilyNudgeReceived(null);
    }
  }, [activeRole]);

  const pollPatientRemind = useCallback(async () => {
    if (!getAuthToken() || activeRole !== 'patient') return;
    try {
      const { remind_active, message } = await getPatientRemindStatus();
      if (remind_active) {
        setFamilyNudgeReceived(message ?? '');
      } else {
        setFamilyNudgeReceived(null);
      }
    } catch {
      /* 轮询静默失败 */
    }
  }, [activeRole]);

  useEffect(() => {
    const saved = localStorage.getItem('kneejoy_token');
    if (!saved) return;
    setAuthToken(saved);
    let cancelled = false;
    void (async () => {
      try {
        const user = await getMe();
        if (cancelled) return;
        setActiveRole(user.role);
        setIsLoggedIn(true);
        if (user.role === 'patient') {
          await loadPatientData();
          await syncPatientRemind();
        } else if (user.role === 'doctor') {
          await loadDoctorData();
        } else {
          await loadFamilyData();
        }
      } catch {
        if (!cancelled) setAuthToken(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // 仅启动时恢复会话
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    const timer = setInterval(() => {
      pollNotifications();
      pollPatientRemind();
    }, 5000);
    return () => clearInterval(timer);
  }, [isLoggedIn, pollNotifications, pollPatientRemind]);

  // 理疗倒计时：每秒递减 1 秒（与真实设备时钟一致）
  useEffect(() => {
    if (!hardwareState.is_running) return;

    const timer = setInterval(() => {
      setHardwareState((prev) => {
        if (!prev.is_running || prev.time_left_seconds <= 0) return prev;

        const nextSeconds = prev.time_left_seconds - 1;

        if (nextSeconds <= 0) {
          if (apiOnline && activeSessionId) {
            completeTreatmentSession(activeSessionId)
              .then(({ patient, device }) => {
                setPatientProfile(patient);
                setHardwareState((prev) => mergeApiDevice(prev, device));
                setActiveSessionId(null);
              })
              .catch(() => {
                /* 本地 UI 仍展示完成态 */
              });
          }

          setActiveNotification({
            id: 'not_complete',
            type: 'system',
            title: '治疗圆满结束并自动打卡',
            message: '今日膝关节拉伸治疗已成功按标进行，气回弹已释放。已为您解锁多项成就，数据已同步给家属！',
            timestamp: '现在',
          });

          return {
            ...prev,
            is_running: false,
            time_left_seconds: 0,
            battery_level: Math.max(10, prev.battery_level - 3),
          };
        }

        if (apiOnline && activeSessionId && nextSeconds % 30 === 0) {
          syncDeviceTelemetry({
            time_left_seconds: nextSeconds,
            temp: parseFloat((prev.temp + (Math.random() > 0.8 ? 0.2 : 0)).toFixed(1)),
          }).catch(() => undefined);
        }

        const jitter = Math.random() > 0.8 ? (Math.random() > 0.5 ? 0.2 : -0.2) : 0;
        return {
          ...prev,
          time_left_seconds: nextSeconds,
          temp: parseFloat((prev.temp + jitter).toFixed(1)),
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [hardwareState.is_running, apiOnline, activeSessionId]);

  const handleAddSerialLog = (message: string) => {
    setSerialLogs((prev) => [...prev, message]);
  };

  const handleAddClinicalCase = (newCase: ClinicalCase) => {
    setClinicalCases((prev) => [...prev, newCase]);
  };

  // Callback to issue prescription from Doctor（通知仅推送给患者端，不在医生端弹窗）
  const handleSendPrescription = async (prescription: TreatmentParams, patientId = '2002') => {
    if (apiOnline) {
      try {
        await sendPrescription(patientId, prescription);
        handleAddSerialLog(
          `[处方下发成功] 已向患者 ${patientId} 推送远程处方，患者端将收到通知`
        );
      } catch {
        handleAddSerialLog('[处方下发失败] 请检查网络或患者 ID');
      }
    }
  };

  const handleViewPrescriptionNotification = async () => {
    const notif = activeNotification;
    if (notif?.id && apiOnline) {
      markNotificationRead(notif.id).catch(() => undefined);
    }
    setActiveNotification(null);
    setActiveRole('patient');

    if (notif) {
      setPrescriptionReviewMeta({
        title: notif.title,
        message: notif.message,
        timestamp: notif.timestamp,
        action_by: notif.action_by,
      });
    }

    if (apiOnline) {
      try {
        const pending = await getPendingPrescriptions();
        if (pending.prescriptions.length > 0) {
          setRemotePrescription(pending.prescriptions[0].params);
          setPendingPrescriptionId(pending.prescriptions[0].id);
        }
      } catch {
        /* 离线降级 */
      }
    }
    setPrescriptionDetailOpen(true);
  };

  // Callback to accept prescription on patient side
  const handleAcceptPrescription = async (prescription: TreatmentParams) => {
    if (apiOnline && pendingPrescriptionId) {
      try {
        const res = await acceptPrescription(pendingPrescriptionId);
        setHardwareState((prev) => mergeApiDevice(prev, res.device));
        setPatientProfile((prev) => ({
          ...prev,
          current_prescription: prescription,
          onboarding_completed: true,
        }));
        setPendingPrescriptionId(null);
        setRemotePrescription(null);
        setPrescriptionDetailOpen(false);
        setPrescriptionReviewMeta(null);
        return;
      } catch {
        /* 降级为下方同步 */
      }
    }

    if (apiOnline) {
      try {
        const device = await syncDeviceTelemetry({
          left_force: prescription.left_force,
          right_force: prescription.right_force,
          duration: prescription.duration,
          temp: prescription.temp,
          vibration: prescription.vibration,
          time_left_seconds: prescription.duration * 60,
        });
        setHardwareState((prev) => mergeApiDevice(prev, device));
        setPatientProfile((prev) => ({
          ...prev,
          current_prescription: prescription,
          onboarding_completed: true,
        }));
        setRemotePrescription(null);
        setPendingPrescriptionId(null);
        setPrescriptionDetailOpen(false);
        setPrescriptionReviewMeta(null);
        return;
      } catch {
        /* 降级为本地更新 */
      }
    }

    setHardwareState((prev) => ({
      ...prev,
      left_force: prescription.left_force,
      right_force: prescription.right_force,
      duration: prescription.duration,
      temp: prescription.temp,
      vibration: prescription.vibration,
      time_left_seconds: prescription.duration * 60,
    }));
    setPatientProfile((prev) => ({
      ...prev,
      current_prescription: prescription,
      onboarding_completed: true,
    }));
    setRemotePrescription(null);
    setPendingPrescriptionId(null);
    setPrescriptionDetailOpen(false);
    setPrescriptionReviewMeta(null);
  };

  // Callback to trigger nudge on family side
  const handleTriggerNudge = async (message: string) => {
    if (apiOnline) {
      try {
        await sendFamilyNudge(boundPatientId, message);
      } catch {
        /* 离线降级为本地 state */
      }
    }
    setFamilyNudgeReceived(message);
  };

  // Switch role and log in
  const handleLogin = async (role: 'patient' | 'doctor' | 'family') => {
    setFamilyNudgeReceived(null);
    setActiveRole(role);
    setIsLoggedIn(true);
    try {
      if (role === 'patient') {
        await loadPatientData();
        await syncPatientRemind();
      } else if (role === 'doctor') {
        await loadDoctorData();
      } else {
        await loadFamilyData();
      }
      pollNotifications();
    } catch {
      /* 登录已成功，数据加载失败时仍保持进入 App（离线降级） */
    }
  };

  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch {
      setAuthToken(null);
    }
    setIsLoggedIn(false);
    setActiveSessionId(null);
    setRemotePrescription(null);
    setPendingPrescriptionId(null);
    setFamilyNudgeReceived(null);
    setPatientFamilyBindings([]);
    setConnectionPhase('disconnected');
    setConnectingTransport(null);
    setConnectionProgress(null);
    setConnectionError(null);
    setPrescriptionDetailOpen(false);
    setPrescriptionReviewMeta(null);
  };

  const handleConnectDevice = async (transport: HardwareTransport) => {
    if (connectionPhase === 'connecting') return;

    if (isMqttHardwareMode() && hardwareState.connection === 'wifi') {
      setConnectionPhase('connected');
      return;
    }

    if (
      !isMqttHardwareMode() &&
      hardwareState.connection !== 'disconnected' &&
      hardwareState.connection !== transport
    ) {
      try {
        await disconnectHardwareDevice();
      } catch {
        /* ignore */
      }
      setHardwareState((prev) => ({ ...prev, connection: 'disconnected' }));
      setConnectionPhase('disconnected');
    }

    setConnectionPhase('connecting');
    setConnectingTransport(transport);
    setConnectionProgress(null);
    setConnectionError(null);

    try {
      const result = await connectHardwareDevice(transport, (progress) => {
        setConnectionProgress(progress);
      });

      if (!result.success || !result.device) {
        throw new Error(result.error ?? '连接失败，请重试');
      }

      if (connectFailTimerRef.current) {
        clearTimeout(connectFailTimerRef.current);
        connectFailTimerRef.current = null;
      }

      setHardwareState((prev) => ({
        ...prev,
        connection: result.device!.transport,
        battery_level: result.device!.batteryLevel ?? prev.battery_level,
        is_mock_mode: false,
      }));
      setConnectionPhase('connected');

      if (result.device!.transport === 'wifi') {
        deviceController.startPolling((status) => {
          setHardwareState((current) => ({
            ...current,
            ...statusToTelemetryPatch(status),
            connection: 'wifi',
            is_mock_mode: false,
          }));
        });
      }

      if (apiOnline) {
        updateDeviceConnection(transport).catch(() => undefined);
        syncDeviceTelemetry({ connection: transport, battery_level: result.device!.batteryLevel }).catch(
          () => undefined
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '连接失败';
      if (message !== '连接已取消') {
        setConnectionError(message);
        setConnectionPhase('failed');
        if (connectFailTimerRef.current) {
          clearTimeout(connectFailTimerRef.current);
        }
        connectFailTimerRef.current = window.setTimeout(() => {
          setConnectionPhase('disconnected');
          setConnectionError(null);
          connectFailTimerRef.current = null;
        }, 3500);
      } else {
        setConnectionPhase('disconnected');
      }
    } finally {
      setConnectingTransport(null);
      setConnectionProgress(null);
    }
  };

  const handleCancelConnect = () => {
    cancelHardwareConnection();
    setConnectingTransport(null);
    setConnectionProgress(null);
    setConnectionPhase('disconnected');
  };

  const handleDisconnectDevice = async () => {
    if (connectionPhase === 'connecting') {
      handleCancelConnect();
      return;
    }
    try {
      deviceController.stopPolling();
      await disconnectHardwareDevice();
    } catch {
      /* ignore */
    }
    setHardwareState((prev) => ({ ...prev, connection: 'disconnected' }));
    setConnectionPhase('disconnected');
    setConnectionError(null);
    if (apiOnline) {
      updateDeviceConnection('disconnected').catch(() => undefined);
    }
  };

  const handleUpdateHardware = (
    updates: Partial<HardwareState>,
    options?: HardwareUpdateOptions
  ) => {
    setHardwareState((prev) => {
      const next = { ...prev, ...updates };
      const syncRun = options?.syncRunToDevice === true;
      const becameRunning = syncRun && updates.is_running === true && !prev.is_running;
      const becameStopped = syncRun && updates.is_running === false && prev.is_running;
      const canSync = canSyncToPhysicalDevice(next);

      if (becameRunning && !canSync) {
        queueMicrotask(() => {
          const hint = isMqttHardwareMode()
            ? '请先完成 MQTT 云端连接（顶部开关或设置页）'
            : '请先连接 Wi-Fi 设备';
          handleAddSerialLog(`[硬件下发跳过] ${hint}`);
          setActiveNotification({
            id: `hw-sync-${Date.now()}`,
            type: 'alarm',
            title: '无法下发治疗命令',
            message: hint,
          });
        });
        return prev;
      }

      if (canSync) {
        if (becameRunning) {
          deviceController
            .startTherapy({
              left_force: next.left_force,
              right_force: next.right_force,
              temp: next.temp,
              vibration: next.vibration,
            })
            .then(() => deviceController.pollOnce())
            .then((status) => {
              setHardwareState((current) => ({
                ...current,
                ...statusToHardwarePatch(status),
                is_running: true,
                time_left_seconds: next.time_left_seconds,
                connection: 'wifi',
                is_mock_mode: false,
              }));
            })
            .catch((err) => {
              const msg = err instanceof Error ? err.message : '未知错误';
              handleAddSerialLog(`[硬件下发失败] ${msg}`);
              setActiveNotification({
                id: `hw-fail-${Date.now()}`,
                type: 'alarm',
                title: '治疗命令下发失败',
                message: msg,
              });
              setHardwareState((current) => ({ ...current, is_running: false }));
            });
        }
        if (becameStopped) {
          deviceController
            .stop()
            .then(() => deviceController.pollOnce())
            .then((status) => {
              setHardwareState((current) => ({
                ...current,
                ...statusToHardwarePatch(status),
                is_running: false,
                connection: 'wifi',
                is_mock_mode: false,
              }));
            })
            .catch((err) => {
              handleAddSerialLog(
                `[硬件急停失败] ${err instanceof Error ? err.message : '未知错误'}`
              );
            });
        }
      }

      if (apiOnline && becameRunning && !activeSessionId) {
        startTreatmentSession({
          left_force: next.left_force,
          right_force: next.right_force,
          duration: next.duration,
          temp: next.temp,
          vibration: next.vibration,
          source: 'manual',
        })
          .then((s) => setActiveSessionId(s.id))
          .catch(() => undefined);
      }
      if (apiOnline && becameStopped && activeSessionId) {
        stopTreatmentSession(activeSessionId)
          .then(() => setActiveSessionId(null))
          .catch(() => undefined);
      }
      if (apiOnline && Object.keys(updates).length > 0) {
        syncDeviceTelemetry(updates).catch(() => undefined);
      }
      return next;
    });
  };

  const handleAddCheckIn = async (date: string) => {
    if (apiOnline) {
      try {
        const res = await addCheckIn(date);
        setPatientProfile((prev) => ({
          ...prev,
          check_in_dates: res.dates,
          attendance_rate: res.attendance_rate,
        }));
        return;
      } catch {
        /* fallback local */
      }
    }
    const checkIns = [...patientProfile.check_in_dates];
    if (!checkIns.includes(date)) checkIns.push(date);
    const baseRate = Math.round((checkIns.length / 4.0) * 100);
    setPatientProfile((prev) => ({
      ...prev,
      check_in_dates: checkIns,
      attendance_rate: Math.min(100, baseRate),
    }));
  };

  const handleClearNotification = () => {
    if (activeNotification?.id === 'remind_status' && apiOnline) {
      ackPatientRemindStatus().catch(() => undefined);
      setFamilyNudgeReceived(null);
    }
    if (activeNotification?.id && activeNotification.id !== 'remind_status' && apiOnline) {
      markNotificationRead(activeNotification.id).catch(() => undefined);
    }
    setActiveNotification(null);
  };

  return (
    <div className="min-h-[100dvh] bg-slate-100 antialiased">
      <AppShell
          activeNotification={activeNotification}
          onClearNotification={handleClearNotification}
          onViewPrescription={handleViewPrescriptionNotification}
          onRoleClick={(role) => {
            if (!isLoggedIn) return;
            setActiveRole(role);
            if (role === 'patient') {
              setActiveNotification(null);
              loadPatientData().catch(() => undefined);
              syncPatientRemind();
            } else {
              setActiveNotification(null);
            }
          }}
        >
          {/* 1. RENDER LOGIN SCREEN IF NOT LOGGED IN */}
          {!isLoggedIn ? (
            <LoginApp onLogin={handleLogin} />
          ) : (
            <>
              {/* 2. ROUTE INDEPENDENT CHANNELS ACCORDING TO ROLES */}
              {activeRole === 'patient' && (
                <PatientApp
                  clinicalCases={clinicalCases}
                  patientProfile={patientProfile}
                  hardwareState={hardwareState}
                  onUpdateHardware={handleUpdateHardware}
                  onSendHardwareAction={handleAddSerialLog}
                  checkInDates={patientProfile.check_in_dates}
                  onAddCheckIn={handleAddCheckIn}
                  familyNudgeReceived={familyNudgeReceived}
                  onClearNudge={() => {
                    setFamilyNudgeReceived(null);
                    if (apiOnline) ackPatientRemindStatus().catch(() => undefined);
                  }}
                  remotePrescription={remotePrescription}
                  onAcceptPrescription={handleAcceptPrescription}
                  prescriptionDetailOpen={prescriptionDetailOpen}
                  prescriptionReviewMeta={prescriptionReviewMeta}
                  onClosePrescriptionDetail={() => {
                    setPrescriptionDetailOpen(false);
                    setPrescriptionReviewMeta(null);
                  }}
                  onOpenDoctorMessage={(msg) => {
                    if (!msg.prescription_params) return;
                    setRemotePrescription(msg.prescription_params);
                    setPendingPrescriptionId(msg.prescription_id ?? null);
                    setPrescriptionReviewMeta({
                      title: msg.title,
                      message: msg.message,
                      timestamp: msg.timestamp,
                      action_by: msg.action_by,
                    });
                    setPrescriptionDetailOpen(true);
                  }}
                  onLogout={handleLogout}
                  apiOnline={apiOnline}
                  familyBindings={patientFamilyBindings}
                  connectionPhase={connectionPhase}
                  connectingTransport={connectingTransport}
                  connectionProgress={connectionProgress}
                  connectionError={connectionError}
                  onConnectDevice={handleConnectDevice}
                  onDisconnectDevice={handleDisconnectDevice}
                  onCancelConnect={handleCancelConnect}
                  onPatientProfileUpdate={setPatientProfile}
                />
              )}

              {activeRole === 'patient' && (
                <DeviceDebugPanel
                  hardwareState={hardwareState}
                  onUpdateHardware={handleUpdateHardware}
                  onLog={handleAddSerialLog}
                />
              )}

              {activeRole === 'doctor' && (
                <DoctorApp
                  clinicalCases={clinicalCases}
                  onAddClinicalCase={handleAddClinicalCase}
                  patientProfile={patientProfile}
                  onSendPrescription={handleSendPrescription}
                  onSendHardwareAction={handleAddSerialLog}
                  onLogout={handleLogout}
                  apiOnline={apiOnline}
                />
              )}

              {activeRole === 'family' && (
                <FamilyApp
                  hardwareState={hardwareState}
                  patientProfile={patientProfile}
                  checkInDates={patientProfile.check_in_dates}
                  weeklyRate={familyWeeklyRate}
                  hardwareAlert={familyHardwareAlert}
                  onClearHardwareAlert={() => setFamilyHardwareAlert(null)}
                  preLinked={apiOnline}
                  onTriggerNudge={handleTriggerNudge}
                  onSendHardwareAction={handleAddSerialLog}
                  onBindByPhone={async (phone) => {
                    try {
                      await bindFamilyByPhone(phone);
                      await loadFamilyData();
                      return true;
                    } catch {
                      return false;
                    }
                  }}
                  onBindByQr={async (token) => {
                    try {
                      await bindFamilyByQr(token);
                      await loadFamilyData();
                      return true;
                    } catch {
                      return false;
                    }
                  }}
                  onLogout={handleLogout}
                />
              )}
            </>
          )}
        </AppShell>
    </div>
  );
}
