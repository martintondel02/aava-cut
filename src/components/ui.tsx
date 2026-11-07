import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';

export function IconButton({
  children, title, onClick, active, className = '', disabled
}: {
  children: ReactNode;
  title?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? 'is-active' : ''} ${className}`}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function Section({
  title, children, defaultOpen = true, action
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { setOpen(defaultOpen); }, [title, defaultOpen]);
  return (
    <section className={`inspector-section ${open ? 'is-open' : ''}`}>
      <div className="inspector-section-head">
        <button type="button" className="inspector-section-title" onClick={() => setOpen(!open)}>
          <ChevronDown size={13} className={`chevron ${open ? 'is-open' : ''}`} />
          {title}
        </button>
        {action}
      </div>
      {open && <div className="inspector-section-body">{children}</div>}
    </section>
  );
}

export function SliderRow({
  label, value, min, max, step = 1, onChange, onStart, onCommit, suffix, format, onReset, disabled
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  onStart?: () => void;
  onCommit?: () => void;
  suffix?: string;
  format?: (value: number) => string;
  onReset?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={`slider-row ${disabled ? 'is-disabled' : ''}`}>
      <div className="slider-row-head">
        <span className="field-label">{label}</span>
        <div className="slider-value-group">
          <input
            className="slider-number"
            type="number"
            value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onFocus={onStart}
            onChange={(event) => onChange(Number(event.target.value))}
            onBlur={onCommit}
          />
          {suffix && <span className="slider-suffix">{suffix}</span>}
          {onReset && (
            <button type="button" className="mini-reset" onClick={onReset} title={`Reset ${label}`}>
              <RotateCcw size={11} />
            </button>
          )}
        </div>
      </div>
      <input
        className="range-input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled}
        onPointerDown={onStart}
        onFocus={onStart}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
        style={{ '--range-progress': `${Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))}%` } as React.CSSProperties}
      />
      {format && <div className="slider-hint">{format(value)}</div>}
    </div>
  );
}

export function ToggleRow({
  label, checked, onChange, hint
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="toggle-row">
      <span>
        <span className="field-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      <button
        type="button"
        className={`switch ${checked ? 'is-on' : ''}`}
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
      >
        <span />
      </button>
    </label>
  );
}

export function Segmented<T extends string | number>({
  options, value, onChange, size = 'md'
}: {
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={`segmented segmented-${size}`}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={option.value === value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
          title={option.title}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ColorField({
  label, value, onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff';
  return (
    <label className="color-field">
      <span className="field-label">{label}</span>
      <span className="color-input-wrap">
        <input type="color" value={safe} onChange={(event) => onChange(event.target.value)} />
        <span className="color-hex">{safe.toUpperCase()}</span>
      </span>
    </label>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <div className="empty-hint">{children}</div>;
}
