import type { ButtonHTMLAttributes, FC, ReactNode, CSSProperties } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export const Button: FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  style,
  ...props
}) => {
  const baseStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: 600,
    borderRadius: '6px',
    cursor: 'pointer',
    border: 'none',
    transition: 'all 0.15s ease',
    fontFamily: 'inherit',
    ...style,
  };

  const sizeStyles: Record<string, CSSProperties> = {
    sm: { padding: '6px 12px', fontSize: '12px' },
    md: { padding: '8px 16px', fontSize: '13.5px' },
    lg: { padding: '12px 20px', fontSize: '15px' },
  };

  const variantStyles: Record<string, CSSProperties> = {
    primary: {
      backgroundColor: 'var(--brand)',
      color: 'var(--brand-ink)',
    },
    secondary: {
      backgroundColor: 'var(--surface-3)',
      color: 'var(--text)',
      border: '1px solid var(--border)',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--text-2)',
    },
    danger: {
      backgroundColor: 'var(--danger-bg)',
      color: 'var(--danger-text)',
      border: '1px solid var(--danger)',
    },
  };

  return (
    <button
      style={{
        ...baseStyle,
        ...sizeStyles[size],
        ...variantStyles[variant],
      }}
      {...props}
    >
      {children}
    </button>
  );
};
