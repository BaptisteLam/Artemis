import { LOGO_BLADE, LOGO_BLOCK, LOGO_VIEWBOX } from '../logo/paths';

export type LogoVariant = 'white' | 'cobalt' | 'ink' | 'current';

const FILL: Record<LogoVariant, string> = {
  white: 'var(--ar-on-canvas)',
  cobalt: 'var(--ar-cobalt)',
  ink: 'var(--ar-ink)',
  current: 'currentColor',
};

export function Logo({
  variant = 'current',
  size = 28,
  withWordmark = false,
  className,
}: {
  variant?: LogoVariant;
  size?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  const mark = (
    <svg
      viewBox={LOGO_VIEWBOX}
      height={size}
      width={(size * 714) / 496}
      fill={FILL[variant]}
      role={withWordmark ? undefined : 'img'}
      aria-label={withWordmark ? undefined : 'Artemis'}
      aria-hidden={withWordmark ? true : undefined}
    >
      <path d={LOGO_BLADE} />
      <path d={LOGO_BLOCK} />
    </svg>
  );
  if (!withWordmark) return mark;
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.4, color: FILL[variant] }}
    >
      {mark}
      <span
        style={{
          font: `600 ${Math.round(size * 0.9)}px/1 var(--ar-font-display)`,
          letterSpacing: '-0.05em',
        }}
      >
        Artemis
      </span>
    </span>
  );
}
