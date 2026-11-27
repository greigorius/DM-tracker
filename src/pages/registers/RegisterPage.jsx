// Register page with Notion-style views: pick columns (and their order), stack
// filters on any field, sort, group, then save the lot as a named view (kept in
// the Hub store, so it follows you between devices) and export exactly what's
// on screen to Excel or CSV. Used by Drawings, RFIs, Variations and Finishes.
import { useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, X, Plus, Download, Columns3, Filter, Save } from 'lucide-react';
import { PageShell, Badge, Card, SkeletonRows, cx, useToast } from '../../components/ui/index.js';
import { ToolbarSelect, SearchBox, ToolbarButton, DataTable, TableGroup } from '../../components/ui/table.jsx';
import { useSnapshots, useRegisterViews, useSaveRegisterViews } from '../../hooks/hub.js';
import { londonToday } from '../../../hub-core/derive.js';
import {
  OPS, NO_VALUE, defaultOp, matchesView, optionsFor, groupKeyOf, groupLabelOf, fmtDate, sortValueOf, ruleText,
  exportXlsx, exportViewCsv,
} from './engine.js';

const NO_STATUS = 'No status';
const ctl = 'min-h-11 px-3 bg-ground border border-line-strong text-text-2 text-[13px] outline-none focus:border-accent';
const small = 'min-h-9 px-2 bg-ground border border-line-strong text-text-2 text-[13px] outline-none focus:border-accent';
const ls = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const newId = () => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const VIEW_KEYS = ['project', 'statusMode', 'statuses', 'q', 'columns', 'filters', 'match', 'sort', 'group'];
const same = (a, b) => VIEW_KEYS.every(k => JSON.stringify(a?.[k] ?? null) === JSON.stringify(b?.[k] ?? null));
const pick = v => Object.fromEntries(VIEW_KEYS.map(k => [k, v[k]]));

function defaultRender(f) {
  return (r, ctx) => {
    const v = f.get(r, ctx);
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return <span className="text-muted">—</span>;
    if (f.type === 'date') return <span className="font-mono text-[12px] text-text-2 whitespace-nowrap">{fmtDate(v)}</span>;
    if (f.type === 'bool') return v ? <Badge tone="ok">Yes</Badge> : null;
    if (f.type === 'number') return <span className="font-mono text-[12px] text-text-2 tabular-nums">{v}</span>;
    if (Array.isArray(v)) return <span className="flex flex-wrap gap-1">{v.map(x => <Badge key={x}>{x}</Badge>)}</span>;
    return <span className="text-text-2">{String(v)}</span>;
  };
}

// ── Value editor for one filter rule ────────────────────────────────────────
function RuleValue({ field, rule, onChange, options }) {
  if (!field || NO_VALUE.has(rule.op)) return null;
  if (field.type === 'select') {
    const cur = Array.isArray(rule.value) ? rule.value : rule.value ? [rule.value] : [];
    const toggle = o => onChange(cur.includes(o) ? cur.filter(x => x !== o) : [...cur, o]);
    return (
      <span className="flex flex-wrap gap-1 max-w-[640px]">
        {options.length ? options.map(o => (
          <button key={o} type="button" aria-pressed={cur.includes(o)} onClick={() => toggle(o)}
            className={cx('min-h-8 px-2 border text-[12px] cursor-pointer', cur.includes(o) ? 'bg-surface-hi border-accent text-accent' : 'bg-transparent border-line-strong text-text-2')}>{o}</button>
        )) : <span className="text-[12px] text-muted">No values in this register</span>}
      </span>
    );
  }
  if (field.type === 'date') {
    if (rule.op === 'between') {
      const [a, b] = Array.isArray(rule.value) ? rule.value : ['', ''];
      return <span className="flex items-center gap-1"><input type="date" value={a || ''} onChange={e => onChange([e.target.value, b || ''])} className={small} />–<input type="date" value={b || ''} onChange={e => onChange([a || '', e.target.value])} className={small} /></span>;
    }
    if (rule.op === 'last_n' || rule.op === 'next_n') return <input type="number" min="0" value={rule.value ?? ''} onChange={e => onChange(e.target.value)} className={cx(small, 'w-20')} aria-label="Days" />;
    return <input type="date" value={rule.value || ''} onChange={e => onChange(e.target.value)} className={small} aria-label="Date" />;
  }
  if (field.type === 'number') return <input type="number" value={rule.value ?? ''} onChange={e => onChange(e.target.value)} className={cx(small, 'w-28')} aria-label="Value" />;
  return <input type="text" value={rule.value ?? ''} onChange={e => onChange(e.target.value)} className={cx(small, 'w-56')} placeholder="Value" aria-label="Value" />;
}

