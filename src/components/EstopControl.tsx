import React, { useState } from 'react';
import { AlertTriangle, RotateCcw, ShieldAlert, Square } from 'lucide-react';
import {
  deviceController,
  getStoredDeviceTarget,
  isMqttHardwareMode,
  canSyncToPhysicalDevice,
  statusToTelemetryPatch,
} from '../hardware';
import { faultLabel } from '../hardware/deviceApi';
import type { HardwareState, HardwareUpdateOptions } from '../types';

interface EstopControlProps {
  hardwareState: HardwareState;
  onUpdateHardware?: (updates: Partial<HardwareState>, options?: HardwareUpdateOptions) => void;
  onLog?: (message: string) => void;
  /** alert=连接区横幅；panel=控制面板内完整交互 */
  variant?: 'alert' | 'panel';
}

function translateDeviceError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('hardware estop')) {
    return '物理急停仍触发：请松开设备上的急停按钮。若未接急停线，检查 GPIO20 是否悬空为高电平。';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return '设备响应超时，请确认 MQTT 已连接后重试。';
  }
  return message;
}

export default function EstopControl({
  hardwareState,
  onUpdateHardware,
  onLog,
  variant = 'panel',
}: EstopControlProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetBlockedByHw, setResetBlockedByHw] = useState(false);

  const linked =
    hardwareState.connection !== 'disconnected' && !hardwareState.is_mock_mode;
  const canCallDevice =
    canSyncToPhysicalDevice(hardwareState) && Boolean(getStoredDeviceTarget());

  const estop = hardwareState.estop === true;
  const swEstop = hardwareState.sw_estop === true;
  const hwEstop =
    hardwareState.hw_estop === true ||
    resetBlockedByHw ||
    (estop && !swEstop);
  const fault = hardwareState.device_fault ?? 0;

  if (!linked || !canCallDevice) return null;

  const refreshAfter = async () => {
    const next = await deviceController.pollOnce();
    onUpdateHardware?.({
      ...statusToTelemetryPatch(next),
      is_running: false,
    });
    if (!next.hw_estop && !next.estop) {
      setResetBlockedByHw(false);
      setError(null);
    }
    return next;
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onLog?.(`[急停] ${label}`);
    } catch (err) {
      const raw = err instanceof Error ? err.message : '操作失败';
      const msg = translateDeviceError(raw);
      setError(msg);
      if (raw.toLowerCase().includes('hardware estop')) {
        setResetBlockedByHw(true);
      }
      onLog?.(`[急停失败] ${label} → ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const handleEstop = () =>
    run('已下发整机急停', async () => {
      await deviceController.stop();
      await refreshAfter();
    });

  const handleReset = () =>
    run('已解除软件急停', async () => {
      await deviceController.reset();
      await refreshAfter();
    });

  if (variant === 'alert' && !estop) return null;

  if (estop) {
    const title = hwEstop
      ? '物理急停仍触发中'
      : swEstop
        ? '设备处于软件急停'
        : '设备处于急停';
    const hint = hwEstop
      ? '云端无法恢复：请松开设备上的急停按钮（GPIO20）。按钮弹起后状态会自动恢复，无需再点「恢复运行」。'
      : swEstop
        ? '治疗、缩回等操作已锁定。确认安全后点击下方按钮恢复。'
        : '请检查设备状态后重试。';
    const faultHint = fault !== 0 ? `当前故障：${faultLabel(fault)}` : null;
    const canSoftwareReset = swEstop && !hwEstop;

    return (
      <div
        className={`rounded-2xl border-2 border-rose-300 bg-gradient-to-br from-rose-50 to-amber-50 p-4 shadow-sm ${
          variant === 'alert' ? 'animate-in fade-in duration-300' : ''
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-rose-100 p-2 text-rose-600 shrink-0">
            <ShieldAlert size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-rose-900">{title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-rose-800/90">{hint}</p>
            {faultHint && (
              <p className="mt-1.5 text-[11px] font-bold text-amber-800">{faultHint}</p>
            )}
            {error && (
              <p className="mt-2 text-[11px] font-bold text-rose-700 flex items-center gap-1">
                <AlertTriangle size={12} />
                {error}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {canSoftwareReset && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <RotateCcw size={14} />
                  恢复运行
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'alert') return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black text-slate-700">安全控制</p>
          <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
            立即停止推杆、热垫与振动（与「停止缩回」不同）
          </p>
        </div>
        <button
          type="button"
          disabled={busy || hardwareState.is_running}
          onClick={handleEstop}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border-2 border-rose-300 bg-white px-3 py-2 text-[11px] font-black text-rose-700 hover:bg-rose-50 disabled:opacity-45 disabled:cursor-not-allowed"
        >
          <Square size={12} fill="currentColor" />
          紧急停止
        </button>
      </div>
      {hardwareState.is_running && (
        <p className="mt-2 text-[10px] text-center font-bold text-slate-500">
          治疗进行中请用上方「结束治疗」按钮停机。
        </p>
      )}
      {error && (
        <p className="mt-2 text-[10px] text-center font-bold text-rose-600">{error}</p>
      )}
    </div>
  );
}
