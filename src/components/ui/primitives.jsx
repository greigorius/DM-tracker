// Shared UI primitives. Square corners, 1px borders, no shadows or gradients.
// Colours come only from the tokens in src/styles/tokens.css.

export const cx = (...c) => c.filter(Boolean).join(' ');

export function SectionLabel({ as: Tag = 'h2', children, right, className }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3 mb-3', className)}>
      <Tag className="section-label m-0 font-normal">{children}</Tag>
      {right}
    </div>
  );
}

export function Card({ as: Tag = 'section', className, children, ...rest }) {
  return <Tag className={cx('bg-surface border border-line', className)} {...rest}>{children}</Tag>;
}

export function Button({ variant = 'primary', className, children, type = 'button', ...rest }) {
  const styles = variant === 'primary'
    ? 'bg-accent text-ground border-accent hover:brightness-110 disabled:opacity-50'
    : 'bg-transparent text-text border-line-strong hover:bg-surface-hi disabled:opacity-50';
  return (
    <button
      type={type}
      className={cx('inline-flex items-center justify-center gap-2 min-h-11 px-4 border font-mono text-[13px] uppercase tracking-[0.08em] cursor-pointer disabled:cursor-not-allowed', styles, className)}
      {...rest}
    >
      {children}
    </button>
  );
}

const TONES = {
  accent: 'text-accent border-accent/50',
  danger: 'text-danger border-danger/50',
  info: 'text-info border-info/50',
  ok: 'text-ok border-ok/50',
  muted: 'text-muted border-line-strong',
};

export function Badge({ tone = 'muted', className, children }) {
  return <span className={cx('inline-flex items-center px-1.5 py-0.5 border font-mono text-[11px] leading-none tabular-nums', TONES[tone], className)}>{children}</span>;
}

const TYPE_TONE = { item: 'muted', action: 'accent', note: 'muted', rfi: 'info', vc: 'accent', submission: 'ok', status: 'muted', bic: 'muted', date: 'info' };
const TYPE_LABEL = { item: 'Item', action: 'Action', note: 'Note', rfi: 'RFI', vc: 'VC', submission: 'Sub', status: 'Status', bic: 'BIC', date: 'Date' };

export function TypeTag({ kind, blocking }) {
  return (
    <span className={cx('inline-flex justify-center w-14 shrink-0 py-0.5 border font-mono text-[11px] uppercase tracking-[0.06em]', blocking ? TONES.danger : TONES[TYPE_TONE[kind] || 'muted'])}>
      {TYPE_LABEL[kind] || kind}
    </span>
  );
}

export function Skeleton({ className, style }) {
  return <div aria-hidden="true" className={cx('skeleton', className)} style={style} />;
}

export function SkeletonRows({ rows = 4, className }) {
  return (
    <div className={cx('flex flex-col gap-2', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10" />)}
    </div>
  );
}
