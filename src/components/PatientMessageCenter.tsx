import React, { useMemo, useState } from 'react';
import { Bell, Stethoscope, Heart } from 'lucide-react';
import AppNavBar from './AppNavBar';
import type { PatientMessage, PatientMessageFilter } from '../types';
import { stripEmojiPrefix } from '../utils/displayText';

interface PatientMessageCenterProps {
  messages: PatientMessage[];
  loading?: boolean;
  onClose: () => void;
  onSelectMessage: (message: PatientMessage) => void;
  onMarkRead: (message: PatientMessage) => void;
}

const FILTER_TABS: { id: PatientMessageFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'doctor', label: '来自医生' },
  { id: 'family', label: '来自家属' },
];

function formatTime(ts: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleString('zh-CN', { hour12: false });
  }
  return ts;
}

export default function PatientMessageCenter({
  messages,
  loading = false,
  onClose,
  onSelectMessage,
  onMarkRead,
}: PatientMessageCenterProps) {
  const [filter, setFilter] = useState<PatientMessageFilter>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return messages;
    return messages.filter((m) => m.category === filter);
  }, [messages, filter]);

  return (
    <div
      className="absolute inset-0 z-[55] bg-slate-50 flex flex-col animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="消息中心"
    >
      <AppNavBar title="消息中心" titleIcon={Bell} onBack={onClose} className="bg-white" />

      <div className="px-4 pt-3 pb-2 flex gap-2 shrink-0">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`flex-1 py-2 rounded-xl text-[11px] font-black transition border ${
              filter === tab.id
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-2">
        {loading ? (
          <div className="text-center text-sm text-slate-400 py-12">正在加载消息…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-12 border border-dashed border-slate-200 rounded-2xl bg-white">
            暂无{filter === 'doctor' ? '医生处方' : filter === 'family' ? '家属关怀' : ''}消息
          </div>
        ) : (
          filtered.map((msg) => (
            <button
              key={msg.id}
              type="button"
              onClick={() => {
                onMarkRead(msg);
                onSelectMessage(msg);
              }}
              className={`text-left p-3.5 rounded-2xl border shadow-sm transition active:scale-[0.99] ${
                msg.category === 'doctor'
                  ? 'bg-white border-indigo-100 hover:border-indigo-200'
                  : 'bg-white border-pink-100 hover:border-pink-200'
              } ${!msg.read ? 'ring-1 ring-indigo-200/60' : ''}`}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={`p-2 rounded-xl shrink-0 ${
                    msg.category === 'doctor'
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'bg-pink-50 text-pink-600'
                  }`}
                >
                  {msg.category === 'doctor' ? <Stethoscope size={16} /> : <Heart size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black text-slate-800 truncate">
                      {stripEmojiPrefix(msg.title)}
                    </span>
                    {!msg.read && (
                      <span className="text-[8px] bg-rose-500 text-white px-1.5 py-0.5 rounded-full font-bold shrink-0">
                        未读
                      </span>
                    )}
                  </div>
                  {msg.action_by && (
                    <p className="text-[9px] text-slate-500 mt-0.5 font-bold">{msg.action_by}</p>
                  )}
                  <p className="text-[10px] text-slate-600 mt-1 leading-relaxed line-clamp-2">
                    {msg.message}
                  </p>
                  <p className="text-[8px] text-slate-400 mt-1.5 font-mono">{formatTime(msg.timestamp)}</p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
