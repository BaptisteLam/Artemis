import type { HTMLAttributes } from 'react';

/** Calque décoratif du stage : trame pixel animée (dérive, scintillement, balayage). */
export function StageFx() {
  return (
    <div className="ar-stage-fx" aria-hidden="true">
      <i className="ar-fx-drift" />
      <i className="ar-fx-twinkle" />
      <i className="ar-fx-twinkle" />
      <i className="ar-fx-scan" />
    </div>
  );
}

export function Stage({ quiet = false, className = '', children, ...rest }: HTMLAttributes<HTMLElement> & { quiet?: boolean }) {
  return (
    <section className={`ar-stage${quiet ? ' ar-stage-quiet' : ''} ${className}`.trim()} {...rest}>
      <StageFx />
      {children}
    </section>
  );
}
