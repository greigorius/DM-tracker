import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import AppNav from '../components/AppNav.jsx';
import MiniTimeline from '../components/MiniTimeline.jsx';
import { DM_PHASES, PHASE_ORDER } from '../data/mockData.js';
import { assignProjectColors, PROJECT_COLORS } from '../data/colors.js';
import { getCached, setCached } from '../hooks/usePageCache.js';

const C = {
  bg:      '#0a0f1a',
  bgCard:  '#0d1525',
  bgPanel: '#0d1830',
  border:  '#1e2d45',
  grid:    '#1a2540',
  text:    '#e2e8f0',
  textSec: '#94a3b8',
  textMut: '#7b90b0',
  blue:    '#60a5fa',
  green:   '#34d399',
  red:     '#f87171',
  amber:   '#fbbf24',
};

const MONO = "'JetBrains Mono', 'ui-monospace', Consolas, monospace";
const SANS = "'Inter', system-ui, sans-serif";

function toInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.map(p => p[0]).join('').toUpperCase();
}

function SectionLabel({ children, style }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textSec, marginBottom: 10, ...style }}>
      {children}
    </div>
  );
}

function AssigneeChip({ name }) {
  return (
    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1e2d45', border: '1px solid #2d4060', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: C.blue, flexShrink: 0, fontFamily: MONO }}>
      {toInitials(name)}
    </div>
  );
}

function Skeleton({ w = '100%', h = 20, r = 6 }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: '#0d1525', border: '1px solid #1e2d45', animation: 'pulse 1.5s ease-in-out infinite' }} />;
}

