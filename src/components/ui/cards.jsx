import { Link } from 'react-router-dom';
import { ArrowUpRight, ExternalLink } from 'lucide-react';
import { Badge, Skeleton, cx } from './primitives.jsx';
import { timeAgo } from './AppHeader.jsx';

const TONE_TEXT = { accent: 'text-accent', danger: 'text-danger', info: 'text-info', ok: 'text-ok', text: 'text-text' };

export function CountCard({ to, label, value, sub, tone = 'text', subTone, loading, onHover }) {
  return (
    <Link
      to={to}
      onMouseEnter={onHover}
      onFocus={onHover}
      className="group block bg-surface border border-line hover:bg-surface-hi hover:border-line-strong no-underline text-text p-4 min-h-[124px]"
    >
      <div className="font-mono text-[12px] uppercase tracking-[0.14em] text-muted flex justify-between gap-2">
        <span>{label}</span>
        <ArrowUpRight size={14} className="opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
      </div>
      {loading ? (
        <><Skeleton className="h-10 w-16 mt-3" /><Skeleton className="h-3 w-28 mt-3" /></>
      ) : (
        <>
          <div className={cx('figure mt-3 tabular-nums', value ? TONE_TEXT[tone] : 'text-muted')}>{value ?? '—'}</div>
          <div className={cx('mt-2 font-mono text-[12px]', subTone ? TONE_TEXT[subTone] : 'text-muted')}>{sub}</div>
        </>
      )}
    </Link>
  );
}

export function ToolTile({ tool, count, updatedAt, onHover }) {
  const Icon = tool.icon;
  const external = !tool.inHub;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <Icon size={20} className="text-text-2" aria-hidden="true" />
        {count != null && count > 0 && <Badge tone={tool.tone || 'accent'}>{count}</Badge>}
      </div>
      <div className="mt-4 text-[15px] font-semibold flex items-center gap-1.5">
        {tool.name}
        {external && <ExternalLink size={13} className="text-muted" aria-label="opens in a new tab" />}
      </div>
      <div className="mt-1 font-mono text-[11px] text-muted">
        {external ? 'Not in Hub yet' : updatedAt ? `Updated ${timeAgo(updatedAt)}` : tool.path}
      </div>
    </>
  );
  const cls = 'block bg-surface border border-line hover:bg-surface-hi hover:border-line-strong no-underline text-text p-4 min-h-[124px]';
  if (external) {
    if (!tool.href) {
      return <div className={cx(cls, 'opacity-60 hover:bg-surface hover:border-line')} title={`Set ${tool.envVar} to link this tool`}>{body}</div>;
    }
    return <a href={tool.href} target="_blank" rel="noreferrer" className={cls}>{body}</a>;
  }
  return <Link to={tool.path} className={cls} onMouseEnter={onHover} onFocus={onHover}>{body}</Link>;
}
