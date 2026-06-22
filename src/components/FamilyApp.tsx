import React, { useState, useEffect } from 'react';
import { 
  Heart, ShieldAlert, BellRing, BookOpen, Settings, AlertTriangle, 
  CheckCircle2, Flame, UserCheck, HelpCircle, Sparkles, PhoneCall,
  Camera, CheckCircle, Search, HelpCircle as HelpIcon, ArrowRight,
  RefreshCw, User, Zap, ShoppingBag, LogOut, Building2, Check, Activity,
} from 'lucide-react';
import { HardwareState, PatientProfile } from '../types';
import AppNavBar, { AppNavRoleBadge, AppNavStatusBadge } from './AppNavBar';

interface FamilyAppProps {
  hardwareState: HardwareState;
  patientProfile: PatientProfile;
  checkInDates: string[];
  weeklyRate?: number;
  hardwareAlert?: string | null;
  onClearHardwareAlert?: () => void;
  preLinked?: boolean;
  onTriggerNudge: (message: string) => void;
  onSendHardwareAction: (commandLog: string) => void;
  onBindByPhone?: (phone: string) => Promise<boolean>;
  onBindByQr?: (token: string) => Promise<boolean>;
  onLogout?: () => void;
}

export default function FamilyApp({
  hardwareState,
  patientProfile,
  checkInDates,
  weeklyRate = 0,
  hardwareAlert,
  onClearHardwareAlert,
  preLinked = false,
  onTriggerNudge,
  onSendHardwareAction,
  onBindByPhone,
  onBindByQr,
  onLogout,
}: FamilyAppProps) {
  // Navigation
  const [activeTab, setActiveTab] = useState<'guardian' | 'library' | 'settings'>('guardian');

  // Input state for custom nudges
  const [nudgeMsg, setNudgeMsg] = useState('爸妈，天气转温啦，今天记得戴上理疗护膝做20分钟智能拉伸牵引哈！');
  const [nudgeSentMsg, setNudgeSentMsg] = useState(false);

  // Newcomer Binding Wizard states (V2.0 Requirement)
  const [isFamilyLinked, setIsFamilyLinked] = useState<boolean>(preLinked);
  const [bindPhone, setBindPhone] = useState<string>('186-1234-5678');
  const [bindMethod, setBindMethod] = useState<'phone' | 'qr'>('phone');
  const [isQrScanning, setIsQrScanning] = useState<boolean>(false);

  useEffect(() => {
    if (preLinked) setIsFamilyLinked(true);
  }, [preLinked]);

  const boundPatientName = patientProfile.name?.trim() || '守护对象';

  // Template helpers
  const handleTemplateClick = (text: string) => {
    setNudgeMsg(text);
  };

  const handleSendNudge = () => {
    onTriggerNudge(nudgeMsg);
    onSendHardwareAction(`[家人守护催促] 家属端触发了一键远程关怀，提示短信与APP浮窗已被安全发送至患者手机系统中。内容：'${nudgeMsg}'`);
    setNudgeSentMsg(true);
    setTimeout(() => {
      setNudgeSentMsg(false);
    }, 4000);
  };

  const handleBindConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onBindByPhone) {
      const ok = await onBindByPhone(bindPhone);
      if (!ok) {
        alert('绑定失败，请确认患者手机号是否正确，且后端服务已启动。');
        return;
      }
    }
    setIsFamilyLinked(true);
    onSendHardwareAction(`[配对关联建立] 家属端成功核验了配质/患者手机号「${bindPhone}」。三端连通率已达100%，已同步获知患者历史打卡频度。`);
    alert(`远程随护关怀建立成功！现在起您在异地可随时关注绑定人的物理治疗数据。`);
  };

  const simulateQrScan = () => {
    setIsQrScanning(true);
    setTimeout(async () => {
      if (onBindByQr) {
        const ok = await onBindByQr('demo_qr_token');
        if (!ok) {
          setIsQrScanning(false);
          alert('扫码绑定失败：请先在患者端设置页生成绑定 QR。');
          return;
        }
      }
      setIsQrScanning(false);
      setIsFamilyLinked(true);
      onSendHardwareAction(`[扫码绑定成功] 家属端通过模拟相机成功锁定了患者App里面的亲友认证绑定QR条码，完成了极速安全握手！`);
      alert(`扫码成功！您已成功和绑定人 [${boundPatientName}] 建立远程关怀监护。`);
    }, 1500);
  };

  return (
    <div className="flex-1 flex flex-col h-full select-none text-slate-800 relative bg-slate-50">

      {hardwareAlert && isFamilyLinked && (
        <div className="absolute top-0 left-0 right-0 z-[60] bg-red-600 text-white p-3 shadow-lg animate-pulse">
          <div className="flex justify-between items-start gap-2">
            <p className="text-[11px] font-bold leading-snug">{hardwareAlert}</p>
            <button
              type="button"
              onClick={onClearHardwareAlert}
              className="text-white/80 text-xs font-bold shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      
      {isFamilyLinked && (
        <AppNavBar
          title={
            activeTab === 'guardian'
              ? '家属随护关怀中心'
              : activeTab === 'library'
                ? '预防退化科普大讲堂'
                : '多设备远程管理'
          }
          left={<AppNavRoleBadge tone="pink">家属端</AppNavRoleBadge>}
          right={
            <AppNavStatusBadge
              label="LINKED"
              dotClass="bg-pink-500"
              pingClass="bg-pink-400"
            />
          }
        />
      )}
      
      {/* ======================================================== */}
      {/* MULTI-CHANNEL FAMILY COLD START BINDING WIZARD OVERLAY */}
      {/* ======================================================== */}
      {!isFamilyLinked && (
        <div
          className="fixed inset-0 z-[70] mx-auto flex max-w-[480px] flex-col bg-slate-950/98 p-5 text-white backdrop-blur-md animate-in fade-in duration-300 select-none justify-between"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex flex-col items-center text-center mt-3 shrink-0">
            <div className="p-2.5 bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl shadow-lg flex items-center justify-center animate-bounce mb-2">
              <Heart size={20} className="text-white fill-pink-250" />
            </div>
            <h3 className="text-sm font-black font-display tracking-tight text-white leading-none">
              开启家属随远端看护通道
            </h3>
            <p className="text-[9px] text-zinc-400 mt-1 uppercase tracking-wider font-bold">
              KneeJoy 亲情关联与看护建立中
            </p>
          </div>

          <div className="flex-1 my-3 flex flex-col justify-center">
            {/* Split Switch for Binding Way */}
            <div className="grid grid-cols-2 bg-zinc-900 border border-zinc-800 p-0.5 rounded-xl mb-4 text-center text-[10px]">
              <button
                type="button"
                onClick={() => setBindMethod('phone')}
                className={`py-1 rounded-lg font-bold transition cursor-pointer ${
                  bindMethod === 'phone' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                手机号码快捷关联
              </button>
              <button
                type="button"
                onClick={() => setBindMethod('qr')}
                className={`py-1 rounded-lg font-bold transition cursor-pointer ${
                  bindMethod === 'qr' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                扫码配对绑定
              </button>
            </div>

            {/* CHANNEL A: CELLULAR ASSOCIATED */}
            {bindMethod === 'phone' && (
              <form onSubmit={handleBindConfirm} className="flex flex-col gap-3.5 bg-zinc-900 border border-zinc-800 p-4 rounded-2xl animate-in slide-in-from-right duration-200">
                <span className="text-xs font-bold text-pink-300 font-display">输入绑定人的预留手机号</span>
                
                <div className="flex flex-col gap-1">
                  <label className="text-[8.5px] text-zinc-450 uppercase tracking-widest font-bold">
                    绑定人手机号
                  </label>
                  <input
                    type="text"
                    value={bindPhone}
                    onChange={(e) => setBindPhone(e.target.value)}
                    className="w-full bg-black text-center text-white py-1.5 border border-zinc-700 rounded-lg text-xs font-mono font-bold"
                    placeholder="请输入患者登录用的手机号"
                    required
                  />
                </div>

                <p className="text-[8.5px] text-zinc-450 leading-tight">
                  提示：绑定人正在使用 KneeJoy 患者端，请输入其注册的手机帐号以进行配对连接。
                </p>

                <button
                  type="submit"
                  className="py-2.5 bg-pink-500 hover:bg-pink-600 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition flex items-center justify-center gap-1"
                >
                  <span>一键云配对建立连接</span>
                  <ArrowRight size={12} />
                </button>
              </form>
            )}

            {/* CHANNEL B: DIRECT SCANNING QR FRAME */}
            {bindMethod === 'qr' && (
              <div className="flex flex-col gap-3 bg-zinc-900 border border-zinc-800 p-4 rounded-2xl animate-in slide-in-from-left duration-200 text-center items-center">
                <span className="text-xs font-bold text-emerald-300 font-display self-start">扫码极速物理识别</span>
                
                {/* Scanner viewfinder with moving laser line */}
                <div className="relative w-32 h-32 border-2 border-dashed border-emerald-500 rounded-xl bg-black flex items-center justify-center overflow-hidden my-1">
                  {isQrScanning ? (
                    <>
                      <span className="absolute inset-x-0 h-0.5 bg-emerald-400 animate-bounce top-0"></span>
                      <RefreshCw size={24} className="text-emerald-500 animate-spin" />
                    </>
                  ) : (
                    <Camera size={32} className="text-emerald-500/75" />
                  )}
                </div>

                <p className="text-[8.5px] text-zinc-400 leading-tight max-w-xs pl-2 pr-2">
                  请点击按钮，模拟相机扫描患者App【物理设备与参数设定】页面展示的亲友绑定QR条码进行绑定。
                </p>

                <button
                  type="button"
                  onClick={simulateQrScan}
                  disabled={isQrScanning}
                  className="py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition w-full"
                >
                  {isQrScanning ? '正在扫描核实...' : '模拟摄像头扫码识别'}
                </button>
              </div>
            )}
          </div>

          <div className="text-[7.5px] text-zinc-500 text-center leading-normal mb-2 shrink-0">
            健康声明：KneeJoy 重在物理辅助与并力舒缓，家属的温馨关怀将极大降低自我锻炼拖延。
          </div>
        </div>
      )}

      {/* Scrollable Container covering body, padded for fixed tab bar */}
      {isFamilyLinked && (
      <div
        className="flex-1 overflow-y-auto px-4 pt-3 flex flex-col gap-4"
        style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
      >

      {/* 2. BODY CONTAINER FOR SUBVIEWS */}
      <div className="flex-1 flex flex-col gap-4">
        {/* ================================== */}
        {/* TAB 1: REMOTE GUARDIAN OVERSIGHT */}
        {/* ================================== */}
        {activeTab === 'guardian' && (
          <div className="flex-1 flex flex-col gap-3.5">
            
            {/* 1.0b HIGH FLASHING CRISIS INTERVENTION BOARD / EMERGENCY CENTER (V2.0 REQUIREMENT) */}
            {!hardwareState.is_safety_clip_attached && (
              <div className="bg-gradient-to-r from-red-650 to-rose-700 text-white p-3.5 rounded-2xl flex flex-col gap-2 shadow-md border border-red-500 animate-pulse shrink-0">
                <div className="flex gap-2 items-start">
                  <ShieldAlert size={20} className="text-white shrink-0 mt-0.5 animate-bounce" />
                  <div>
                    <h4 className="text-[11px] font-black font-display tracking-tight text-white leading-normal">
                      红色特级 CRISIS 危机响应警报中
                    </h4>
                    <p className="text-[9px] text-red-50 leading-tight font-medium mt-0.5">
                      绑定人 [{boundPatientName}] 膝部理疗仪防夹空载保护脱落，设备已进入【自动紧急放气降压物理锁闭】！
                    </p>
                  </div>
                </div>
                {/* Crisis Call Operators */}
                <div className="grid grid-cols-2 gap-1.5 mt-1">
                  <button
                    type="button"
                    onClick={() => alert(`拨通紧急电话：138-1234-5532...已提醒${boundPatientName}扣合锁定`)}
                    className="py-1 bg-white hover:bg-zinc-100 text-red-700 text-[8.5px] font-black rounded-lg cursor-pointer flex items-center justify-center gap-1"
                  >
                    <PhoneCall size={11} strokeWidth={2.2} />
                    紧急直拨绑定人
                  </button>
                  <button
                    type="button"
                    onClick={() => alert('正在呼叫博爱医院骨科关节中心值班团队: 400-080-9988')}
                    className="py-1 bg-red-800 hover:bg-red-900 border border-red-600 text-white text-[8.5px] font-black rounded-lg cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Building2 size={11} strokeWidth={2.2} />
                    连线博爱值班台
                  </button>
                </div>
              </div>
            )}

            {hardwareState.estop && (
              <div className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-3.5 flex gap-2.5 shrink-0">
                <ShieldAlert size={18} className="text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[11px] font-black text-rose-900">
                    {hardwareState.sw_estop ? '设备软件急停中' : '设备硬件急停中'}
                  </h4>
                  <p className="text-[9px] text-rose-800 mt-0.5 leading-relaxed">
                    绑定人 [{boundPatientName}] 的理疗仪已停止运行，请确认其安全并协助恢复。
                  </p>
                </div>
              </div>
            )}

            {/* 1.1 LIVE THERAPY DOCKING WINDOW: DE-JARGONIZED */}
            <div className="bg-white rounded-3xl p-4 border border-slate-205 shadow-sm flex flex-col gap-3 shrink-0">
              <h3 className="text-xs font-bold text-slate-900 font-display flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${hardwareState.is_running ? 'bg-rose-500 animate-pulse' : 'bg-slate-400'}`}></span>
                在线随护治疗状态看板
              </h3>

              {/* Connected Telemetry indicators de-jargonized */}
              {hardwareState.is_running ? (
                <div className="bg-gradient-to-br from-indigo-950 to-indigo-900 text-white p-3.5 rounded-2xl flex flex-col gap-2 border border-indigo-500/10 shadow-md">
                  <div className="flex justify-between items-center text-[9.5px]">
                    <span className="text-indigo-300 font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping"></span>
                      绑定人 [{boundPatientName}] 正在进行康复理疗
                    </span>
                    <span className="text-zinc-300 font-mono">剩余 {Math.floor(hardwareState.time_left_seconds / 60)}分钟</span>
                  </div>
                  
                  {/* Real-time parameters rendering */}
                  <div className="mt-1 flex items-center justify-between bg-white/5 p-2 rounded-xl border border-white/5">
                    <div className="text-center flex-1">
                      <span className="text-[7.5px] text-zinc-400 block uppercase font-bold">气动阻应拉力</span>
                      <strong className="text-xs font-mono font-bold text-indigo-300">{hardwareState.left_force}N / {hardwareState.right_force}N</strong>
                    </div>
                    <div className="text-center border-l border-white/10 px-3 flex-1">
                      <span className="text-[7.5px] text-zinc-400 block uppercase font-bold">双模恒热度</span>
                      <strong className="text-xs font-mono font-bold text-red-300 flex items-center justify-center gap-0.5">{hardwareState.temp}℃ <Flame size={10} className="fill-red-400 text-red-400 animate-pulse" /></strong>
                    </div>
                    <div className="text-center border-l border-white/10 pl-3 flex-1">
                      <span className="text-[7.5px] text-zinc-400 block uppercase font-bold">治疗耗能</span>
                      <strong className="text-xs font-mono font-bold text-cyan-300">88%</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200/60 p-3.5 rounded-2xl flex items-center justify-between text-xs font-medium text-slate-500">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-indigo-600" />
                    <div>
                      <h4 className="text-[11px] font-bold text-slate-705">守护对象目前处于舒缓待机中</h4>
                      <p className="text-[9px] text-slate-400 mt-0.5 font-mono">上次理疗：今日 5月31日 博爱医学方案</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold font-mono text-indigo-500">已连机</span>
                </div>
              )}
            </div>

            {/* 1.2 BCW INTERACTION FORM: ONE-CLICK NUDGE WITH INTERACTIVE LABELS (V2.0 REQUIREMENT) */}
            <div className="bg-white rounded-3xl p-4 border border-slate-205 shadow-sm flex flex-col gap-3 shrink-0">
              <div className="flex items-center gap-1.5 shrink-0">
                <BellRing size={16} className="text-pink-500" />
                <h3 className="text-xs font-bold text-slate-900 font-display">守护对象依从性温情督促中枢</h3>
              </div>
              
              <div className="text-xs font-medium flex flex-col gap-1.5 shrink-0">
                <span className="text-[10px] text-slate-500 font-semibold mb-0.5">守护对象本月康复趋势：本月累计理疗打卡 {checkInDates.length} 次</span>
                
                {/* Visual bar chart representing Parental adherence */}
                <div className="bg-slate-50 border border-slate-150 p-2.5 rounded-2xl flex justify-between items-end gap-1.5 h-12">
                  {[
                    { label: "第一周", value: 30, active: false },
                    { label: "第二周", value: 50, active: false },
                    { label: "第三周", value: 85, active: false },
                    { label: "本周依从", value: weeklyRate || Math.min(100, checkInDates.length * 15), active: true }
                  ].map((week, wIdx) => {
                    const cappedVal = Math.min(100, week.value);
                    return (
                      <div key={wIdx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                        <div className="w-full relative bg-slate-200 rounded-full h-6 overflow-hidden flex flex-col justify-end">
                          <div 
                            className={`w-full rounded-t-full transition-all duration-500 ${
                              week.active ? 'bg-gradient-to-t from-pink-500 to-rose-500 shadow-sm' : 'bg-slate-450'
                            }`}
                            style={{ height: `${cappedVal}%` }}
                          />
                        </div>
                        <span className="text-[7px] font-bold font-display text-slate-450 leading-none">{week.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Compose Message box — 固定底部反馈区高度，避免发送后卡片跳动 */}
              <div className="flex flex-col gap-2 border border-pink-100 p-3 bg-pink-50/20 rounded-2xl shrink-0">
                <label className="text-[9.5px] text-pink-800 font-black font-display">向守护对象发送专属督促提醒:</label>
                <textarea
                  value={nudgeMsg}
                  onChange={(e) => setNudgeMsg(e.target.value)}
                  className="p-2 border border-pink-100 rounded-xl text-xs bg-white focus:outline-pink-400 h-14 resize-none font-medium text-slate-700"
                />

                {/* Instant Quick Templates */}
                <span className="text-[8px] text-slate-400 font-bold block mb-0.5">一键引入温情督促词：</span>
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {[
                    "妈，听说变天降温了，快点戴上气动护膝理疗一下膝关节！",
                    "今日份居家理疗还没打卡扣底哟，抓紧时间练一下啦",
                    "医生刚才更新了适合咱们的力值，我帮你看了参数啦"
                  ].map((temp, tid) => (
                    <button
                      key={tid}
                      type="button"
                      onClick={() => handleTemplateClick(temp)}
                      className="px-2 py-0.5 bg-white border border-slate-200 hover:border-pink-300 rounded-lg text-[8px] text-slate-500 cursor-pointer text-nowrap"
                    >
                      {temp.substring(0, 12)}...
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleSendNudge}
                  disabled={nudgeSentMsg}
                  className="py-2.5 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-750 disabled:from-pink-400 disabled:to-rose-500 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition flex items-center justify-center gap-1 shrink-0"
                >
                  <BellRing size={13} fill="white" />
                  <span>{nudgeSentMsg ? '已发送' : '一键发射：极速推流关怀消息'}</span>
                </button>

                <p
                  className={`text-[8.5px] font-black text-center min-h-[18px] leading-snug shrink-0 transition-colors duration-300 flex items-center justify-center gap-0.5 ${
                    nudgeSentMsg ? 'text-emerald-700' : 'text-transparent'
                  }`}
                  aria-live="polite"
                >
                  {nudgeSentMsg && <Check size={11} strokeWidth={2.5} className="shrink-0" />}
                  关怀提醒已送达！康复方案已同步至患者理疗端。
                </p>
              </div>
            </div>

          </div>
        )}

        {/* ================================== */}
        {/* TAB 2: HEALTH CLINIC LECTURES LIBRARY */}
        {/* ================================== */}
        {activeTab === 'library' && (
          <div className="flex-1 flex flex-col gap-3 font-medium text-xs">
            
            {/* Introductory search card */}
            <div className="bg-white rounded-3xl p-4 border border-slate-205 shadow-sm flex flex-col gap-2 shrink-0">
              <h3 className="text-xs font-bold text-slate-900 font-display flex items-center gap-1.5">
                <BookOpen size={16} className="text-pink-600" />
                <span>膝关节保暖护理精炼课</span>
              </h3>

              <div className="border border-slate-100 rounded-2xl overflow-hidden mt-1">
                {[
                  {
                    title: "一：居家气囊推撑应力在骨科的机理",
                    desc: "当患者发生VAS六痛级酸楚时，物理双推拉向充气，拓宽狭窄的软骨层缝隙，让肿胀的滑囊组织获得高契合释压气室。",
                    tag: "等长物理拉伸"
                  },
                  {
                    title: "二：为何膝部理疗应避免过度热敷过载50℃？",
                    desc: "由于膝部不适容易发生渗水。恒定温度保持在38℃~48℃，配合科学无极震动，最有利于膝部的舒缓收敛。",
                    tag: "膝腔温热养护"
                  }
                ].map((art, aId) => (
                  <div key={aId} className="p-3 border-b border-slate-100 last:border-b-0 bg-slate-50 hover:bg-white transition cursor-pointer">
                    <div className="flex justify-between items-center mb-1">
                      <strong className="text-slate-900 font-bold block">{art.title}</strong>
                      <span className="text-[7.5px] bg-pink-100 text-pink-700 px-1 rounded-sm font-bold font-mono uppercase">{art.tag}</span>
                    </div>
                    <p className="text-[9.5px] text-slate-500 leading-normal leading-tight">{art.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Marketplace protective gear for joints */}
            <div className="bg-white rounded-3xl p-4 border border-slate-205 shadow-sm flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-slate-900 font-display flex items-center gap-1.5 mb-1 text-pink-600">
                <ShoppingBag size={14} strokeWidth={2.2} />
                膝部高科技耗材料代购及代买
              </h3>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 border border-slate-200 p-2 text-center rounded-xl flex flex-col items-center gap-1">
                  <Zap size={22} strokeWidth={2.2} className="text-pink-500" />
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-800">特制无极微循环电热耗片</h4>
                    <span className="text-[8px] text-slate-400 block mt-0.5">3片专装（防烫透气）</span>
                  </div>
                  <button className="px-2 py-0.5 bg-pink-500 text-white rounded text-[8.5px] font-bold cursor-pointer transition active:scale-95">代购一件 (¥49)</button>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-2 text-center rounded-xl flex flex-col items-center gap-1">
                  <Activity size={22} strokeWidth={2.2} className="text-pink-500" />
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-805">等拉力防夹物理保压筒</h4>
                    <span className="text-[8px] text-slate-400 block mt-0.5">髌股力学受用款</span>
                  </div>
                  <button className="px-2 py-0.5 bg-pink-500 text-white rounded text-[8.5px] font-bold cursor-pointer transition active:scale-95">代购一件 (¥129)</button>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ================================== */}
        {/* TAB 3: Guardian SETTINGS MANAGER */}
        {/* ================================== */}
        {activeTab === 'settings' && (
          <div className="flex-1 bg-white rounded-3xl p-3.5 border border-slate-205 shadow-sm flex flex-col gap-4 text-xs font-medium">
            
            {/* Multi device management de-jargonized */}
            <div className="flex flex-col gap-2">
              <span className="text-[9px] text-slate-400 font-bold block mb-1 uppercase tracking-wider">配对中的连网设备端:</span>
              
              <div className="p-3 bg-pink-50 border border-pink-200 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-9 h-9 rounded-xl bg-pink-100 flex items-center justify-center shrink-0">
                    <User size={18} strokeWidth={2.2} className="text-pink-600" />
                  </span>
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-800">绑定人 [{boundPatientName}] 的设备</h4>
                    <span className="text-[8px] text-pink-700 bg-pink-100 font-bold px-1.5 rounded-sm block mt-0.5 text-nowrap">远程连接监测中</span>
                  </div>
                </div>
                <span className="text-[9px] font-bold text-pink-600 font-mono animate-pulse">正在连线上</span>
              </div>
            </div>

            {/* Emergency crisis config */}
            <div className="border border-rose-100 bg-rose-50/50 rounded-2xl p-3 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-rose-800">
                <PhoneCall size={15} />
                <h4 className="text-xs font-bold">物理安全防护热线设置:</h4>
              </div>
              <p className="text-[9px] text-slate-500 leading-normal leading-tight">
                当患者独立在家进行牵引理疗时，如因压力不适产生应急反应，轻按一键泄压安全阀，家属端瞬间将收到声光提示！
              </p>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  defaultValue="138-1234-5532"
                  className="p-1 px-2 border border-slate-250 text-xs rounded-lg font-mono bg-white flex-1 text-slate-800"
                />
                <button className="px-3 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded-lg cursor-pointer">
                  保存更新
                </button>
              </div>
            </div>

            {/* Logout button */}
            {onLogout && (
              <div className="mt-auto shrink-0 animate-none">
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 active:scale-95 transition text-[11px] font-bold text-slate-700 rounded-2xl border border-slate-250 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut size={14} strokeWidth={2.2} />
                  安全退出该账号
                </button>
              </div>
            )}

          </div>
        )}
      </div></div>
      )}

      {/* Fixed bottom tab bar — stays visible while content scrolls */}
      {isFamilyLinked && (
      <div
        className="pointer-events-none fixed bottom-0 left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="pointer-events-auto mx-4 grid h-[62px] grid-cols-3 items-center justify-center gap-1 rounded-full border border-slate-200/60 bg-white/95 px-3 shadow-lg shadow-pink-100/30 backdrop-blur-md">
        <button
          onClick={() => setActiveTab('guardian')}
          className={`h-11 rounded-full text-[10px] font-bold font-display flex flex-col items-center justify-center gap-0.5 transition-all duration-200 cursor-pointer ${
            activeTab === 'guardian'
              ? 'text-pink-650 bg-pink-50/50'
              : 'text-slate-400 hover:text-slate-655'
          }`}
        >
          <Heart size={18} className={activeTab === 'guardian' ? 'scale-105 stroke-[2.25] text-pink-600 fill-pink-500' : 'stroke-1.5'} />
          <span>守护监控</span>
        </button>
        <button
          onClick={() => setActiveTab('library')}
          className={`h-11 rounded-full text-[10px] font-bold font-display flex flex-col items-center justify-center gap-0.5 transition-all duration-200 cursor-pointer ${
            activeTab === 'library'
              ? 'text-pink-650 bg-pink-50/50'
              : 'text-slate-400 hover:text-slate-655'
          }`}
        >
          <BookOpen size={18} className={activeTab === 'library' ? 'scale-105 stroke-[2.25] text-pink-600 fill-pink-500' : 'stroke-1.5'} />
          <span>科普讲堂</span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`h-11 rounded-full text-[10px] font-bold font-display flex flex-col items-center justify-center gap-0.5 transition-all duration-200 cursor-pointer ${
            activeTab === 'settings'
              ? 'text-pink-650 bg-pink-50/50'
              : 'text-slate-400 hover:text-slate-655'
          }`}
        >
          <Settings size={18} className={activeTab === 'settings' ? 'scale-105 stroke-[2.25]' : 'stroke-1.5'} />
          <span>多联管理</span>
        </button>
        </div>
      </div>
      )}

    </div>
  );
}