function FilterPanel({ view, setView, fields, fieldsByKey, all, ctx }) {
  const filterable = fields.filter(f => f.filter !== false);
  const rules = view.filters || [];
  const put = (i, patch) => setView({ filters: rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const add = () => { const f = filterable[0]; setView({ filters: [...rules, { field: f.key, op: defaultOp(f.type), value: null }] }); };
  return (
    <Card className="p-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-2">
        Show rows that match
        <select value={view.match || 'all'} onChange={e => setView({ match: e.target.value })} className={small} aria-label="Match"><option value="all">all</option><option value="any">any</option></select>
        of these filters
      </div>
      {rules.map((r, i) => {
        const f = fieldsByKey.get(r.field);
        return (
          <div key={i} className="flex flex-wrap items-center gap-2 py-1.5 border-t border-line">
            <select aria-label="Field" value={r.field} onChange={e => { const nf = fieldsByKey.get(e.target.value); put(i, { field: nf.key, op: defaultOp(nf.type), value: null }); }} className={small}>
              {filterable.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
            <select aria-label="Condition" value={r.op} onChange={e => put(i, { op: e.target.value, value: e.target.value === 'between' ? ['', ''] : r.op === 'between' ? null : r.value })} className={small}>
              {(OPS[f?.type] || OPS.text).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <RuleValue field={f} rule={r} onChange={v => put(i, { value: v })} options={f?.type === 'select' ? optionsFor(f, all, ctx) : []} />
            <button type="button" aria-label="Remove filter" onClick={() => setView({ filters: rules.filter((_, j) => j !== i) })} className="min-h-9 w-9 inline-flex items-center justify-center bg-transparent border-0 text-muted hover:text-danger cursor-pointer"><X size={15} /></button>
          </div>
        );
      })}
      <div className="flex gap-2 pt-1">
        <ToolbarButton onClick={add}><Plus size={14} aria-hidden="true" /> Add filter</ToolbarButton>
        {rules.length > 0 && <ToolbarButton onClick={() => setView({ filters: [] })}>Clear filters</ToolbarButton>}
      </div>
    </Card>
  );
}

function ColumnsPanel({ view, setView, fields, defaults }) {
  const shown = view.columns?.length ? view.columns : defaults;
  const set = new Set(shown);
  const move = (k, d) => { const a = [...shown]; const i = a.indexOf(k); const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setView({ columns: a }); };
  const toggle = k => setView({ columns: set.has(k) ? shown.filter(x => x !== k) : [...shown, k] });
  const hidden = fields.filter(f => !set.has(f.key));
  const byKey = new Map(fields.map(f => [f.key, f]));
  return (
    <Card className="p-3 grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-1">
        <span className="section-label text-[11px]">Shown, in order · {shown.length}</span>
        {shown.map((k, i) => byKey.get(k) && (
          <span key={k} className="flex items-center gap-2 min-h-9 px-2 bg-surface-hi border border-line">
            <input type="checkbox" checked onChange={() => toggle(k)} className="w-4 h-4 accent-[var(--color-accent)]" aria-label={`Hide ${byKey.get(k).label}`} />
            <span className="flex-1 text-[13px]">{byKey.get(k).label}</span>
            <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(k, -1)} className="min-h-8 w-8 bg-transparent border-0 text-muted hover:text-text disabled:opacity-30 cursor-pointer"><ArrowUp size={14} /></button>
            <button type="button" aria-label="Move down" disabled={i === shown.length - 1} onClick={() => move(k, 1)} className="min-h-8 w-8 bg-transparent border-0 text-muted hover:text-text disabled:opacity-30 cursor-pointer"><ArrowDown size={14} /></button>
          </span>
        ))}
        <span className="flex gap-2 pt-1">
          <ToolbarButton onClick={() => setView({ columns: defaults })}>Reset columns</ToolbarButton>
          <ToolbarButton onClick={() => setView({ columns: fields.map(f => f.key) })}>Show all</ToolbarButton>
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="section-label text-[11px]">Hidden · {hidden.length}</span>
        <div className="flex flex-col gap-1 max-h-[420px] overflow-y-auto">
          {hidden.map(f => (
            <label key={f.key} className="flex items-center gap-2 min-h-9 px-2 border border-line cursor-pointer hover:bg-surface-hi">
              <input type="checkbox" checked={false} onChange={() => toggle(f.key)} className="w-4 h-4 accent-[var(--color-accent)]" />
              <span className="text-[13px] text-text-2">{f.label}</span>
              {f.hint && <span className="font-mono text-[11px] text-muted">{f.hint}</span>}
            </label>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ── The page ────────────────────────────────────────────────────────────────
export function RegisterPage({
  id, title, subtitle, db, extraDbs = [], statusOf, statusTone, openStatuses, openLabel = 'Open only',
  fields: fieldsFn, defaultColumns, starterViews = [], projectOf, initialSort, defaultGroup = 'item', searchText, filename,
}) {
  const toast = useToast();
  const { data, isPending } = useSnapshots([db, 'tasks', 'projects', 'team', ...extraDbs]);
  const { data: saved } = useRegisterViews();
  const saveViews = useSaveRegisterViews();
  const today = londonToday();

  const ctx = useMemo(() => {
    const items = new Map(data.tasks.map(i => [i.id, i]));
    const projects = new Map(data.projects.map(p => [p.id, p.title]));
    const team = new Map(data.team.map(p => [p.id, p.title]));
    const c = { data, items, projects, team, itemOf: r => items.get(r.itemIds?.[0]), vcs: new Map((data.variations || []).map(v => [v.id, v])) };
    c.projectOf = projectOf ? r => projectOf(r, c) : r => items.get(r.itemIds?.[0])?.projectId ?? null;
    return c;
  }, [data, projectOf]);
  const fields = useMemo(() => fieldsFn(ctx), [fieldsFn, ctx]);
  const fieldsByKey = useMemo(() => new Map(fields.map(f => [f.key, f])), [fields]);

  // Views: Default + starters (from code) + saved (Hub store)
  const base = useMemo(() => ({ id: 'default', name: 'Default', project: 'all', statusMode: 'open', statuses: [], q: '', columns: defaultColumns, filters: [], match: 'all', sort: initialSort || null, group: defaultGroup }), [defaultColumns, initialSort, defaultGroup]);
  const mine = useMemo(() => saved?.views?.[id] || [], [saved, id]);
  const starters = useMemo(() => starterViews.map(v => ({ ...base, ...v, id: `starter:${v.id}`, starter: true })), [starterViews, base]);
  const allViews = useMemo(() => [base, ...mine.map(v => ({ ...base, ...v })), ...starters], [base, mine, starters]);
  const [panel, setPanel] = useState(''); // '' | 'columns' | 'filter'
  const [activeId, setActiveIdRaw] = useState(() => ls.get(`hub.reg.${id}.view`, ''));
  const setActiveId = v => { setActiveIdRaw(v); ls.set(`hub.reg.${id}.view`, v); };
  const myDefault = mine.find(v => v.isDefault)?.id;
  const active = allViews.find(v => v.id === activeId) || allViews.find(v => v.id === myDefault) || base;
  const [draft, setDraftRaw] = useState(() => { try { return JSON.parse(ls.get(`hub.reg.${id}.draft`, 'null')); } catch { return null; } });
  const setDraft = v => { setDraftRaw(v); ls.set(`hub.reg.${id}.draft`, JSON.stringify(v)); };
  // A draft only belongs to the view it was made from
  const view = draft && draft.from === active.id ? { ...active, ...draft.v } : active;
  const edited = draft && draft.from === active.id && !same({ ...active, ...draft.v }, active);
  const setView = patch => setDraft({ from: active.id, v: { ...pick(view), ...patch } });
  const switchTo = vid => { setActiveId(vid); setDraft(null); setPanel(''); };

  const [naming, setNaming] = useState(null); // null | { mode: 'new' | 'rename', name }
  const [closedGroups, setClosedGroups] = useState({});

  const persist = (list, msg) => saveViews.mutate({ register: id, views: list }, {
    onSuccess: () => msg && toast.show(msg),
    onError: e => toast.show(`Views not saved: ${e.message}`, { tone: 'danger' }),
  });
  const saveCurrent = () => {
    if (active.id === 'default' || active.starter) { setNaming({ mode: 'new', name: active.starter ? active.name : '' }); return; }
    persist(mine.map(v => (v.id === active.id ? { ...v, ...pick(view) } : v)), `Saved "${active.name}"`);
    setDraft(null);
  };
  const commitName = () => {
    const name = naming.name.trim(); if (!name) return;
    if (naming.mode === 'new') {
      const nv = { id: newId(), name, ...pick(view) };
      persist([...mine, nv], `Saved view "${name}"`); setNaming(null); setDraft(null); setActiveId(nv.id);
    } else { persist(mine.map(v => (v.id === active.id ? { ...v, name } : v)), 'Renamed'); setNaming(null); }
  };
  const remove = () => {
    if (!window.confirm(`Delete the view "${active.name}"?`)) return;
    persist(mine.filter(v => v.id !== active.id), 'View deleted'); switchTo('default');
  };
  const makeDefault = () => persist(mine.map(v => ({ ...v, isDefault: v.id === active.id ? !v.isDefault : false })), active.isDefault ? 'No longer the default' : `"${active.name}" opens by default`);

  // Rows
  const all = data[db];
  const projectOptions = useMemo(() => {
    const idsSet = new Set(all.map(ctx.projectOf).filter(Boolean));
    return [...idsSet].map(pid => ({ value: pid, label: ctx.projects.get(pid) || 'Unknown project' })).sort((a, b) => a.label.localeCompare(b.label));
  }, [all, ctx]);
  const picked = useMemo(() => new Set(view.statuses || []), [view.statuses]);
  const inProject = r => view.project === 'all' || ctx.projectOf(r) === view.project;
  const rows = useMemo(() => {
    const needle = (view.q || '').trim().toLowerCase();
    return all.filter(r => {
      if (r.archived) return false;
      if (!inProject(r)) return false;
      const s = statusOf(r);
      if (picked.size) { if (!picked.has(s || NO_STATUS)) return false; }
      else if (view.statusMode === 'open' && !openStatuses.has(s)) return false;
      if (needle && !searchText(r, ctx).toLowerCase().includes(needle)) return false;
      return matchesView(view, fieldsByKey, r, ctx, today);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, view, picked, ctx, fieldsByKey, today, statusOf, openStatuses, searchText]);
  const counts = useMemo(() => {
    const m = new Map();
    for (const r of all) if (!r.archived && inProject(r)) { const s = statusOf(r) || NO_STATUS; m.set(s, (m.get(s) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, view.project, ctx, statusOf]);
  const togglePicked = s => setView({ statuses: picked.has(s) ? [...picked].filter(x => x !== s) : [...picked, s] });

  // Sort, columns, groups
  const sortField = view.sort && fieldsByKey.get(view.sort.key);
  const sorted = useMemo(() => {
    if (!sortField) return rows;
    const val = sortValueOf(sortField);
    const dir = view.sort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const x = val(a, ctx), y = val(b, ctx);
      if (x == null || x === '') return (y == null || y === '') ? 0 : 1;
      if (y == null || y === '') return -1;
      return dir * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true }));
    });
  }, [rows, sortField, view.sort, ctx]);
  const groupField = view.group && view.group !== 'none' ? fieldsByKey.get(view.group) : null;
  const shownFields = useMemo(() => (view.columns?.length ? view.columns : defaultColumns).map(k => fieldsByKey.get(k)).filter(Boolean)
    .filter(f => !groupField || f.key !== groupField.key), [view.columns, defaultColumns, fieldsByKey, groupField]);
  const cols = shownFields.map(f => ({
    key: f.key, label: f.label, width: f.width, cellClassName: f.cellClassName,
    render: r => (f.render ? f.render(r, ctx) : defaultRender(f)(r, ctx)),
  }));
  const groups = useMemo(() => {
    if (!groupField) return [{ key: 'all', label: null, rows: sorted }];
    const m = new Map();
    for (const r of sorted) { const k = groupKeyOf(groupField, r, ctx) ?? '—'; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return [...m.entries()].map(([key, rs]) => ({ key, label: groupLabelOf(groupField, key), rows: rs }))
      .sort((a, b) => (a.key === '—') - (b.key === '—') || String(groupField.type === 'date' ? a.key : a.label).localeCompare(String(groupField.type === 'date' ? b.key : b.label), undefined, { numeric: true }));
  }, [sorted, groupField, ctx]);
  const onSort = key => {
    const s = view.sort;
    setView({ sort: s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' } });
  };

  const stamp = today.split('-').reverse().join('-');
  const base_ = `${filename}${active.id === 'default' ? '' : `_${active.name.replace(/[^\w-]+/g, '-')}`}_${stamp}`;
  const exp = kind => {
    const args = { fileName: `${base_}.${kind}`, sheet: active.name, title: `${title} · ${active.name}${view.project !== 'all' ? ` · ${ctx.projects.get(view.project) || ''}` : ''}`, fields: shownFields, groups, ctx, groupField };
    if (kind === 'csv') exportViewCsv(args);
    else exportXlsx(args).catch(e => toast.show(`Export failed: ${e.message}`, { tone: 'danger' }));
  };
  const groupable = fields.filter(f => f.group !== false && ['select', 'text', 'bool', 'date'].includes(f.type));

  const toolbar = (
    <div className="w-full flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">View</span>
          <select aria-label="View" value={active.id} onChange={e => switchTo(e.target.value)} className={cx(ctl, 'cursor-pointer min-w-[200px] max-w-[320px] text-text')}>
            <option value="default">Default</option>
            {mine.length > 0 && <optgroup label="Saved views">{mine.map(v => <option key={v.id} value={v.id}>{v.name}{v.isDefault ? ' ★' : ''}</option>)}</optgroup>}
            {starters.length > 0 && <optgroup label="Starter views">{starters.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</optgroup>}
          </select>
        </label>
        {edited && <Badge tone="accent">Edited</Badge>}
        {naming ? (
          <span className="inline-flex items-center gap-2">
            <input autoFocus value={naming.name} onChange={e => setNaming({ ...naming, name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setNaming(null); }} placeholder="View name" className={cx(ctl, 'w-56')} aria-label="View name" />
            <ToolbarButton onClick={commitName} className="border-accent text-accent">{naming.mode === 'new' ? 'Save view' : 'Rename'}</ToolbarButton>
            <ToolbarButton onClick={() => setNaming(null)}>Cancel</ToolbarButton>
          </span>
        ) : <>
          {(edited || active.id === 'default' || active.starter) && <ToolbarButton onClick={saveCurrent} className={edited ? 'border-accent text-accent' : ''}><Save size={14} aria-hidden="true" /> {active.id === 'default' || active.starter ? 'Save as view' : 'Save'}</ToolbarButton>}
          {!(active.id === 'default' || active.starter) && <ToolbarButton onClick={() => setNaming({ mode: 'new', name: `${active.name} copy` })}>Save as new</ToolbarButton>}
          {edited && <ToolbarButton onClick={() => setDraft(null)}>Discard changes</ToolbarButton>}
          {!(active.id === 'default' || active.starter) && <>
            <ToolbarButton onClick={() => setNaming({ mode: 'rename', name: active.name })}>Rename</ToolbarButton>
            <ToolbarButton onClick={makeDefault}>{active.isDefault ? 'Unset default' : 'Set default'}</ToolbarButton>
            <ToolbarButton onClick={remove} className="hover:text-danger">Delete</ToolbarButton>
          </>}
        </>}
        <span className="ml-auto inline-flex items-center gap-2">
          <span className="font-mono text-[12px] text-muted">{rows.length} shown</span>
          <ToolbarButton onClick={() => exp('xlsx')} className="border-accent text-accent"><Download size={14} aria-hidden="true" /> Excel</ToolbarButton>
          <ToolbarButton onClick={() => exp('csv')}><Download size={14} aria-hidden="true" /> CSV</ToolbarButton>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={view.q || ''} onChange={v => setView({ q: v })} />
        <ToolbarSelect label="Project" value={view.project || 'all'} onChange={v => setView({ project: v })} options={[{ value: 'all', label: 'All projects' }, ...projectOptions]} />
        <ToolbarSelect label="Status" value={picked.size ? '__picked' : view.statusMode} onChange={v => v !== '__picked' && setView({ statusMode: v, statuses: [] })} options={[
          ...(picked.size ? [{ value: '__picked', label: picked.size === 1 ? [...picked][0] : `${picked.size} statuses` }] : []),
          { value: 'open', label: openLabel }, { value: 'all', label: 'All statuses' },
        ]} />
        <ToolbarSelect label="Group by" value={view.group || 'none'} onChange={v => setView({ group: v })} options={[{ value: 'none', label: 'No grouping' }, ...groupable.map(f => ({ value: f.key, label: `Group: ${f.label}` }))]} />
        <ToolbarSelect label="Sort by" value={view.sort?.key || ''} onChange={v => setView({ sort: v ? { key: v, dir: view.sort?.dir || 'asc' } : null })} options={[{ value: '', label: 'No sort' }, ...fields.map(f => ({ value: f.key, label: `Sort: ${f.label}` }))]} />
        {view.sort && <ToolbarButton onClick={() => setView({ sort: { ...view.sort, dir: view.sort.dir === 'asc' ? 'desc' : 'asc' } })} aria-label="Sort direction">{view.sort.dir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}{view.sort.dir === 'asc' ? 'Asc' : 'Desc'}</ToolbarButton>}
        <ToolbarButton aria-pressed={panel === 'columns'} onClick={() => setPanel(p => (p === 'columns' ? '' : 'columns'))} className={panel === 'columns' ? 'border-accent text-accent' : ''}><Columns3 size={14} aria-hidden="true" /> Columns · {shownFields.length}</ToolbarButton>
        <ToolbarButton aria-pressed={panel === 'filter'} onClick={() => setPanel(p => (p === 'filter' ? '' : 'filter'))} className={panel === 'filter' || view.filters?.length ? 'border-accent text-accent' : ''}><Filter size={14} aria-hidden="true" /> Filter{view.filters?.length ? ` · ${view.filters.length}` : ''}</ToolbarButton>
        {groupField && <>
          <ToolbarButton onClick={() => setClosedGroups({})}>Expand all</ToolbarButton>
          <ToolbarButton onClick={() => setClosedGroups(Object.fromEntries(groups.map(g => [g.key, true])))}>Collapse all</ToolbarButton>
        </>}
      </div>
    </div>
  );

  return (
    <PageShell title={title} subtitle={subtitle} toolbar={toolbar}>
      {panel === 'columns' && <ColumnsPanel view={view} setView={setView} fields={fields} defaults={defaultColumns} />}
      {panel === 'filter' && <FilterPanel view={view} setView={setView} fields={fields} fieldsByKey={fieldsByKey} all={all} ctx={ctx} />}
      {panel !== 'filter' && view.filters?.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{view.match === 'any' ? 'Any of' : 'All of'}</span>
          {view.filters.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 min-h-8 pl-2 pr-1 border border-accent text-[12px] text-text-2">
              <button type="button" onClick={() => setPanel('filter')} className="bg-transparent border-0 p-0 text-inherit cursor-pointer">{ruleText(fieldsByKey.get(f.field), f)}</button>
              <button type="button" aria-label="Remove filter" onClick={() => setView({ filters: view.filters.filter((_, j) => j !== i) })} className="w-6 h-6 inline-flex items-center justify-center bg-transparent border-0 text-muted hover:text-danger cursor-pointer"><X size={13} /></button>
            </span>
          ))}
        </div>
      )}
      {counts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
          {counts.map(([s, n]) => {
            const on = picked.has(s);
            return (
              <button key={s} type="button" aria-pressed={on} onClick={() => togglePicked(s)}
                className={`bg-transparent border-0 p-0 cursor-pointer transition-opacity ${picked.size && !on ? 'opacity-45 hover:opacity-80' : ''}`}>
                <Badge tone={statusTone(s)} className={`py-2 px-2.5 sm:py-1.5 sm:px-2 ${on ? 'bg-surface-hi border-current outline outline-1 outline-current' : ''}`}>
                  {on && <span aria-hidden="true" className="mr-1">✓</span>}{s} · {n}
                </Badge>
              </button>
            );
          })}
          {picked.size > 0 && <button type="button" onClick={() => setView({ statuses: [] })} className="bg-transparent border-0 px-1 py-2 sm:py-1 cursor-pointer font-mono text-[11px] uppercase tracking-[0.08em] text-muted hover:text-text underline underline-offset-2">Clear selection</button>}
        </div>
      )}

      {isPending ? <Card className="p-4"><SkeletonRows rows={10} /></Card> : !groupField ? (
        <Card><DataTable dense columns={cols} rows={sorted} sort={view.sort} onSort={onSort} empty="Nothing matches this view." /></Card>
      ) : groups.length === 0 ? (
        <Card className="p-4 text-[14px] text-muted">Nothing matches this view.</Card>
      ) : groups.map(g => {
        const open = g.rows.filter(r => openStatuses.has(statusOf(r))).length;
        return (
          <TableGroup key={g.key} title={g.label} count={`${g.rows.length}`} open={!closedGroups[g.key]} onToggle={() => setClosedGroups(c => ({ ...c, [g.key]: !c[g.key] }))}
            meta={open > 0 && <Badge tone="accent">{open} open</Badge>}>
            <DataTable dense columns={cols} rows={g.rows} sort={view.sort} onSort={onSort} />
          </TableGroup>
        );
      })}
    </PageShell>
  );
}
