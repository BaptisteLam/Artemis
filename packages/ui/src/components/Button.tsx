import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'glass' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' }) {
  return (
    <button
      type={type}
      className={`ar-btn ar-btn-${variant}${size === 'sm' ? ' ar-btn-sm' : ''} ${className}`.trim()}
      {...rest}
    />
  );
}
