import type { ReactNode } from 'react';

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ar-empty">
      <p className="ar-h3">{title}</p>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}
