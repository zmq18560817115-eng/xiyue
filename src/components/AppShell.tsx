/**
 * 全屏应用壳：真机浏览器全宽显示，无模拟状态栏
 */

import React from 'react';
import { BellRing } from 'lucide-react';
import { AppNotification } from '../types';

interface AppShellProps {
  children: React.ReactNode;
  activeNotification: AppNotification | null;
  onClearNotification: () => void;
  onViewPrescription?: () => void;
  onRoleClick: (role: 'patient' | 'doctor' | 'family') => void;
}

export default function AppShell({
  children,
  activeNotification,
  onClearNotification,
  onViewPrescription,
  onRoleClick,
}: AppShellProps) {
  return (
    <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col bg-slate-50 text-slate-800 antialiased shadow-none sm:shadow-xl sm:ring-1 sm:ring-slate-200/80">
      {activeNotification && (
        <div
          className="absolute inset-x-3 z-50 rounded-2xl border border-indigo-500/20 bg-indigo-950/95 p-4 text-white shadow-2xl backdrop-blur-xl animate-in slide-in-from-top duration-300"
          style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-xl bg-indigo-600 p-2.5 text-white shadow-lg">
              <BellRing size={18} className="animate-bounce" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-300 font-display">
                  {activeNotification.type === 'nudge' && '家人催促关怀'}
                  {activeNotification.type === 'prescription' && '权威医生处方'}
                  {activeNotification.type === 'alarm' && '设备安全警报'}
                  {activeNotification.type === 'system' && '系统更新提议'}
                </span>
                <span className="font-mono text-[10px] text-zinc-400">{activeNotification.timestamp}</span>
              </div>
              <h4 className="mt-1 text-sm font-semibold leading-tight text-slate-100 font-display">
                {activeNotification.title}
              </h4>
              <p className="mt-1 lines-clamp-2 text-xs leading-relaxed text-zinc-300">
                {activeNotification.message}
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClearNotification}
                  className="cursor-pointer rounded-md bg-white/10 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-white/20 active:scale-95"
                >
                  忽略
                </button>
                {activeNotification.type === 'prescription' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onViewPrescription) onViewPrescription();
                      else {
                        onClearNotification();
                        onRoleClick('patient');
                      }
                    }}
                    className="cursor-pointer rounded-md bg-indigo-600 px-3.5 py-1 text-[11px] font-semibold text-white shadow-md shadow-indigo-700/20 transition hover:bg-indigo-500 active:scale-95"
                  >
                    去查看
                  </button>
                )}
                {activeNotification.type === 'nudge' && (
                  <button
                    type="button"
                    onClick={() => {
                      onClearNotification();
                      onRoleClick('patient');
                    }}
                    className="cursor-pointer rounded-md bg-indigo-600 px-3.5 py-1 text-[11px] font-semibold text-white shadow-md shadow-indigo-700/20 transition hover:bg-indigo-500 active:scale-95"
                  >
                    去签到理疗
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50">
        {children}
      </main>
    </div>
  );
}
