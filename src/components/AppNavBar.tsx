import React from 'react';
import { ArrowLeft, type LucideIcon } from 'lucide-react';

/** 全应用统一顶栏：标题 15px、返回 15px、栏高 54px */
const BAR_CLASS =
  'h-[54px] min-h-[54px] bg-white/95 backdrop-blur-md border-b border-slate-100 flex items-center px-4 z-40 shrink-0';
const SIDE_SLOT_CLASS = 'min-w-[72px] flex items-center';
const TITLE_CLASS =
  'text-[15px] font-bold text-slate-900 tracking-tight leading-tight truncate text-center';

export function AppNavBackButton({
  onClick,
  label = '返回',
  className = '',
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-0.5 -ml-1 py-1 pr-2 text-indigo-600 hover:text-indigo-700 active:opacity-70 transition ${className}`}
    >
      <ArrowLeft size={17} strokeWidth={2.2} className="shrink-0" />
      <span className="text-[15px] font-semibold leading-none">{label}</span>
    </button>
  );
}

export function AppNavRoleBadge({
  children,
  tone = 'indigo',
}: {
  children: React.ReactNode;
  tone?: 'indigo' | 'pink';
}) {
  const toneClass =
    tone === 'pink'
      ? 'bg-pink-50 text-pink-700 border-pink-100'
      : 'bg-indigo-50 text-indigo-700 border-indigo-100';
  return (
    <span
      className={`text-[9px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${toneClass}`}
    >
      {children}
    </span>
  );
}

export function AppNavStatusBadge({
  label,
  dotClass = 'bg-emerald-500',
  pingClass = 'bg-emerald-400',
}: {
  label: string;
  dotClass?: string;
  pingClass?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${pingClass}`}
        />
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotClass}`} />
      </span>
      <span className="text-[8px] font-bold text-slate-400 font-mono uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

interface AppNavBarProps {
  title: string;
  titleIcon?: LucideIcon;
  titleIconClassName?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  className?: string;
}

export default function AppNavBar({
  title,
  titleIcon: TitleIcon,
  titleIconClassName = 'text-indigo-600',
  left,
  right,
  onBack,
  backLabel,
  className = '',
}: AppNavBarProps) {
  const leftContent = onBack ? (
    <AppNavBackButton onClick={onBack} label={backLabel} />
  ) : (
    left
  );

  return (
    <div className={`${BAR_CLASS} ${className}`}>
      <div className={`${SIDE_SLOT_CLASS} justify-start`}>{leftContent}</div>
      <h1
        className={`flex-1 min-w-0 px-2 flex items-center justify-center gap-1.5 ${TITLE_CLASS}`}
      >
        {TitleIcon && (
          <TitleIcon size={16} strokeWidth={2.2} className={`shrink-0 ${titleIconClassName}`} />
        )}
        <span className="truncate">{title}</span>
      </h1>
      <div className={`${SIDE_SLOT_CLASS} justify-end`}>{right}</div>
    </div>
  );
}
