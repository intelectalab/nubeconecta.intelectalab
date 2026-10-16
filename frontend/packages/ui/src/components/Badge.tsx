import type { FC, ReactNode, CSSProperties } from 'react';

export interface BadgeProps {
  variant?: 'ok' | 'warn' | 'danger' | 'info' | 'outline';
  children: ReactNode;
}

export const Badge: FC<BadgeProps> = ({ variant = 'info', children }) => {
  const styles: Record<string, CSSProperties> = {
    ok: { background: 'var(--ok-bg)', color: 'var(--ok-text)' },
    warn: { background: 'var(--warn-bg)', color: 'var(--warn-text)' },
    danger: { background: 'var(--danger-bg)', color: 'var(--danger-text)' },
    info: { background: 'var(--info-bg)', color: 'var(--info-text)' },
    outline: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)' },
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '11.5px',
        fontWeight: 600,
        ...styles[variant],
      }}
    >
      {children}
    </span>
  );
};
