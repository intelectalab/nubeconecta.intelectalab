import type { HTMLAttributes, FC, ReactNode, CSSProperties } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const Card: FC<CardProps> = ({ children, style, ...props }) => {
  return (
    <div
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        boxShadow: 'var(--shadow)',
        overflow: 'hidden',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: FC<{ title: string; subtitle?: string; action?: ReactNode }> = ({
  title,
  subtitle,
  action,
}) => (
  <div
    style={{
      padding: '14px 18px',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}
  >
    <div>
      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>{title}</h3>
      {subtitle && <small style={{ color: 'var(--muted)', fontSize: '12px' }}>{subtitle}</small>}
    </div>
    {action && <div>{action}</div>}
  </div>
);

export const CardBody: FC<{ children: ReactNode; style?: CSSProperties }> = ({
  children,
  style,
}) => (
  <div style={{ padding: '16px 18px', ...style }}>{children}</div>
);
