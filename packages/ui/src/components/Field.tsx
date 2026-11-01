import { useId, type ReactElement, cloneElement } from 'react';

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
}) {
  const id = useId();
  const descId = `${id}-desc`;
  return (
    <div className="ar-field">
      <label className="ar-field-label" htmlFor={id}>
        {label}
      </label>
      {cloneElement(children, {
        id,
        'aria-describedby': hint || error ? descId : undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {error ? (
        <span id={descId} className="ar-field-error">
          {error}
        </span>
      ) : hint ? (
        <span id={descId} className="ar-field-hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
