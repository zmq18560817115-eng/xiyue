import React from 'react';

type KneeJoyBrandIconProps = {
  /** sm=40px, md=52px, lg=64px */
  size?: 'sm' | 'md' | 'lg';
  showPing?: boolean;
  showGlow?: boolean;
  className?: string;
};

const SIZE_CLASS = {
  sm: 'w-10 h-10',
  md: 'w-[52px] h-[52px]',
  lg: 'w-16 h-16',
} as const;

const GLOW_INSET = {
  sm: '-inset-1',
  md: '-inset-1.5',
  lg: '-inset-2',
} as const;

/** 与登录页封面一致的 App 图标 */
export default function KneeJoyBrandIcon({
  size = 'md',
  showPing = true,
  showGlow = true,
  className = '',
}: KneeJoyBrandIconProps) {
  return (
    <div className={`relative shrink-0 ${className}`}>
      {showGlow && (
        <div
          className={`absolute bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-2xl blur-sm opacity-30 animate-pulse ${GLOW_INSET[size]}`}
        />
      )}
      <div
        className={`relative rounded-2xl overflow-hidden bg-[#8374fe] ${SIZE_CLASS[size]}`}
        style={{ isolation: 'isolate' }}
      >
        <img
          src="/kneejoy-app-icon.png"
          alt="膝悦 KneeJoy"
          className="block w-full h-full object-contain"
          draggable={false}
        />
        {showPing && (
          <span
            className={`absolute bg-emerald-500 rounded-full animate-ping pointer-events-none ${
              size === 'lg' ? 'bottom-1 right-1 w-2.5 h-2.5' : 'bottom-0.5 right-0.5 w-2 h-2'
            }`}
          />
        )}
      </div>
    </div>
  );
}
