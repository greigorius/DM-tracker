// Form controls: Tabs, Field, Checkbox, RadioPill. 44px touch targets, real
// <button>/<label> elements, keyboard-accessible.

import { useId, useRef } from 'react';
import { cx } from './primitives.jsx';

export function Tabs({ tabs, value, onChange, label, onHover }) {
  const refs = useRef([]);
  const onKey = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[n].id);
    refs.current[n]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap border-b border-line">
      {tabs.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={el => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active}
            aria-controls={`panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={e => onKey(e, i)}
            onMouseEnter={() => onHover?.(t.id)}
            className={cx(
              'min-h-11 px-4 font-mono text-[12px] uppercase tracking-[0.1em] border-b-2 -mb-px cursor-pointer',
              active ? 'bg-surface-hi text-text border-accent' : 'bg-transparent text-muted border-transparent hover:text-text-2',
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

const control = 'w-full min-h-11 px-3 bg-ground border border-line-strong text-text text-[14px] outline-none focus:border-accent disabled:opacity-50';

export function Field({ label, as = 'input', className, hint, children, ...rest }) {
  const id = useId();
  const Tag = as;
  return (
    <div className={cx('flex flex-col gap-1.5 min-w-0', className)}>
      <label htmlFor={id} className="font-mono text-[12px] uppercase tracking-[0.1em] text-text-2">{label}</label>
      {as === 'select' ? (
        <select id={id} className={cx(control, 'cursor-pointer')} {...rest}>{children}</select>
      ) : as === 'textarea' ? (
        <textarea id={id} rows={3} className={cx(control, 'py-2.5 resize-y min-h-[88px]')} {...rest} />
      ) : (
        <Tag id={id} className={control} {...rest} />
      )}
      {hint && <p className="m-0 font-mono text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function Checkbox({ label, checked, onChange, tone = 'accent', className }) {
  return (
    <label className={cx('inline-flex items-center gap-3 min-h-11 cursor-pointer select-none text-[14px] text-text-2', className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className={cx('w-5 h-5 m-0 cursor-pointer', tone === 'danger' ? 'accent-danger' : 'accent-accent')}
      />
      {label}
    </label>
  );
}

export function RadioPill({ name, options, value, onChange, label }) {
  return (
    <fieldset className="m-0 p-0 border-0 flex flex-col gap-1.5">
      {label && <legend className="mb-1.5 font-mono text-[12px] uppercase tracking-[0.1em] text-text-2">{label}</legend>}
      <div className="flex">
        {options.map(o => {
          const active = o === value;
          return (
            <label
              key={o}
              className={cx(
                'min-h-11 px-4 inline-flex items-center border font-mono text-[12px] uppercase tracking-[0.1em] cursor-pointer -ml-px first:ml-0 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent',
                active ? 'bg-surface-hi border-accent text-accent relative z-10' : 'border-line-strong text-muted hover:text-text-2',
              )}
            >
              <input type="radio" name={name} value={o} checked={active} onChange={() => onChange(o)} className="sr-only" />
              {o}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
