import type { HTMLAttributes } from 'react';

export function Stage({ quiet = false, className = '', ...rest }: HTMLAttributes<HTMLElement> & { quiet?: boolean }) {
  return <section className={`ar-stage${quiet ? ' ar-stage-quiet' : ''} ${className}`.trim()} {...rest} />;
}
