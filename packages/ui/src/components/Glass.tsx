import type { HTMLAttributes } from 'react';

export function Glass({
  tone = 'frost',
  rise = false,
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement> & { tone?: 'clear' | 'frost' | 'solid'; rise?: boolean }) {
  const cls = tone === 'clear' ? 'ar-glass' : tone === 'frost' ? 'ar-glass-frost' : 'ar-solid';
  return <div className={`${cls}${rise ? ' ar-rise' : ''} ${className}`.trim()} {...rest} />;
}
