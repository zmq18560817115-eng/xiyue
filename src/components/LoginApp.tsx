import React, { useState } from 'react';
import {
  ArrowRight,
  Lock,
  Phone,
  User,
  Stethoscope,
  HeartHandshake,
  type LucideIcon,
} from 'lucide-react';
import { AppNavBackButton, AppNavRoleBadge } from './AppNavBar';
import KneeJoyBrandIcon from './KneeJoyBrandIcon';
import { loginWithPassword, loginWithPhone, sendSmsCode } from '../api/client';

type LoginRole = 'patient' | 'doctor' | 'family';
type LoginStep = 'role' | 'login';

interface LoginAppProps {
  onLogin: (role: LoginRole) => void | Promise<void>;
}

const ROLE_OPTIONS: {
  id: LoginRole;
  Icon: LucideIcon;
  iconColor: string;
  emojiBg: string;
  title: string;
  desc: string;
}[] = [
  {
    id: 'patient',
    Icon: User,
    iconColor: 'text-indigo-600',
    emojiBg: 'bg-indigo-100',
    title: '我是患者',
    desc: '开启今日关节理疗与康复行为打卡',
  },
  {
    id: 'doctor',
    Icon: Stethoscope,
    iconColor: 'text-emerald-600',
    emojiBg: 'bg-emerald-100',
    title: '我是康复医生/专家',
    desc: '管理签约患者，下发数字化理疗处方',
  },
  {
    id: 'family',
    Icon: HeartHandshake,
    iconColor: 'text-pink-600',
    emojiBg: 'bg-pink-100',
    title: '我是健康守护人',
    desc: '远程关注家人康复动态与训练打卡',
  },
];

const ROLE_LABEL: Record<LoginRole, string> = {
  patient: '患者端',
  doctor: '康复医生/专家端',
  family: '健康守护人端',
};

/** 顶栏到主卡片之间等高区域；logo 下移到原 App 名附近（与红框示意一致） */
const LOGIN_BRAND_BAND_CLASS =
  'shrink-0 relative flex flex-col items-center justify-start h-[252px] pt-[120px]';

