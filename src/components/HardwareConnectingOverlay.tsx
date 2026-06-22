import React from 'react';
import { Radio, X } from 'lucide-react';
import type { ConnectionProgress, HardwareTransport } from '../hardware/types';

interface HardwareConnectingOverlayProps {
  transport: HardwareTransport;
  progress: ConnectionProgress | null;
  onCancel: () => void;
}

const TRANSPORT_LABEL: Record<HardwareTransport, string> = {
  bluetooth: '蓝牙 BLE',
  wifi: '家庭 Wi-Fi',
};

export default function HardwareConnectingOverlay({
  transport,
  progress,
  onCancel,
}: HardwareConnectingOverlayProps) {
  const stepIndex = progress
    ? ['scanning', 'pairing', 'handshaking', 'ready'].indexOf(progress.step)
    : 0;

  return (
    <div
      className="fixed inset-0 z-[70] mx-auto flex max-w-[480px] items-center justify-center bg-slate-900/55 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="正在连接理疗仪"
    >
      <div className="w-[88%] max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-slate-200/80 flex flex-col gap-4 animate-in zoom-in-95 duration-300">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-indigo-100 text-indigo-600 relative">
              <Radio size={22} className="animate-pulse" />
              <span className="absolute inset-0 rounded-2xl border-2 border-indigo-400/40 animate-ping" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">正在连接理疗仪</h3>
              <p className="text-[10px] text-slate-500 mt-0.5 font-bold">
                通信方式：{TRANSPORT_LABEL[transport]}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            aria-label="取消连接"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed text-left">
          {progress?.message ?? '正在初始化连接…'}
        </p>

        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                stepIndex >= i ? 'bg-indigo-500' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>

        <ul className="text-[9px] text-slate-400 space-y-1 text-left pl-1">
          <li>· 请确认理疗仪已开机且电量充足</li>
          <li>· 将手机靠近设备（蓝牙建议 1 米内）</li>
          <li>· 首次配对请勿关闭本页面</li>
        </ul>

        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2.5 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition"
        >
          取消连接
        </button>
      </div>
    </div>
  );
}
