import React from 'react';

interface VeroBrandProps {
  tone?: 'light' | 'dark';
  compact?: boolean;
  className?: string;
}

export const VeroBrand: React.FC<VeroBrandProps> = ({ tone = 'light', compact = false, className = '' }) => {
  const isDark = tone === 'dark';

  return (
    <div className={`flex min-w-0 items-center gap-2.5 ${className}`} aria-label="Vero QC">
      <img
        src={isDark ? '/vero-qc-logo.png' : '/vero-qc-icon.png'}
        alt=""
        aria-hidden="true"
        className={isDark ? 'h-9 w-[5.5rem] object-contain object-left' : 'h-9 w-9 shrink-0 rounded-lg object-cover'}
      />
      {!compact && (
        <span className={`min-w-0 font-bold tracking-normal ${isDark ? 'text-white' : 'text-slate-950'}`}>
          Vero <span className={isDark ? 'text-lime-300' : 'text-teal-700'}>QC</span>
        </span>
      )}
    </div>
  );
};
