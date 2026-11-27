import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useBootstrap, useSyncNow } from '../../hooks/hub.js';
import { useToast } from './Toast.jsx';
import { cx } from './primitives.jsx';
import { HubNav } from './HubNav.jsx';

export function timeAgo(iso, now = Date.now()) {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect x="2" y="2" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M10 23 16 9l6 14M12.5 18h7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
    </svg>
  );
}

export function AppHeader({ title, subtitle }) {
  const { data } = useBootstrap();
  const sync = useSyncNow();
  const qc = useQueryClient();
  const toast = useToast();
  const now = useNow();
  const syncedAt = data?.syncedAt;
  const stale = syncedAt && now - Date.parse(syncedAt) > 15 * 60_000;
  const date = new Date(now).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });

  const onSync = () => sync.mutate(undefined, {
    onSuccess: r => {
      const changed = (r?.results || []).reduce((n, x) => n + (x.changed || 0), 0);
      const building = r?.needsFull?.length || 0;
      if (building) {
        toast.show(r.rebuilding
          ? `Building ${building} list${building === 1 ? '' : 's'} from Notion. This takes a few minutes; pages fill in as each one finishes.`
          : `${building} list${building === 1 ? '' : 's'} still need a full build from Notion, which runs every 5 minutes.`, { ms: 10000 });
        // Pick up the rebuilt snapshots without another click
        [60, 180, 420].forEach(s => setTimeout(() => qc.invalidateQueries(), s * 1000));
      } else {
        toast.show(`Synced · ${changed} change${changed === 1 ? '' : 's'} pulled from Notion`);
      }
    },
    onError: e => toast.show(`Sync failed: ${e.message}`, { tone: 'danger' }),
  });

  return (
    <header className="bg-bar border-b border-line">
      <div className="mx-auto max-w-[1920px] px-4 sm:px-6 min-h-16 flex flex-wrap items-center gap-x-5 gap-y-2 py-2">
        <Link to="/" className="flex items-center gap-2.5 text-accent no-underline min-h-11" aria-label="Axiom DL Hub — Cockpit">
          <LogoMark className="w-7 h-7" />
          <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-text-2 hidden sm:inline">Axiom DL Hub</span>
        </Link>
        <span className="hidden sm:block w-px h-6 bg-line" aria-hidden="true" />
        <div className="flex items-baseline gap-3 min-w-0">
          <h1 className="m-0 text-[20px] font-semibold tracking-[-0.01em] truncate">{title}</h1>
          {subtitle && <span className="hidden md:inline font-mono text-[12px] text-muted truncate">{subtitle}</span>}
        </div>
        <div className="ml-auto flex items-center gap-4">
          <span className="hidden md:inline font-mono text-[12px] text-muted">{date}</span>
          <span className="font-mono text-[12px] text-muted inline-flex items-center gap-2" aria-live="polite">
            <span className={cx('w-2 h-2', sync.isPending ? 'bg-accent animate-pulse' : stale || !syncedAt ? 'bg-danger' : 'bg-ok')} aria-hidden="true" />
            {sync.isPending ? 'Syncing…' : `Synced ${timeAgo(syncedAt, now)}`}
          </span>
          <button
            type="button"
            onClick={onSync}
            disabled={sync.isPending}
            className="min-h-11 px-3 inline-flex items-center gap-2 border border-line-strong bg-transparent text-text-2 hover:bg-surface-hi font-mono text-[12px] uppercase tracking-[0.08em] cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={sync.isPending ? 'animate-spin' : ''} aria-hidden="true" />
            Sync now
          </button>
        </div>
      </div>
      <HubNav />
    </header>
  );
}

// Every Hub page renders inside this: same header, nav, width and gutters.
export function PageShell({ title, subtitle, toolbar, children }) {
  return (
    <div className="hub">
      <AppHeader title={title} subtitle={subtitle} />
      <main className="mx-auto max-w-[1920px] px-4 sm:px-6 py-6 flex flex-col gap-6">
        {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
        {children}
      </main>
    </div>
  );
}
