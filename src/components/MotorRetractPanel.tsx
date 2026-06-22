import React, { useState } from 'react';
import { ArrowDownToLine, Square } from 'lucide-react';
import {
  deviceController,
  getStoredDeviceTarget,
  isMqttHardwareMode,
  canSyncToPhysicalDevice,
  statusToTelemetryPatch,
} from '../hardware';
import type { DeviceStatus, MotorSide } from '../hardware/deviceApi';
import type { HardwareState, HardwareUpdateOptions } from '../types';

interface MotorRetractPanelProps {
  hardwareState: HardwareState;
  onUpdateHardware?: (updates: Partial<HardwareState>, options?: HardwareUpdateOptions) => void;
  onLog?: (message: string) => void;
  /** control = 理疗控制面板「开始治疗」下方；debug = 硬件联调浮窗 */
  variant?: 'control' | 'debug';
}

const SIDE_LABELS: Record<MotorSide, string> = {
  left: '左侧',
  right: '右侧',
  all: '双侧',
};

export default function MotorRetractPanel({
  hardwareState,
  onUpdateHardware,
  onLog,
  variant = 'control',
}: MotorRetractPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSide, setActiveSide] = useState<MotorSide | null>(null);

  const linked =
    hardwareState.connection !== 'disconnected' && !hardwareState.is_mock_mode;
  const canCallDeviceApi =
    canSyncToPhysicalDevice(hardwareState) && Boolean(getStoredDeviceTarget());

  const estopBlocked = hardwareState.estop === true;
  const deviceStatus = variant === 'debug' ? deviceController.lastDeviceStatus : null;
  const retractDisabled =
    busy || hardwareState.is_running || estopBlocked || !linked;

  const refreshStatus = async () => {
    if (!canCallDeviceApi) return null;
    const next = await deviceController.pollOnce();
    onUpdateHardware?.(statusToTelemetryPatch(next));
    return next;
  };

  const runMotor = async (label: string, fn: () => Promise<void>, side?: MotorSide) => {
    setBusy(true);
    setError(null);
    try {
      if (!canCallDeviceApi) {
        onLog?.(
          `[推杆缩回·演示] ${label}（Mock：请连接设备并填写${
            isMqttHardwareMode() ? '设备 ID' : ' IP'
          }后下发真实指令）`
        );
        if (side) setActiveSide(side);
        return;
      }
      await fn();
      await refreshStatus();
      if (side) setActiveSide(side);
      onLog?.(`[推杆缩回] ${label}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失败';
      setError(msg);
      onLog?.(`[推杆缩回失败] ${label} → ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRetract = (side: MotorSide) =>
    runMotor(`${SIDE_LABELS[side]}开始缩回`, () => deviceController.retractMotor(side), side);

  const handleStopRetract = () =>
    runMotor('停止缩回', async () => {
      if (canCallDeviceApi) await deviceController.stopMotorRetract('all');
      setActiveSide(null);
    });

  if (variant === 'debug') {
    return (
      <DebugMotorPanel
        busy={busy}
        error={error}
        activeSide={activeSide}
        canCallDeviceApi={canCallDeviceApi}
        estopBlocked={estopBlocked}
        hardwareState={hardwareState}
        deviceStatus={deviceStatus}
        onRetract={handleRetract}
        onStopRetract={handleStopRetract}
      />
    );
  }

  if (!linked) return null;

  return (
    <div className="flex flex-col gap-2.5 pt-1">
      <button
        type="button"
        disabled={retractDisabled}
        onClick={() => handleRetract('all')}
        className="w-full py-3 rounded-2xl font-black text-sm border-2 border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm transition flex items-center justify-center gap-2 hover:bg-indigo-100 hover:border-indigo-300 disabled:opacity-45 disabled:cursor-not-allowed"
      >
        <ArrowDownToLine size={16} />
        缩回推杆
        {activeSide === 'all' && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-200/80">
            缩回中
          </span>
        )}
      </button>

      <div className="grid grid-cols-3 gap-2">
        {(['left', 'right'] as MotorSide[]).map((side) => (
          <button
            key={side}
            type="button"
            disabled={retractDisabled}
            onClick={() => handleRetract(side)}
            className="py-2 rounded-xl text-[11px] font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {SIDE_LABELS[side]}
          </button>
        ))}
        <button
          type="button"
          disabled={busy || estopBlocked || !linked}
          onClick={handleStopRetract}
          className="py-2 rounded-xl text-[11px] font-bold border border-slate-300 bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-45 disabled:cursor-not-allowed flex items-center justify-center gap-1"
        >
          <Square size={11} />
          停止
        </button>
      </div>

      <p className="text-[10px] text-center text-slate-500 leading-snug px-1">
        治疗结束后请手动缩回推杆；缩回为持续运动，完成后点「停止」。
        {!canCallDeviceApi &&
          linked &&
          ` · 演示模式：${isMqttHardwareMode() ? '填写设备 ID' : '填写 IP'} 后下发真实指令。`}
      </p>

      {hardwareState.is_running && (
        <p className="text-[10px] text-center font-bold text-rose-600">请先结束治疗，再缩回推杆。</p>
      )}
      {estopBlocked && (
        <p className="text-[10px] text-center font-bold text-rose-600">急停中，请先在上方解除急停。</p>
      )}
      {error && <p className="text-[10px] text-center font-bold text-rose-600">{error}</p>}
    </div>
  );
}

function DebugMotorPanel({
  busy,
  error,
  activeSide,
  canCallDeviceApi,
  estopBlocked,
  hardwareState,
  deviceStatus,
  onRetract,
  onStopRetract,
}: {
  busy: boolean;
  error: string | null;
  activeSide: MotorSide | null;
  canCallDeviceApi: boolean;
  estopBlocked: boolean;
  hardwareState: HardwareState;
  deviceStatus: DeviceStatus | null;
  onRetract: (side: MotorSide) => void;
  onStopRetract: () => void;
}) {
  return (
    <div className="mt-3 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-3">
      <p className="text-xs font-black text-amber-950 mb-2">推杆缩回 · 调试</p>
      {!canCallDeviceApi && (
        <p className="mb-2 text-[10px] font-bold text-amber-700">
          {isMqttHardwareMode()
            ? '填写设备 ID 并连接后可经 MQTT 下发 motor 命令'
            : '填写 IP 并连接后可调用 POST /api/motor'}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {(['left', 'right'] as MotorSide[]).map((side) => (
          <button
            key={side}
            type="button"
            disabled={busy || estopBlocked || hardwareState.is_running}
            onClick={() => onRetract(side)}
            className="rounded-xl border border-amber-300/80 bg-white px-2 py-2 text-[11px] font-black disabled:opacity-45"
          >
            {SIDE_LABELS[side]}缩回
            {activeSide === side ? '…' : ''}
          </button>
        ))}
        <button
          type="button"
          disabled={busy || estopBlocked}
          onClick={onStopRetract}
          className="col-span-2 rounded-xl bg-slate-800 py-2 text-[11px] font-black text-white disabled:opacity-45"
        >
          停止缩回
        </button>
      </div>
      {error && <p className="mt-2 text-[10px] font-bold text-rose-700">{error}</p>}
      {deviceStatus && (deviceStatus.motor_l_end !== 0 || deviceStatus.motor_r_end !== 0) && (
        <p className="mt-2 text-[10px] font-bold text-rose-700">
          末端保护 L{deviceStatus.motor_l_end} / R{deviceStatus.motor_r_end}
        </p>
      )}
    </div>
  );
}