function BrandHero({
  compact = false,
  inBand = false,
}: {
  compact?: boolean;
  inBand?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center text-center shrink-0 ${
        inBand ? '' : compact ? 'mt-2 pt-1' : 'mt-10 pt-5'
      }`}
    >
      <KneeJoyBrandIcon
        size={compact ? 'sm' : inBand ? 'lg' : 'md'}
        className={compact ? 'mb-1.5' : inBand ? 'mb-2.5' : 'mb-2'}
      />
      <h2
        className={`font-black font-display text-slate-900 tracking-tight leading-none mt-1 ${
          inBand ? 'text-lg' : 'text-base'
        }`}
      >
        「膝悦 (KneeJoy)」App
      </h2>
    </div>
  );
}

function LoginBrandBand({ overlay }: { overlay?: React.ReactNode }) {
  return (
    <div className={LOGIN_BRAND_BAND_CLASS}>
      {overlay}
      <BrandHero inBand />
    </div>
  );
}

function LoginFooter() {
  return (
    <div className="flex flex-col gap-1 text-center shrink-0 mt-3">
      <p className="text-[7.5px] text-slate-400 leading-relaxed px-2 flex flex-col items-center gap-0.5">
        <span>提示：未注册手机号验证后将自动创建新账号，</span>
        <span className="whitespace-nowrap">
          登录即代表您同意
          <span className="text-indigo-600 hover:underline cursor-pointer font-bold">《用户服务协议》</span>
          与
          <span className="text-indigo-600 hover:underline cursor-pointer font-bold">《隐私政策》</span>
        </span>
      </p>
      <p className="text-[7.5px] text-slate-400 leading-none flex items-center justify-center gap-1">
        <Lock size={10} strokeWidth={2.2} className="shrink-0" />
        系统符合三级医院病历安全及博爱骨科医学伦理规范
      </p>
    </div>
  );
}

export default function LoginApp({ onLogin }: LoginAppProps) {
  const [step, setStep] = useState<LoginStep>('role');
  const [selectedRole, setSelectedRole] = useState<LoginRole>('patient');
  const [loginMethod, setLoginMethod] = useState<'phone' | 'password'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [smsSending, setSmsSending] = useState(false);

  const handleRoleSelect = (role: LoginRole) => {
    setSelectedRole(role);
    setErrorMsg(null);
  };

  const goToLogin = () => {
    setErrorMsg(null);
    setStep('login');
  };

  const goBackToRole = () => {
    setErrorMsg(null);
    setStep('role');
  };

  const handleMethodSelect = (method: 'phone' | 'password') => {
    setLoginMethod(method);
    setPinInput('');
    setErrorMsg(null);
  };

  const handleSendSms = async () => {
    setSmsSending(true);
    setErrorMsg(null);
    try {
      await sendSmsCode(phoneInput);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '发送验证码失败');
    } finally {
      setSmsSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      if (loginMethod === 'phone') {
        await loginWithPhone(phoneInput, pinInput, selectedRole);
      } else {
        await loginWithPassword(phoneInput, pinInput, selectedRole);
      }
      await onLogin(selectedRole);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '登录失败，请检查网络或账号');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === 'role') {
    return (
      <div className="flex-1 flex flex-col justify-between py-3 px-4 select-none overflow-y-auto">
        <LoginBrandBand />

        <div className="flex-1 my-4 flex flex-col justify-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider pl-1">
            请选择登录入口身份：
          </span>

          <div className="flex flex-col gap-2.5">
            {ROLE_OPTIONS.map((role) => {
              const active = selectedRole === role.id;
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => handleRoleSelect(role.id)}
                  className={`p-3 rounded-xl border text-left transition duration-200 cursor-pointer flex items-center gap-3 ${
                    active
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-950 shadow-sm shadow-indigo-100 ring-1 ring-indigo-200'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`w-10 h-10 rounded-xl ${role.emojiBg} flex items-center justify-center shrink-0`}
                  >
                    <role.Icon size={22} strokeWidth={2.2} className={role.iconColor} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <span
                      className={`text-xs font-bold block ${active ? 'text-indigo-950' : 'text-slate-800'}`}
                    >
                      {role.title}
                    </span>
                    <p className="text-[9px] text-slate-400 mt-0.5 font-medium leading-snug">
                      {role.desc}
                    </p>
                  </div>
                  {active && (
                    <span className="text-[8px] font-black text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full shrink-0">
                      已选
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={goToLogin}
          className="w-full h-[50px] rounded-full bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-bold shadow-md cursor-pointer transition flex items-center justify-center gap-1.5 shrink-0"
        >
          <span>下一步，登录 / 注册</span>
          <ArrowRight size={13} />
        </button>

        <LoginFooter />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col justify-between py-3 px-4 select-none overflow-y-auto">
      <LoginBrandBand
        overlay={
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between gap-2 min-h-[40px]">
            <AppNavBackButton onClick={goBackToRole} />
            <AppNavRoleBadge>{ROLE_LABEL[selectedRole]}</AppNavRoleBadge>
          </div>
        }
      />

      <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200/80 p-3 flex flex-col gap-2 shrink-0 shadow-sm my-3">
        <p className="text-[13px] font-bold text-slate-600 text-center leading-snug">
          登录或注册以进入{ROLE_LABEL[selectedRole]}
        </p>

        <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl border border-slate-200 mb-1">
          <button
            type="button"
            onClick={() => handleMethodSelect('phone')}
            className={`py-2 px-1 rounded-lg text-[12px] font-bold transition flex items-center justify-center gap-1 cursor-pointer leading-tight ${
              loginMethod === 'phone'
                ? 'bg-white text-indigo-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>手机号快速注册/登录</span>
          </button>
          <button
            type="button"
            onClick={() => handleMethodSelect('password')}
            className={`py-2 px-1 rounded-lg text-[12px] font-bold transition flex items-center justify-center gap-1 cursor-pointer leading-tight ${
              loginMethod === 'password'
                ? 'bg-white text-indigo-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>账号密码安全登录</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="flex flex-col">
            <label className="text-[8px] font-bold text-slate-400 block mb-0.5 uppercase tracking-wider">
              手机号码
            </label>
            <div className="relative">
              <Phone size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold" />
              <input
                type="text"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="请输入手机号"
                className="w-full text-[10.5px] font-bold font-mono pl-7 pr-2 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:outline-indigo-500 focus:bg-white text-slate-800"
                required
              />
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-[8px] font-bold text-slate-400 block mb-0.5 uppercase tracking-wider">
              {loginMethod === 'phone' ? '短信验证码' : '登录密码'}
            </label>
            <div className="relative">
              <Lock size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder={loginMethod === 'phone' ? '请输入4-6位验证码' : '请输入账户密码'}
                className="w-full text-[10.5px] font-bold font-mono pl-7 pr-2 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:outline-indigo-500 focus:bg-white text-slate-800"
                required
              />
              {loginMethod === 'phone' && (
                <button
                  type="button"
                  onClick={handleSendSms}
                  disabled={smsSending}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded text-[7.5px] font-bold disabled:opacity-50"
                >
                  {smsSending ? '发送中' : '获取验证码'}
                </button>
              )}
            </div>
          </div>

          {errorMsg && (
            <p className="text-[9px] text-rose-600 font-bold text-center">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-1.5 h-[50px] rounded-full bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-bold shadow-md cursor-pointer transition flex items-center justify-center gap-1.5 focus:outline-none"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>正在验证临床身份...</span>
              </span>
            ) : (
              <>
                <span>立即进入对应系统端</span>
                <ArrowRight size={13} />
              </>
            )}
          </button>
        </form>
      </div>

      <LoginFooter />
    </div>
  );
}
