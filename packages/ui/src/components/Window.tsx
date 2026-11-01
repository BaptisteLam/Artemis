import type { ReactNode } from 'react';

export function Window({
  title,
  tilt,
  children,
  className = '',
}: {
  title: string;
  tilt?: 'l' | 'r';
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`ar-window${tilt ? ` ar-window-tilt-${tilt}` : ''} ${className}`.trim()}>
      <div className="ar-window-title">
        <span className="ar-window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        {title}
      </div>
      <div className="ar-window-pane">{children}</div>
    </div>
  );
}