export default function AxiomHome() {
  const [projects, setProjects] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [allRFIs,  setAllRFIs]  = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // ── 1. Projects (cache-first) ─────────────────────────────────────────
      let projectsRaw = getCached('projects');
      if (!projectsRaw) {
        projectsRaw = await fetch('/api/projects').then(r => r.json()).catch(() => []);
        if (Array.isArray(projectsRaw)) setCached('projects', projectsRaw);
      }
      if (!Array.isArray(projectsRaw) || cancelled) return;

      const colorMap = assignProjectColors(projectsRaw);
      const enrichedProjects = projectsRaw.map(p => ({
        ...p,
        color:      colorMap.get(p.id) ?? PROJECT_COLORS[0],
        hoursTotal: p.hoursRequired ?? p.hoursTotal ?? 0,
      }));
      if (!cancelled) setProjects(enrichedProjects);

      // ── 2. Items + RFIs in parallel ────────────────────────────────────────
      const [itemResults, rfisRaw] = await Promise.all([
        Promise.all(
          enrichedProjects.map(proj => {
            const cached = getCached(`items:${proj.id}`);
            const req = cached
              ? Promise.resolve(cached)
              : fetch(`/api/projects/${proj.id}/items`)
                  .then(r => r.json())
                  .then(data => { setCached(`items:${proj.id}`, data); return data; })
                  .catch(() => ({ items: [] }));
            return req.then(data => ({
              proj,
              items: (data.items ?? []).map(item => ({
                ...item,
                projectId:    proj.id,
                projectName:  proj.name,
                projectColor: proj.color,
              })),
            }));
          })
        ),
        fetch('/api/rfis').then(r => r.json()).catch(() => []),
      ]);

      if (cancelled) return;

      const items = itemResults.flatMap(r => r.items);
      setAllItems(items);
      setAllRFIs(Array.isArray(rfisRaw) ? rfisRaw : []);
      setLoading(false);
    }

    load().catch(err => { if (!cancelled) { console.warn('[AxiomHome]', err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  // ── Item → project lookup for RFI enrichment ─────────────────────────────
  const itemToProject = useMemo(() => {
    const map = new Map();
    allItems.forEach(item => map.set(item.id, { projectId: item.projectId, projectName: item.projectName }));
    return map;
  }, [allItems]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const rfisOpen = useMemo(() =>
    allRFIs.filter(r => ['Open', 'Pending', 'In Review'].includes(r.status)).length,
    [allRFIs]);

  const tdlOpen = useMemo(() =>
    allItems.reduce((n, i) => n + (i.tdlCount ?? 0), 0),
    [allItems]);

  const drawings = useMemo(() =>
    allItems.reduce((n, i) => n + (i.drawingCount ?? 0), 0),
    [allItems]);

  const actionReq = useMemo(() =>
    allItems.filter(i => ['On Hold', 'Blocked', 'On Hold - RFIs'].includes(i.status)).length,
    [allItems]);

  const inProduction = useMemo(() =>
    allItems.filter(i => i.inProduction || ['Pre-Production', 'In Manufacture'].includes(i.status)).length,
    [allItems]);

  // ── Open RFIs enriched with project name ──────────────────────────────────
  const openRFIs = useMemo(() =>
    allRFIs
      .filter(r => ['Open', 'Pending', 'In Review'].includes(r.status))
      .slice(0, 5)
      .map(r => {
        const info = r.relatedItemIds?.[0] ? itemToProject.get(r.relatedItemIds[0]) : null;
        return { ...r, projectName: info?.projectName ?? null };
      }),
    [allRFIs, itemToProject]);

  // ── Team workload — derive from data, top 7 by item count ─────────────────
  const byAssignee = useMemo(() => {
    const map = new Map();
    allItems.forEach(item => {
      if (!item.assignee) return;
      const key = toInitials(item.assignee);
      if (!map.has(key)) map.set(key, { a: key, fullName: item.assignee, n: 0, rfis: 0 });
      const e = map.get(key);
      e.n++;
      e.rfis += item.rfiCount ?? 0;
    });
    return [...map.values()].sort((a, b) => b.n - a.n).slice(0, 7);
  }, [allItems]);

  const maxAssigneeN = useMemo(() => Math.max(...byAssignee.map(x => x.n), 1), [byAssignee]);

  // ── Phase distribution ────────────────────────────────────────────────────
  const phases = useMemo(() =>
    PHASE_ORDER
      .map(ph => ({ ph, n: allItems.filter(i => i.dmPhase === ph).length, cfg: DM_PHASES.find(p => p.key === ph) }))
      .filter(x => x.n > 0 && x.cfg),
    [allItems]);

  const phaseTotal = useMemo(() => phases.reduce((acc, x) => acc + x.n, 0), [phases]);

  // ── Lookahead items ───────────────────────────────────────────────────────
  const timelineItems = useMemo(() =>
    allItems
      .filter(i => !['Design Complete', 'Complete'].includes(i.status))
      .slice(0, 5),
    [allItems]);

  const projectCount = projects.length;

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: C.bg, color: C.text, fontFamily: SANS, padding: '24px 32px', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ marginBottom: 4, flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>AXIOM Home</h1>
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMut, marginTop: 4 }}>
          v3 · Health pulse — what matters today
          {!loading && <span style={{ marginLeft: 12, color: '#2d4060' }}>
            {projectCount} project{projectCount !== 1 ? 's' : ''} · {allItems.length} items
          </span>}
        </div>
      </div>

      <div style={{ flexShrink: 0 }}>
        <AppNav />
      </div>

      {/* Activity KPIs */}
      <div style={{ flexShrink: 0 }}>
        <SectionLabel style={{ marginBottom: 8 }}>Activity</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 14 }}>
          {[
            { label: 'RFIs Open',       value: rfisOpen,     color: C.red,   sub: `across ${projectCount} project${projectCount !== 1 ? 's' : ''}` },
            { label: 'Open TDL',        value: tdlOpen,      color: C.text,  sub: 'To-Do list items' },
            { label: 'Drawings',        value: drawings,     color: C.blue,  sub: 'Total assigned' },
            { label: 'Action Required', value: actionReq,    color: C.amber, sub: 'On Hold / Blocked' },
            { label: 'In Production',   value: inProduction, color: C.green, sub: 'Pre-Prod / Manufacture' },
          ].map(k => (
            <div key={k.label} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              {loading
                ? <Skeleton w={44} h={38} r={4} />
                : <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, color: k.color, minWidth: 44 }}>{k.value}</div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textSec, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>{k.label}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMut, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 14, flexShrink: 0 }}>

        {/* Col 1 — Projects */}
        <div>
          <SectionLabel>Projects</SectionLabel>
          {loading
            ? [1, 2, 3].map(i => <Skeleton key={i} h={82} r={10} style={{ marginBottom: 8 }} />)
            : projects.slice(0, 3).map(p => {
                const projItems = allItems.filter(i => i.projectId === p.id);
                const projRfis  = allRFIs.filter(r => {
                  const info = r.relatedItemIds?.[0] ? itemToProject.get(r.relatedItemIds[0]) : null;
                  return info?.projectId === p.id && ['Open', 'Pending', 'In Review'].includes(r.status);
                }).length;
                const total = p.hoursTotal ?? 0;
                const spent = p.hoursSpent ?? 0;
                const pct   = total > 0 ? Math.round((spent / total) * 100) : 0;
                return (
                  <Link key={p.id} to={`/project/${p.id}`} style={{ textDecoration: 'none', display: 'block', marginBottom: 8 }}>
                    <div
                      style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `3px solid ${p.color}`, borderRadius: 10, padding: '12px 16px', cursor: 'pointer', transition: 'border-color 0.12s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = p.color; e.currentTarget.style.borderLeftColor = p.color; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.borderLeftColor = p.color; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: C.text }}>{p.name}</span>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMut, flexShrink: 0 }}>{projItems.length} items</span>
                      </div>
                      <div style={{ height: 6, background: '#121a2e', borderRadius: 3, marginBottom: 8 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: p.color, borderRadius: 3 }} />
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 10, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: C.textSec }}>{spent}h / {total}h · {pct}%</span>
                        <span style={{ color: projRfis > 0 ? C.red : C.textMut }}>{projRfis} open RFIs</span>
                      </div>
                    </div>
                  </Link>
                );
              })
          }
        </div>

        {/* Col 2 — Top open RFIs */}
        <div>
          <SectionLabel>Top open RFIs</SectionLabel>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '4px 0' }}>
            {loading
              ? [1, 2, 3, 4, 5].map(i => (
                  <div key={i} style={{ padding: '11px 16px', borderBottom: `1px solid ${C.grid}` }}>
                    <Skeleton h={14} r={3} />
                    <Skeleton w="60%" h={10} r={3} style={{ marginTop: 6 }} />
                  </div>
                ))
              : openRFIs.length === 0
              ? <div style={{ padding: '16px', fontFamily: MONO, fontSize: 11, color: C.textMut, textAlign: 'center' }}>No open RFIs</div>
              : openRFIs.map(r => (
                  <Link key={r.id} to="/trackers/rfis" style={{ textDecoration: 'none', display: 'block' }}>
                    <div
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 16px', borderBottom: `1px solid ${C.grid}`, transition: 'background 0.1s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#111c30'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.blue, flexShrink: 0, paddingTop: 2 }}>
                        RFI-{String(r.rfiNumber ?? '?').padStart(3, '0')}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4 }}>{r.description}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                          {r.projectName && <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMut }}>{r.projectName}</span>}
                          {r.tbcBy && <span style={{ fontFamily: MONO, fontSize: 10, color: C.amber }}>TBC: {r.tbcBy}</span>}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))
            }
          </div>
        </div>

        {/* Col 3 — Team workload */}
        <div>
          <SectionLabel>Team workload</SectionLabel>
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
            {loading
              ? [1, 2, 3, 4, 5].map(i => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <Skeleton w={28} h={28} r={14} />
                    <Skeleton h={8} r={4} style={{ flex: 1 }} />
                    <Skeleton w={60} h={12} r={3} />
                  </div>
                ))
              : byAssignee.length === 0
              ? <div style={{ fontFamily: MONO, fontSize: 11, color: C.textMut }}>No assignee data</div>
              : byAssignee.map(x => {
                  const pct = (x.n / maxAssigneeN) * 100;
                  return (
                    <div key={x.a} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <AssigneeChip name={x.fullName} />
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 8, background: '#121a2e', borderRadius: 4 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: C.blue, borderRadius: 4 }} />
                        </div>
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.textSec, width: 60, textAlign: 'right' }}>{x.n} items</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: x.rfis ? C.red : C.textMut, width: 52, textAlign: 'right' }}>{x.rfis ? `${x.rfis} RFIs` : '—'}</span>
                    </div>
                  );
                })
            }
          </div>
        </div>
      </div>

      {/* Phase distribution */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <SectionLabel style={{ marginBottom: 0 }}>Phase distribution</SectionLabel>
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMut }}>Total · {phaseTotal}</span>
        </div>
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
          {loading || phases.length === 0
            ? <Skeleton h={44} r={6} />
            : (
              <div style={{ display: 'flex', gap: 3, height: 44, borderRadius: 6, overflow: 'hidden' }}>
                {phases.map(x => (
                  <div
                    key={x.ph}
                    title={`${x.ph} · ${x.n} items`}
                    style={{ flex: x.n, background: x.cfg.text, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#000', padding: '4px 8px' }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>{x.n}</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700 }}>{x.ph}</span>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      </div>

      {/* Lookahead */}
      <div style={{ flexShrink: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <SectionLabel>Lookahead</SectionLabel>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {loading
            ? <Skeleton h={120} r={12} />
            : <MiniTimeline items={timelineItems} />
          }
        </div>
      </div>

    </div>
  );
}
