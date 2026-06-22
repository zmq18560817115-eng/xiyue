import React, { useState, useEffect } from 'react';
import {
  getDoctorPatients,
  getDoctorProfile,
  submitDoctorVerification,
} from '../api/client';
import { 
  Heart, Database, Plus, Users, Send, BookOpen, UserCheck, 
  Settings2, Activity, CheckCircle, BarChart3, ShieldAlert,
  Sliders, AlertTriangle, FileText, UploadCloud, User, Stethoscope,
  LogOut, Check,
} from 'lucide-react';
import { ClinicalCase, SymptomInput, TreatmentParams, PatientProfile } from '../types';
import AppNavBar, { AppNavRoleBadge, AppNavStatusBadge } from './AppNavBar';

interface DoctorAppProps {
  clinicalCases: ClinicalCase[];
  onAddClinicalCase: (newCase: ClinicalCase) => void;
  patientProfile: PatientProfile;
  onSendPrescription: (prescription: TreatmentParams, patientId?: string) => void;
  onSendHardwareAction: (commandLog: string) => void;
  onLogout?: () => void;
  apiOnline?: boolean;
}

export default function DoctorApp({
  clinicalCases,
  onAddClinicalCase,
  patientProfile,
  onSendPrescription,
  onSendHardwareAction,
  onLogout,
  apiOnline = false,
}: DoctorAppProps) {
  // Navigation
  const [activeTab, setActiveTab] = useState<'workbench' | 'research' | 'license'>('workbench');

  // Interactive Verification States (V2.0 Requirement)
  const [doctorName, setDoctorName] = useState<string>('执业医师');
  const [isDoctorVerified, setIsDoctorVerified] = useState<boolean>(false);
  const [showVerifyModal, setShowVerifyModal] = useState<boolean>(false);
  
  // Verification Form states
  const [verifyDept, setVerifyDept] = useState<string>('骨科康复科');
  const [verifyLicenseId, setVerifyLicenseId] = useState<string>('DOC-2026-MED');
  const [verifyUploadName, setVerifyUploadName] = useState<string>('');

  // Multiple Patients Dashboard States (V2.0 Requirement)
  const [selectedPatientId, setSelectedPatientId] = useState<string>('2001');

  const fallbackPatients = [
    {
      id: '2001',
      name: '王大爷',
      age: 67,
      wear: 4,
      fluid: 3,
      pain: 7,
      attendance: 75,
      phone: '186****5678',
      avatar: '',
      today_done: true,
    },
    {
      id: '2002',
      name: '张阿姨',
      age: 58,
      wear: 2,
      fluid: 1,
      pain: 4,
      attendance: 50,
      phone: '155****8888',
      avatar: '',
      today_done: false,
    },
    {
      id: '2003',
      name: '程序员小李',
      age: 32,
      wear: 1,
      fluid: 2,
      pain: 5,
      attendance: 60,
      phone: '177****5555',
      avatar: '',
      today_done: true,
    },
  ];

  const [patientsList, setPatientsList] = useState(fallbackPatients);

  useEffect(() => {
    if (!apiOnline) return;
    getDoctorProfile()
      .then((profile) => {
        setDoctorName(profile.name);
        setIsDoctorVerified(profile.is_verified);
        if (profile.dept) setVerifyDept(profile.dept);
        if (profile.license_id) setVerifyLicenseId(profile.license_id);
      })
      .catch(() => undefined);

    getDoctorPatients()
      .then((res) => {
        if (res.patients.length > 0) {
          setPatientsList(
            res.patients.map((p) => ({
              id: p.id,
              name: p.name,
              age: p.age,
              wear: p.wear,
              fluid: p.fluid,
              pain: p.pain,
              attendance: p.attendance,
              phone: p.phone,
              avatar: p.avatar ?? '',
              today_done: p.today_done,
            }))
          );
          setSelectedPatientId(res.patients[0].id);
        }
      })
      .catch(() => undefined);
  }, [apiOnline]);

  // Selected Patient
  const activePatient = patientsList.find(p => p.id === selectedPatientId) || patientsList[0];

  // Input states for feeding new cases
  const [newCaseForm, setNewCaseForm] = useState<{
    case_name: string;
    age: number;
    cartilage_wear: number;
    joint_fluid: number;
    pain_score: number;
    left_force: number;
    right_force: number;
    duration: number;
    temp: number;
    vibration: number;
  }>({
    case_name: '重度半月板磨损合并少量间隙狭窄',
    age: 65,
    cartilage_wear: 4,
    joint_fluid: 2,
    pain_score: 7,
    left_force: 22,
    right_force: 20,
    duration: 25,
    temp: 44,
    vibration: 1
  });

  // State for composing prescription
  const [rxForm, setRxForm] = useState<TreatmentParams>({
    left_force: 18,
    right_force: 16,
    duration: 20,
    temp: 42,
    vibration: 1
  });

  const [caseSubmittedMsg, setCaseSubmittedMsg] = useState(false);
  const [rxDispatchedMsg, setRxDispatchedMsg] = useState(false);

  // Readonly modal block
  const triggerReadonlyAlert = (actionTitle: string) => {
    alert(`【资质未通过拦截】您的医生执业资质正在人工审核中，当前处于【功能演示只读模式】。无法进行「${actionTitle}」操作。请点击大盘顶部的蓝色横幅，完成医生注册资质激活！`);
  };

  // Handle clinical cases submit
  const handleAddCase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDoctorVerified) {
      triggerReadonlyAlert('喂养教学经验病例');
      return;
    }
    const newCase: ClinicalCase = {
      case_id: Date.now(),
      case_name: newCaseForm.case_name || "临床自录病例",
      symptoms: {
        age: Number(newCaseForm.age),
        cartilage_wear: Number(newCaseForm.cartilage_wear),
        joint_fluid: Number(newCaseForm.joint_fluid),
        pain_score: Number(newCaseForm.pain_score)
      },
      treatment: {
        left_force: Number(newCaseForm.left_force),
        right_force: Number(newCaseForm.right_force),
        duration: Number(newCaseForm.duration),
        temp: Number(newCaseForm.temp),
        vibration: Number(newCaseForm.vibration)
      }
    };

    onAddClinicalCase(newCase);
    onSendHardwareAction(
      `[临床数据库喂养] 认证医师${doctorName}向系统写入了典型成功教学病例: ${newCase.case_name}。系统智能算法已收录，检索空间扩展为 ${clinicalCases.length + 1} 个病例`
    );
    setCaseSubmittedMsg(true);
    setTimeout(() => setCaseSubmittedMsg(false), 3000);
  };

  // Dispatch live prescription
  const handleSendPrescription = () => {
    if (!isDoctorVerified) {
      triggerReadonlyAlert('下发临床处方');
      return;
    }
    onSendPrescription(rxForm, selectedPatientId);
    onSendHardwareAction(`[远程诊断发包] 定向给患者「${activePatient.name}」核准派发理疗处方: L_F=${rxForm.left_force}N, R_F=${rxForm.right_force}N, TEMP=${rxForm.temp}℃, VIB=${rxForm.vibration}档`);
    setRxDispatchedMsg(true);
    setTimeout(() => setRxDispatchedMsg(false), 3500);
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (apiOnline) {
        const res = await submitDoctorVerification({
          dept: verifyDept,
          license_id: verifyLicenseId,
          certificate_file: verifyUploadName || undefined,
        });
        setIsDoctorVerified(res.is_verified ?? true);
        if (res.dept) setVerifyDept(res.dept);
        if (res.license_id) setVerifyLicenseId(res.license_id);
      } else {
        setIsDoctorVerified(true);
      }
      setShowVerifyModal(false);
      onSendHardwareAction(
        `[资质实名成功] 临床医师成功激活了主治权限！注册执照科室: ${verifyDept}，证锁批号: ${verifyLicenseId}`
      );
      alert(
        '恭喜！执业医师双证自录认证成功。现在已为您全权解锁【签约患者定制处方下发】及【经验病历大盘喂养】核心功能权限。'
      );
    } catch {
      alert('认证提交失败，请确认网络后重试');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full select-none text-slate-800 relative font-sans bg-slate-50">
      
      <AppNavBar
        title={
          activeTab === 'workbench'
            ? '全景工作台'
            : activeTab === 'research'
              ? '博爱学术研发工作间'
              : '数字医生资质审定'
        }
        left={<AppNavRoleBadge>医学专家端</AppNavRoleBadge>}
        right={
          <AppNavStatusBadge
            label="SECURE"
            dotClass="bg-indigo-500"
            pingClass="bg-indigo-400"
          />
        }
      />

      {/* Scrollable Container covering body, padded for fixed tab bar */}
      <div
        className="flex-1 overflow-y-auto px-4 pt-3 flex flex-col gap-4"
        style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
      >

      {/* 2. BODY CONTENT CARDS */}
      <div className="flex-1 flex flex-col gap-4">
        {/* ======================= */}
        {/* TAB 1: DOCTOR WORKBENCH */}
        {/* ======================= */}
        {activeTab === 'workbench' && (
          <div className="flex-1 flex flex-col gap-4">
            
            {/* 1.1 AUDIT PENDING BLOCKING INTERCEPT BANNER (V2.0 REQUIREMENT) */}
            {!isDoctorVerified && (
              <div onClick={() => setShowVerifyModal(true)} className="bg-gradient-to-r from-amber-500 to-rose-600 text-white rounded-2xl p-3 pr-2.5 shadow-md flex items-center justify-between gap-2.5 cursor-pointer hover:brightness-95 animate-pulse shrink-0">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={18} className="text-amber-100 shrink-0" />
                  <div>
                    <h4 className="text-[10.5px] font-black font-display tracking-tight leading-normal">
                      您的医生资质认证正在人工审核中
                    </h4>
                    <p className="text-[8.5px] text-amber-50 leading-tight mt-0.5 font-medium">
                      当前处于【功能演示只读模式】，点击此处一键补充并自助激活！
                    </p>
                  </div>
                </div>
                <span className="text-[9px] bg-white/20 border border-white/30 text-white font-bold px-2 py-0.5 rounded-lg shrink-0">
                  一键激活
                </span>
              </div>
            )}

            {/* 1.2 SIGNED PATIENTS PANEL: PANORAMICAL DASHBOARD (V2.0 REQUIREMENT) */}
            <div className="bg-white rounded-3xl p-3.5 border border-slate-200/80 shadow-sm flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Users size={15} className="text-indigo-600" />
                  <h3 className="text-xs font-bold text-slate-900 font-display">签约患者全景监控大盘</h3>
                </div>
                <span className="text-[8.5px] font-bold text-slate-400 font-mono">
                  共计 {patientsList.length} 人
                </span>
              </div>

              {/* Panoramical patient list cards */}
              <div className="grid grid-cols-3 gap-1.5 mt-1">
                {patientsList.map((pat) => {
                  const isCur = pat.id === selectedPatientId;
                  const todayDone = pat.today_done;

                  return (
                    <button
                      key={pat.id}
                      type="button"
                      onClick={() => setSelectedPatientId(pat.id)}
                      className={`p-2 rounded-xl border text-left transition relative cursor-pointer ${
                        isCur
                          ? 'border-indigo-600 bg-indigo-50/70 shadow-sm ring-1 ring-indigo-300'
                          : 'border-slate-150 bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      {/* State indicator lamp */}
                      <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                        {todayDone ? (
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        ) : (
                          <>
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                          </>
                        )}
                      </span>

                      <span className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200/80 flex items-center justify-center mt-0.5">
                        <User size={16} strokeWidth={2.2} className="text-slate-500" />
                      </span>
                      <h4 className="text-[11px] font-bold text-slate-800 leading-none mt-1">{pat.name}</h4>
                      <p className="text-[8px] text-slate-400 mt-1">
                        依从：<span className="font-bold text-indigo-700">{pat.attendance}%</span>
                      </p>
                      <p className="text-[8px] mt-0.5 text-slate-500 font-mono">
                        <span className={todayDone ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                          {todayDone ? '已康复' : '未理疗'}
                        </span>
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Patient details block dynamically rendered */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/50 mt-1 text-[10px] font-medium text-slate-650 flex flex-col gap-1 leading-tight">
                <div className="flex justify-between items-center pb-1 border-b border-slate-200/50">
                  <span className="font-bold text-slate-900">选中病患：{activePatient.name} （{activePatient.age}岁）</span>
                  <span className="font-mono text-slate-400">{activePatient.phone}</span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-center font-semibold text-slate-500 text-[9px] pt-0.5">
                  <div>软骨磨损: <span className="text-slate-800">{activePatient.wear}级</span></div>
                  <div>关节积液: <span className="text-slate-800">{activePatient.fluid}级</span></div>
                  <div>疼痛(VAS): <span className="text-slate-800">{activePatient.pain}分</span></div>
                </div>
              </div>
            </div>

            {/* 1.3 PRECISION PARAMETERS SETTING AND SENDING Rx */}
            <div className={`bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm flex flex-col gap-3 shrink-0 ${
              !isDoctorVerified ? 'opacity-60 saturate-50' : ''
            }`}>
              <span className="text-[10px] text-indigo-700 font-bold font-display flex items-center gap-1">
                <Settings2 size={13} />
                为「{activePatient.name}」精密设定物理拉伸热处方参数
              </span>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Left Force */}
                <div className="flex flex-col gap-0.5">
                  <label className="text-[8px] text-slate-400 font-bold">左拉伸负荷 (10-40N)</label>
                  <input 
                    type="number" 
                    min={10} 
                    max={40}
                    value={rxForm.left_force}
                    onChange={(e) => setRxForm({ ...rxForm, left_force: parseInt(e.target.value) || 15 })}
                    disabled={!isDoctorVerified}
                    className="px-2 py-1.5 border border-slate-200 rounded-xl font-mono text-center bg-slate-50 font-bold"
                  />
                </div>
                {/* Right Force */}
                <div className="flex flex-col gap-0.5">
                  <label className="text-[8px] text-slate-400 font-bold">右拉伸负荷 (10-40N)</label>
                  <input 
                    type="number" 
                    min={10} 
                    max={40}
                    value={rxForm.right_force}
                    onChange={(e) => setRxForm({ ...rxForm, right_force: parseInt(e.target.value) || 15 })}
                    disabled={!isDoctorVerified}
                    className="px-2 py-1.5 border border-slate-200 rounded-xl font-mono text-center bg-slate-50 font-bold"
                  />
                </div>
                {/* Duration */}
                <div className="flex flex-col gap-0.5">
                  <label className="text-[8px] text-slate-400 font-bold">理疗时长 (5-45分钟)</label>
                  <input 
                    type="number" 
                    min={5} 
                    max={45}
                    value={rxForm.duration}
                    onChange={(e) => setRxForm({ ...rxForm, duration: parseInt(e.target.value) || 15 })}
                    disabled={!isDoctorVerified}
                    className="px-2 py-1.5 border border-slate-200 rounded-xl font-mono text-center bg-slate-50 font-bold"
                  />
                </div>
                {/* Temp */}
                <div className="flex flex-col gap-0.5">
                  <label className="text-[8px] text-slate-400 font-bold">热敷设定 (35-50℃)</label>
                  <input 
                    type="number" 
                    min={35} 
                    max={50}
                    value={rxForm.temp}
                    onChange={(e) => setRxForm({ ...rxForm, temp: parseInt(e.target.value) || 42 })}
                    disabled={!isDoctorVerified}
                    className="px-2 py-1.5 border border-slate-200 rounded-xl font-mono text-center bg-slate-50 font-bold text-red-650"
                  />
                </div>
              </div>

              {/* Vibration mode dropdown */}
              <div className="flex items-center justify-between text-xs font-semibold bg-slate-50 p-2 rounded-xl border border-slate-100">
                <span className="text-[9.5px] text-slate-500">双轴振动波段方案：</span>
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setRxForm({ ...rxForm, vibration: m })}
                      disabled={!isDoctorVerified}
                      className={`px-2 py-0.5 text-[8.5px] font-bold rounded cursor-pointer border ${
                        rxForm.vibration === m
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {m === 0 ? '静态' : m === 1 ? '低揉' : '高震'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Send prescription button */}
              <button
                type="button"
                onClick={handleSendPrescription}
                className="py-2.5 w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Send size={12} fill="white" />
                <span>一键派发处方：数字推流下发至患者端</span>
              </button>

              {rxDispatchedMsg && (
                <span className="text-[8.5px] text-center text-emerald-600 font-black tracking-wide flex items-center justify-center gap-0.5 animate-bounce">
                  <Check size={11} strokeWidth={2.5} />
                  处方已送达患者「{activePatient.name}」
                </span>
              )}
            </div>

            {/* 1.4 CASE DB ENTRY FEEDING */}
            <form onSubmit={handleAddCase} className={`bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm flex flex-col gap-3 mb-2 shrink-0 ${
              !isDoctorVerified ? 'opacity-60 saturate-50' : ''
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Database size={15} className="text-teal-600" />
                  <h3 className="text-xs font-bold text-slate-900 font-display">智能物理治疗经验库喂养 (数据录入)</h3>
                </div>
                <span className="text-[9px] text-slate-450 font-bold font-mono">
                  已喂入 {clinicalCases.length} 单
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-500 font-bold">临床病症标示 (姓名/性别/临床拉力成因描述)</label>
                <input 
                  type="text"
                  required
                  value={newCaseForm.case_name}
                  onChange={(e) => setNewCaseForm({ ...newCaseForm, case_name: e.target.value })}
                  disabled={!isDoctorVerified}
                  placeholder="e.g. 典型陈旧半月板变狭窄伴滑囊积聚"
                  className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium bg-slate-50 focus:bg-white"
                />
              </div>

              {/* Symptoms inputs */}
              <div className="grid grid-cols-4 gap-1.5 text-center text-[9px] font-bold">
                <div className="flex flex-col bg-slate-50 p-1.5 rounded-lg border border-slate-150">
                  <span className="text-slate-400">患者年龄</span>
                  <input 
                    type="number"
                    value={newCaseForm.age}
                    disabled={!isDoctorVerified}
                    onChange={(e) => setNewCaseForm({ ...newCaseForm, age: parseInt(e.target.value) || 60 })}
                    className="w-full text-center text-slate-800 font-mono mt-0.5 bg-transparent"
                  />
                </div>
                <div className="flex flex-col bg-slate-50 p-1.5 rounded-lg border border-slate-150">
                  <span className="text-slate-400">软骨 (1-5)</span>
                  <input 
                    type="number"
                    min={1} max={5}
                    disabled={!isDoctorVerified}
                    value={newCaseForm.cartilage_wear}
                    onChange={(e) => setNewCaseForm({ ...newCaseForm, cartilage_wear: parseInt(e.target.value) || 3 })}
                    className="w-full text-center text-slate-800 font-mono mt-0.5 bg-transparent"
                  />
                </div>
                <div className="flex flex-col bg-slate-50 p-1.5 rounded-lg border border-slate-150">
                  <span className="text-slate-400">积液 (1-5)</span>
                  <input 
                    type="number"
                    min={1} max={5}
                    disabled={!isDoctorVerified}
                    value={newCaseForm.joint_fluid}
                    onChange={(e) => setNewCaseForm({ ...newCaseForm, joint_fluid: parseInt(e.target.value) || 2 })}
                    className="w-full text-center text-slate-800 font-mono mt-0.5 bg-transparent"
                  />
                </div>
                <div className="flex flex-col bg-slate-50 p-1.5 rounded-lg border border-slate-150">
                  <span className="text-slate-400">疼痛(1-10)</span>
                  <input 
                    type="number"
                    min={1} max={10}
                    disabled={!isDoctorVerified}
                    value={newCaseForm.pain_score}
                    onChange={(e) => setNewCaseForm({ ...newCaseForm, pain_score: parseInt(e.target.value) || 5 })}
                    className="w-full text-center text-slate-800 font-mono mt-0.5 bg-transparent"
                  />
                </div>
              </div>

              {/* Treatment parameters */}
              <div className="bg-teal-50/50 p-2.5 rounded-xl border border-teal-100 flex flex-col gap-1.5">
                <span className="text-[8px] text-teal-800 font-bold font-mono">治愈治疗参数配图:</span>
                <div className="grid grid-cols-4 gap-1">
                  <div className="bg-white p-1 rounded-md border border-slate-150 text-center flex flex-col">
                    <span className="text-[7px] text-slate-400">L拉力</span>
                    <input 
                      type="number" value={newCaseForm.left_force}
                      disabled={!isDoctorVerified}
                      onChange={(e) => setNewCaseForm({ ...newCaseForm, left_force: parseInt(e.target.value) || 12 })}
                      className="w-full text-center font-mono font-bold text-teal-800 text-[10.5px] outline-none bg-transparent"
                    />
                  </div>
                  <div className="bg-white p-1 rounded-md border border-slate-150 text-center flex flex-col">
                    <span className="text-[7px] text-slate-400">R拉力</span>
                    <input 
                      type="number" value={newCaseForm.right_force}
                      disabled={!isDoctorVerified}
                      onChange={(e) => setNewCaseForm({ ...newCaseForm, right_force: parseInt(e.target.value) || 12 })}
                      className="w-full text-center font-mono font-bold text-teal-800 text-[10.5px] outline-none bg-transparent"
                    />
                  </div>
                  <div className="bg-white p-1 rounded-md border border-slate-150 text-center flex flex-col">
                    <span className="text-[7px] text-slate-450">时长(分)</span>
                    <input 
                      type="number" value={newCaseForm.duration}
                      disabled={!isDoctorVerified}
                      onChange={(e) => setNewCaseForm({ ...newCaseForm, duration: parseInt(e.target.value) || 20 })}
                      className="w-full text-center font-mono font-bold text-teal-800 text-[10.5px] outline-none bg-transparent"
                    />
                  </div>
                  <div className="bg-white p-1 rounded-md border border-slate-150 text-center flex flex-col">
                    <span className="text-[7px] text-slate-450">恒温(℃)</span>
                    <input 
                      type="number" value={newCaseForm.temp}
                      disabled={!isDoctorVerified}
                      onChange={(e) => setNewCaseForm({ ...newCaseForm, temp: parseInt(e.target.value) || 40 })}
                      className="w-full text-center font-mono font-bold text-red-600 text-[10.5px] outline-none bg-transparent"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-md active:scale-97 transition cursor-pointer flex items-center justify-center gap-1"
              >
                <Plus size={13} />
                <span>录入学者经验库并动态发散推荐</span>
              </button>

              {caseSubmittedMsg && (
                <div className="text-[8.5px] text-teal-700 font-mono font-bold text-center flex items-center justify-center gap-0.5">
                  <Check size={11} strokeWidth={2.5} />
                  该解剖样本已录入数据库，已成功将检索广度刷新同步！
                </div>
              )}
            </form>
          </div>
        )}

        {/* ======================= */}
        {/* TAB 2: DOCTOR ACADEMICS */}
        {/* ======================= */}
        {activeTab === 'research' && (
          <div className="flex-1 flex flex-col gap-4">
            {/* 2.1 SCIENTIFIC DATA SHOWN FOR DISSERTATION */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm flex flex-col gap-2 shrink-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <BarChart3 size={16} className="text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-900 font-display">关节退化磨损拉伸应力对应区间</h3>
              </div>

              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60 flex flex-col gap-2">
                <div className="text-[9px] font-bold text-slate-500 font-display flex items-center justify-between">
                  <span>线性回归统计：软骨重组拉力需求量 N</span>
                  <span className="text-[8px] text-indigo-600">R² = 0.942 (精密度极高)</span>
                </div>
                
                {/* SVG scatter mapping chart */}
                <div className="h-28 relative">
                  <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
                    <line x1="0" y1="10" x2="100" y2="10" stroke="#E2E8F0" strokeWidth="0.3" strokeDasharray="1,1" />
                    <line x1="0" y1="20" x2="100" y2="20" stroke="#E2E8F0" strokeWidth="0.3" strokeDasharray="1,1" />
                    <line x1="0" y1="30" x2="100" y2="30" stroke="#E2E8F0" strokeWidth="0.3" strokeDasharray="1,1" />

                    <polygon points="10,38 90,8 90,14 10,42" fill="rgba(79, 70, 229, 0.08)" />
                    <line x1="10" y1="40" x2="90" y2="11" stroke="#4F46E5" strokeWidth="1" strokeDasharray="2,2" />

                    <circle cx="15" cy="38" r="1.5" fill="#4F46E5" />
                    <circle cx="30" cy="33" r="1.5" fill="#14B8A6" />
                    <circle cx="45" cy="27" r="1.5" fill="#4F46E5" />
                    <circle cx="58" cy="22" r="1.5" fill="#4F46E5" />
                    <circle cx="70" cy="18" r="1.5" fill="#14B8A6" />
                    <circle cx="85" cy="10" r="1.5" fill="#4F46E5" />
                  </svg>
                  
                  <div className="flex justify-between text-[7px] text-slate-400 font-mono mt-1 px-1">
                    <span>软骨1级(轻微)</span>
                    <span>软骨3级(狭窄)</span>
                    <span>软骨5级(剥脱)</span>
                  </div>
                </div>

                <p className="text-[8px] text-slate-400 leading-normal leading-tight italic">
                  * 临床机理指明：随着关节边缘骨刺增生与磨损（1级变至5级），拉伸推杆所需的反向牵引力呈阶梯型抗阻攀升，需要精密的AI欧氏间接插补。
                </p>
              </div>
            </div>

            {/* 2.2 TREATMENT RECOVERY STATISTIC COMPASS */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm flex flex-col gap-2">
              <h3 className="text-xs font-bold text-slate-900 font-display mb-1 flex items-center gap-1.5">
                <Activity size={16} className="text-teal-600 animate-pulse" /> 患者主观疼痛VAS减低对比统计
              </h3>

              <div className="grid grid-cols-2 gap-2 text-xs font-medium">
                <div className="bg-amber-50/50 border border-amber-100 p-2.5 rounded-2xl text-center">
                  <span className="text-[8.5px] text-amber-800 font-bold block mb-1">居家打卡满勤组 (N=42)</span>
                  <strong className="text-xl font-display font-bold text-amber-700">-64.2%</strong>
                  <span className="text-[7.5px] text-slate-400 block mt-0.5 leading-none">滑膜抗阻积液疼痛极速减缓</span>
                </div>
                <div className="bg-slate-100 border border-slate-250 p-2.5 rounded-2xl text-center">
                  <span className="text-[8.5px] text-slate-600 font-bold block mb-1">自由断续训练组 (N=42)</span>
                  <strong className="text-xl font-display font-medium text-slate-700">-21.8%</strong>
                  <span className="text-[7.5px] text-slate-400 block mt-0.5 leading-none">因间断性依从低康复滞后</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================= */}
        {/* TAB 3: DOCTOR IDENTITY */}
        {/* ======================= */}
        {activeTab === 'license' && (
          <div className="flex-1 bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm flex flex-col gap-4">
            
            {/* Professional doctor ID badge card */}
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl p-4 text-white shadow-md flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 translate-y-1 translate-x-2 text-white/5 font-display font-black text-6xl select-none leading-none">
                M.D.
              </div>
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 bg-white rounded-full flex items-center justify-center shadow-inner">
                  <Stethoscope size={22} strokeWidth={2.2} className="text-indigo-700" />
                </span>
                <div>
                  <h3 className="text-sm font-bold font-display">{doctorName}</h3>
                  <span className="text-[9px] tracking-wider text-indigo-200 font-bold uppercase block mt-0.5">
                    膝关节骨关节病居家物理治疗国家数据库
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/20 grid grid-cols-2 gap-2 text-[10px] text-indigo-200">
                <div>
                  认证科室：<strong>{isDoctorVerified ? verifyDept : '信息登记待完善'}</strong>
                </div>
                <div>
                  双证状态：
                  {isDoctorVerified ? (
                    <strong className="text-emerald-300 inline-flex items-center gap-0.5">
                      <Check size={11} strokeWidth={2.5} /> 已认证(特级下发权)
                    </strong>
                  ) : (
                    <strong className="text-amber-300 inline-flex items-center gap-0.5">
                      <AlertTriangle size={11} strokeWidth={2.2} /> 暂为演示只读模式
                    </strong>
                  )}
                </div>
              </div>
            </div>

            {/* Verification Checklist Detail */}
            <div className="border border-slate-150 p-3 rounded-2xl bg-slate-50 flex flex-col gap-2.5 text-xs text-slate-700 font-medium">
              <h4 className="font-bold text-slate-950 font-display">注册资质登记信息：</h4>
              <ul className="list-disc list-inside space-y-1 text-[10.5px]">
                <li>医师注册登记号：<span className="font-mono text-slate-900 font-bold">{isDoctorVerified ? verifyLicenseId : '未登载'}</span></li>
                <li>所属临床部门：<span className="text-slate-900 font-bold">{isDoctorVerified ? verifyDept : '未登载'}</span></li>
                <li className="flex items-center gap-1 flex-wrap">
                  电子执业印章/执业证：
                  <span className="text-slate-900 inline-flex items-center gap-0.5">
                    {isDoctorVerified ? (
                      <>
                        <Check size={11} strokeWidth={2.5} className="text-emerald-600" />
                        已归档校验合格
                      </>
                    ) : (
                      '未挂钩'
                    )}
                  </span>
                </li>
              </ul>
              {!isDoctorVerified && (
                <button
                  type="button"
                  onClick={() => setShowVerifyModal(true)}
                  className="mt-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer text-center"
                >
                  补充医师资格并全权激活
                </button>
              )}
            </div>

            {/* Logout button */}
            {onLogout && (
              <div className="mt-auto shrink-0 pb-1">
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 active:scale-95 transition text-[11px] font-bold text-slate-700 rounded-2xl border border-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut size={14} strokeWidth={2.2} />
                  安全退出主任医生网络大盘
                </button>
              </div>
            )}
          </div>
        )}
      </div></div>

      {/* Fixed bottom tab bar — stays visible while content scrolls */}
      <div
        className="pointer-events-none fixed bottom-0 left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="pointer-events-auto mx-4 grid h-[62px] grid-cols-3 items-center justify-center gap-1 rounded-full border border-slate-200/60 bg-white/95 px-3 shadow-lg shadow-indigo-100/30 backdrop-blur-md">
        <button
          onClick={() => setActiveTab('workbench')}
          className={`h-11 rounded-full text-[10px] font-bold font-display flex flex-col items-center justify-center gap-0.5 transition-all duration-200 cursor-pointer ${
            activeTab === 'workbench'
              ? 'text-indigo-600 bg-indigo-50/50'
              : 'text-slate-400 hover:text-slate-655'
          }`}
        >
          <Database size={18} className={activeTab === 'workbench' ? 'scale-105 stroke-[2.25]' : 'stroke-1.5'} />
          <span>工作台</span>
        </button>
        <button
          onClick={() => setActiveTab('research')}
          className={`h-11 rounded-full text-[10px] font-bold font-display flex flex-col items-center justify-center gap-0.5 transition-all duration-200 cursor-pointer ${
            activeTab === 'research'
              ? 'text-indigo-600 bg-indigo-50/50'
              : 'text-slate-400 hover:text-slate-655'
          }`}
        >
          <BookOpen size={18} className={activeTab === 'research' ? 'scale-105 stroke-[2.25]' : 'stroke-1.5'} />
          <span>学术研究</span>
        </button>
        <button
          onClick={() => setActiveTab('license')}
          className={`h-11 rounded-full text-[10px] font-bold font-display flex flex-col items-center justify-center gap-0.5 transition-all duration-200 cursor-pointer ${
            activeTab === 'license'
              ? 'text-indigo-600 bg-indigo-50/50'
              : 'text-slate-400 hover:text-slate-655'
          }`}
        >
          <UserCheck size={18} className={activeTab === 'license' ? 'scale-105 stroke-[2.25]' : 'stroke-1.5'} />
          <span>数字资质</span>
        </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* SEAMLESS DIGITAL QUALIFICATION DOUBLE ACTIVATE MODAL BOX */}
      {/* ======================================================== */}
      {showVerifyModal && (
        <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md rounded-[38px] z-50 flex flex-col p-5 justify-between text-white animate-in zoom-in-95 duration-200 select-none">
          <div className="flex flex-col gap-1 text-center mt-3">
            <h3 className="text-sm font-black font-display text-slate-100 leading-none">
              国家执业医师资质上传与实名激活
            </h3>
            <p className="text-[9px] text-zinc-400 mt-1 uppercase tracking-wider font-bold">
              KneeJoy 资质核验中枢
            </p>
          </div>

          <form onSubmit={handleVerifySubmit} className="flex-1 flex flex-col justify-center gap-3.5 my-4 text-xs font-medium">
            {/* Dept field */}
            <div className="flex flex-col gap-1.5 bg-zinc-900 border border-zinc-800 p-2.5 rounded-xl">
              <span className="text-[10px] text-zinc-300">1. 执业科室所属 (医院病历核对签发口):</span>
              <select
                value={verifyDept}
                onChange={(e) => setVerifyDept(e.target.value)}
                className="bg-black text-white border border-zinc-700 py-1.5 px-2 rounded-lg text-xs"
              >
                <option value="骨科康复科">骨科康复科</option>
                <option value="关节运动科">关节运动科</option>
                <option value="关节功能维护科">关节功能维护科</option>
                <option value="居家针灸牵引阻抗科">居家针灸牵引阻抗科</option>
              </select>
            </div>

            {/* License Code field */}
            <div className="flex flex-col gap-1.5 bg-zinc-900 border border-zinc-800 p-2.5 rounded-xl">
              <span className="text-[10px] text-zinc-300">2. 医师执业代号/编号 (双证登记查实):</span>
              <input
                type="text"
                required
                value={verifyLicenseId}
                onChange={(e) => setVerifyLicenseId(e.target.value)}
                placeholder="请输入执业医师执照编号 (11位或编号)"
                className="bg-black text-white border border-zinc-700 py-1.5 px-2.5 rounded-lg text-xs font-mono tracking-widest text-center"
              />
            </div>

            {/* File Upload mock component */}
            <div className="flex flex-col gap-1.5 bg-zinc-905 border border-dashed border-zinc-800 p-3 rounded-xl items-center text-center justify-center">
              <UploadCloud size={24} className="text-indigo-400 animate-bounce" />
              <input 
                type="file" 
                id="docFileVerify"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setVerifyUploadName(e.target.files[0].name);
                  } else {
                    setVerifyUploadName('certificate_scan_verified.jpg');
                  }
                }}
              />
              <label 
                htmlFor="docFileVerify"
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-[9.5px] text-indigo-300 font-bold cursor-pointer"
              >
                {verifyUploadName ? `已选择: ${verifyUploadName}` : '点击模拟上传执业医师资格证扫描件'}
              </label>
              <p className="text-[8px] text-zinc-500 mt-0.5">支持 PNG, JPG。符合信息系统防篡改规约。</p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowVerifyModal(false)}
                className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-[10.5px] font-bold cursor-pointer"
              >
                暂不激活 (演示只读)
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl text-[10.5px] font-bold cursor-pointer"
              >
                验证并确认激活
              </button>
            </div>
          </form>

          <p className="text-[7.5px] text-zinc-500 text-center leading-normal px-2 shrink-0">
            医疗资质由博爱医疗系统数据库联合验证，假冒他人执照须依法承担相关伦理及法律侵权责任。
          </p>
        </div>
      )}

    </div>
  );
}
