// Preview & send the DT summary emails. Renders on the server from the
// snapshot, shows each email as it will arrive, then sends one DT at a time
// through the webhook so every person gets their own result.
import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Check, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button, Badge, SkeletonRows, cx } from '../../components/ui/index.js';
import { api } from '../../lib/api.js';

export function EmailPreview({ dtIds, onClose }) {
  const { data, isPending, error } = useQuery({
    queryKey: ['team-email-preview', dtIds?.join(',') || 'all'],
    queryFn: () => api('/api/team/email/preview', { method: 'POST', body: { dtIds: dtIds || undefined } }),
    staleTime: 0, gcTime: 0,
  });
  const [ticked, setTicked] = useState(null);
  const [active, setActive] = useState(null);
  const [results, setResults] = useState({});
  const [sending, setSending] = useState(false);
  const dialog = useRef(null);

  const emails = useMemo(() => data?.emails || [], [data]);
  useEffect(() => {
    if (!data) return;
    setTicked(new Set(emails.filter(e => e.to).map(e => e.dtId)));
    setActive(emails[0]?.dtId || null);
  }, [data, emails]);
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape' && !sending) onClose(); };
    document.addEventListener('keydown', esc);
    dialog.current?.focus();
    return () => document.removeEventListener('keydown', esc);
  }, [onClose, sending]);

  const current = emails.find(e => e.dtId === active);
  const toSend = emails.filter(e => ticked?.has(e.dtId) && e.to && !results[e.dtId]?.ok);
  const toggle = id => setTicked(t => { const n = new Set(t); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const send = async () => {
    setSending(true);
    for (const e of toSend) {
      setResults(r => ({ ...r, [e.dtId]: { pending: true } }));
      try {
        const { results: [res] } = await api('/api/team/email/send', { method: 'POST', body: { dtIds: [e.dtId] } });
        setResults(r => ({ ...r, [e.dtId]: res }));
      } catch (err) {
        setResults(r => ({ ...r, [e.dtId]: { ok: false, error: err.message } }));
      }
    }
    setSending(false);
  };

  const sentOk = Object.values(results).filter(r => r.ok).length;
  const failed = Object.values(results).filter(r => r.ok === false).length;

  return (
    <div className="fixed inset-0 z-50 bg-ground/80 flex items-stretch sm:items-center justify-center sm:p-6" onPointerDown={e => { if (e.target === e.currentTarget && !sending) onClose(); }}>
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Preview DT emails" className="bg-surface border border-line-strong w-full max-w-[1200px] h-full sm:h-[88vh] flex flex-col outline-none">
        <div className="flex items-center gap-3 px-4 min-h-14 border-b border-line">
          <h2 className="m-0 text-[16px] font-semibold">DT summary emails</h2>
          {data?.windowEnd && <span className="font-mono text-[12px] text-muted">Overdue + due by {data.windowEnd}</span>}
          <button type="button" onClick={onClose} disabled={sending} aria-label="Close" className="ml-auto min-h-11 min-w-11 inline-flex items-center justify-center bg-transparent border-0 text-muted hover:text-text cursor-pointer"><X size={18} /></button>
        </div>

        {isPending ? <div className="p-4"><SkeletonRows rows={8} /></div>
          : error ? <p className="m-0 p-4 text-danger text-[14px]">Couldn’t build the preview: {error.message}</p>
          : (
            <div className="flex-1 min-h-0 flex flex-col md:flex-row">
              <div className="md:w-[340px] shrink-0 border-b md:border-b-0 md:border-r border-line overflow-y-auto max-h-[38vh] md:max-h-none">
                {!data.configured && (
                  <p className="m-0 px-4 py-3 border-b border-line text-[13px] text-danger flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> Webhook not configured — set TEAM_EMAIL_WEBHOOK_URL in .env and restart the API. You can still preview.</p>
                )}
                {data.noEmail.length > 0 && (
                  <p className="m-0 px-4 py-3 border-b border-line text-[13px] text-accent flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> No email on file for {data.noEmail.map(x => x.name).join(', ')} — add it in Triage → Team.</p>
                )}
                {emails.length === 0 && <p className="m-0 px-4 py-3 text-[14px] text-muted">Nobody has anything overdue or due in the next two weeks.</p>}
                <ul className="m-0 p-0 list-none">
                  {emails.map(e => {
                    const res = results[e.dtId];
                    return (
                      <li key={e.dtId} className={cx('border-b border-line flex items-center', active === e.dtId && 'bg-surface-hi')}>
                        <label className="pl-4 min-h-14 inline-flex items-center cursor-pointer">
                          <input type="checkbox" aria-label={`Send to ${e.name}`} disabled={!e.to || sending || res?.ok} checked={!!ticked?.has(e.dtId) && !!e.to} onChange={() => toggle(e.dtId)} className="w-5 h-5 accent-accent" />
                        </label>
                        <button type="button" onClick={() => setActive(e.dtId)} className="flex-1 min-w-0 min-h-14 px-3 py-2 text-left bg-transparent border-0 cursor-pointer text-text">
                          <span className="block text-[14px] truncate">{e.name}</span>
                          <span className="block font-mono text-[11px] text-muted truncate">{e.to || 'no email'} · {e.meta.openCount} open{e.meta.overdueCount ? ` · ${e.meta.overdueCount} overdue` : ''}{e.undated ? ` · ${e.undated} undated` : ''}</span>
                        </button>
                        <span className="pr-3">
                          {res?.pending && <Badge tone="info">Sending…</Badge>}
                          {res?.ok && <Badge tone="ok"><Check size={11} className="mr-1" />Sent</Badge>}
                          {res?.ok === false && <Badge tone="danger" className="max-w-[120px] truncate" title={res.error}>Failed</Badge>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {data.skipped.length > 0 && (
                  <p className="m-0 px-4 py-3 font-mono text-[11px] text-muted">Nothing in scope (skipped): {data.skipped.map(x => `${x.name}${x.undated ? ` (${x.undated} undated)` : ''}`).join(', ')}</p>
                )}
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                {current ? <>
                  <div className="px-4 py-2 border-b border-line font-mono text-[12px] text-text-2">
                    <div>To: {current.to ? `${current.name} <${current.to}>` : <span className="text-danger">no email address</span>}</div>
                    <div>Subject: {current.subject}</div>
                    {results[current.dtId]?.ok === false && <div className="text-danger">Error: {results[current.dtId].error}</div>}
                  </div>
                  <iframe title={`Email to ${current.name}`} srcDoc={current.html} sandbox="" className="flex-1 w-full bg-white border-0" />
                </> : <p className="m-0 p-4 text-[14px] text-muted">Pick a DT to see their email.</p>}
              </div>
            </div>
          )}

        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-line">
          <span className="font-mono text-[12px] text-muted">
            {sentOk || failed ? `${sentOk} sent${failed ? ` · ${failed} failed` : ''}` : `${toSend.length} selected`} · sent from gfdc.dt1@gmail.com via Make
          </span>
          <Button variant="secondary" className="ml-auto" onClick={onClose} disabled={sending}>{sentOk ? 'Done' : 'Cancel'}</Button>
          <Button onClick={send} disabled={!data?.configured || sending || toSend.length === 0}>
            {sending ? 'Sending…' : failed && !toSend.some(e => !results[e.dtId]) ? `Retry ${toSend.length}` : `Send ${toSend.length}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
