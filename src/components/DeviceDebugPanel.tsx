import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Cable,
  RefreshCw,
  Square,
  Thermometer,
  Wifi,
  Zap,
} from 'lucide-react';
import {
  deviceController,
  getStoredDeviceTarget,
  getStoredDeviceId,
  isMqttHardwareMode,
  setStoredDeviceTarget,
  statusToTelemetryPatch,
} from '../hardware';
import { faultLabel, type DeviceStatus } from '../hardware/deviceApi';
import type { HardwareState } from '../types';
import MotorRetractPanel from './MotorRetractPanel';

interface DeviceDebugPanelProps {
  hardwareState: HardwareState;
  onUpdateHardware: (updates: Partial<HardwareState>) => void;
  onLog: (message: string) => void;
}

export default function DeviceDebugPanel({
  hardwareState,
  onUpdateHardware,
  onLog,
}: DeviceDebugPanelProps) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(getStoredDeviceTarget());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<DeviceStatus | null>(deviceController.lastDeviceStatus);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!polling) return;
    deviceController.startPolling((next) => {
      setStatus(next);
      onUpdateHardware(statusToTelemetryPatch(next));
    });
    return () => deviceController.stopPolling();
  }, [polling, onUpdateHardware]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      setStoredDeviceTarget(target);
      await fn();
      onLog(`[硬件联调] ${label}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失败';
      setError(msg);
      onLog(`[硬件联调失败] ${label} → ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = () =>
    run('连接设备', async () => {
      const { info, status: next } = await deviceController.connect(target);
      setStatus(next);
      onUpdateHardware({
        ...statusToTelemetryPatch(next),
        connection: 'wifi',
        is_mock_mode: false,
      });
      setPolling(true);
      const addr = isMqttHardwareMode() ? target : next.ip || target;
      onLog(`[设备识别] ${info.name} ${info.model} v${info.version} @ ${addr}`);
    });

  const handlePoll = () =>
    run('刷新状态', async () => {
      const next = await deviceController.pollOnce(target);
      setStatus(next);
      onUpdateHardware(statusToTelemetryPatch(next));
    });

  const handleTherapy = () =>
    run('下发治疗参数', async () => {
      await deviceController.startTherapy(
        {
          left_force: hardwareState.left_force,
          right_force: hardwareState.right_force,
          temp: hardwareState.temp,
          vibration: hardwareState.vibration,
        },
        target
      );
      const next = await deviceController.pollOnce(target);
      setStatus(next);
      onUpdateHardware({ ...statusToTelemetryPatch(next), is_running: true });
    });

  const handleStop = () =>
    run('急停', async () => {
      await deviceController.stop(target);
      const next = await deviceController.pollOnce(target);
      setStatus(next);
      onUpdateHardware({ ...statusToTelemetryPatch(next), is_running: false });
    });

  const handleReset = () =>
    run('解除软件急停', async () => {
      await deviceController.reset(target);
      const next = await deviceController.pollOnce(target);
      setStatus(next);
      onUpdateHardware(statusToTelemetryPatch(next));
    });

  const handleTare = () =>
    run('力传感器去皮', async () => {
      await deviceController.tare(target);
      const next = await deviceController.pollOnce(target);
      setStatus(next);
      onUpdateHardware(statusToTelemetryPatch(next));
    });

  const alert = status ? deviceController.formatAlert(status) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-24 right-4 z-[80] flex items-center gap-2 rounded-full bg-slate-900/90 px-4 py-2 text-xs font-bold text-white shadow-lg backdrop-blur"
      >
        <Wifi size={14} />
        硬件联调
      </button>

      {open && (
        <div className="fixed inset-x-3 bottom-36 z-[80] max-h-[62vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl backdrop-blur md:inset-x-auto md:right-4 md:w-[360px]">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-slate-900">ESP32 软硬件联调</p>
              <p className="text-[11px] text-slate-500">
                {isMqttHardwareMode()
                  ? 'MQTT：blufi/docs/MQTT.md'
                  : 'HTTP：docs/API-设备HTTP接口.md'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
            >
              关闭
            </button>
          </div>

          <label className="mb-3 block text-[11px] font-bold text-slate-600">
            {isMqttHardwareMode() ? '设备 ID（kj_…）' : '设备 IP'}
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={isMqttHardwareMode() ? getStoredDeviceId() || 'kj_d885ac8d1870' : '192.168.1.100'}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono outline-none focus:border-indigo-400"
            />
          </label>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleConnect}
              className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              连接
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handlePoll}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={12} className="mr-1 inline" />
              刷新
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleTherapy}
              className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              <Zap size={12} className="mr-1 inline" />
              下发治疗
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleStop}
              className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              <Square size={12} className="mr-1 inline" />
              急停
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleReset}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"
            >
              复位
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleTare}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"
            >
              去皮
            </button>
          </div>

          <MotorRetractPanel
            variant="debug"
            hardwareState={hardwareState}
            onUpdateHardware={onUpdateHardware}
            onLog={onLog}
          />

          <label className="mb-3 mt-3 flex items-center gap-2 text-[11px] font-bold text-slate-600">
            <input
              type="checkbox"
              checked={polling}
              onChange={(e) => setPolling(e.target.checked)}
            />
            1Hz MQTT 状态推送（设备约 1s 上报 force/temp）
          </label>

          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {alert && (
            <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
              {alert}
            </div>
          )}

          {status ? (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-700">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <Activity size={14} />
                实时状态
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono">
                <span>左力 {status.force_l.toFixed(1)} N</span>
                <span>右力 {status.force_r.toFixed(1)} N</span>
                <span className="flex items-center gap-1">
                  <Thermometer size={12} />
                  {status.temp.toFixed(1)} / {status.target_temp.toFixed(1)} ℃
                </span>
                <span>热垫 {status.heater_duty.toFixed(1)}%</span>
                <span className="flex items-center gap-1">
                  <Cable size={12} />
                  L {status.current_l_ma.toFixed(0)} mA
                </span>
                <span>R {status.current_r_ma.toFixed(0)} mA</span>
                <span>急停 {status.estop ? '是' : '否'}</span>
                <span>故障 {faultLabel(status.fault)}</span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              填写 ESP32 IP 后点「连接」。手机/电脑需与设备在同一 Wi-Fi。
            </p>
          )}
        </div>
      )}
    </>
  );
}
