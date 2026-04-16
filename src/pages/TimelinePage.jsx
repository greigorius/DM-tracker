import { useParams, useNavigate, Link } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import ProjectTimeline from '../components/Timeline/ProjectTimeline.jsx';
import { PROJECT_COLORS, assignProjectColors } from '../data/colors.js';
import AppNav from '../components/AppNav.jsx';
import { getCached, setCached } from '../hooks/usePageCache.js';

export default function TimelinePage() {
  const { projectId } = useParams();
  const navigate      = useNavigate();

  const [projects,      setProjects]      = useState([]);
  const [projLoading,   setProjLoading]   = useState(true);
  const [combinedItems, setCombinedItems] = useState([]);
  const [loadingSet,    setLoadingSet]    = useState(new Set());
  const [refreshKey,    setRefreshKey]    = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const abortRef = useRef(null);

  // Auto-refresh interval (5 minutes)
  useEffect(() => {
    const id = setInterval(() => setRefreshKey(k => k + 1), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // ── Fetch project list ───────────────────────────────────────────────────────
  useEffect(() => {
    const applyProjects = d => {
      const pages = Array.isArray(d) ? d : (d.projects ?? []);
      const colorMap = assignProjectColors(pages);
      setProjects(pages.map(p => ({
        id:     p.id,
        name:   p.name ?? p.properties?.['Project Name']?.title?.[0]?.plain_text ?? p.id,
        status: p.status ?? p.properties?.['Status']?.status?.name ?? '',
        color:  colorMap.get(p.id) ?? PROJECT_COLORS[0],
      })));
    };
    const cached = getCached('projects');
    if (cached) { applyProjects(cached); setProjLoading(false); return; }
    fetch('/api/projects')
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : (d.projects ?? []);
        setCached('projects', list);
        applyProjects(list);
        setLastRefreshed(new Date());
      })
      .catch(() => {})
      .finally(() => setProjLoading(false));
  }, [refreshKey]);

  // ── Combined view: fetch all active projects in parallel ──────────────────────
  useEffect(() => {
    if (projectId || !projects.length) return;

    const active = projects.filter(p => p.status === 'In progress' || p.status === 'Active');
    if (!active.length) return;

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setCombinedItems([]);
    setLoadingSet(new Set(active.map(p => p.id)));

    const mergeItems = (proj, rawItems) => {
      const items = rawItems.map(item => ({
        ...item,
        projectId:    proj.id,
        projectName:  proj.name,
        projectColor: proj.color,
      }));
      setCombinedItems(prev => {
        const without = prev.filter(i => i.projectId !== proj.id);
        return [...without, ...items].sort((a, b) => {
          const pc = (a.projectName ?? '').localeCompare(b.projectName ?? '');
          return pc !== 0 ? pc : a.name.localeCompare(b.name);
        });
      });
    };

    active.forEach(proj => {
      const cachedTimeline = getCached(`timeline:${proj.id}`);
      if (cachedTimeline) {
        mergeItems(proj, cachedTimeline);
        setLoadingSet(prev => { const s = new Set(prev); s.delete(proj.id); return s; });
        return;
      }
      fetch(`/api/projects/${proj.id}/timeline`, { signal: ctrl.signal })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(data => {
          if (ctrl.signal.aborted) return;
          mergeItems(proj, data.items || []);

          // Fetch drawings separately — only for items that have them, avoiding task re-fetch
          const taskIdsWithDrawings = (data.items || [])
            .filter(item => item.drawingIds?.length > 0)
            .map(item => item.id);

          if (!taskIdsWithDrawings.length) {
            setCached(`timeline:${proj.id}`, data.items || []);
            return;
          }

          fetch(`/api/projects/${proj.id}/drawings?taskIds=${taskIdsWithDrawings.join(',')}`, { signal: ctrl.signal })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(drawingsByTask => {
              if (ctrl.signal.aborted) return;
              const itemsWithDrawings = (data.items || []).map(item => ({
                ...item,
                drawings: drawingsByTask[item.id] || [],
              }));
              setCached(`timeline:${proj.id}`, itemsWithDrawings);
              mergeItems(proj, itemsWithDrawings);
            })
            .catch(e => { if (e.name !== 'AbortError') console.warn('[drawings]', proj.name, e.message); });
        })
        .catch(e => { if (e.name !== 'AbortError') console.warn('[timeline]', proj.name, e.message); })
        .finally(() => {
          if (ctrl.signal.aborted) return;
          setLoadingSet(prev => { const s = new Set(prev); s.delete(proj.id); return s; });
        });
    });

    return () => ctrl.abort();
  }, [projects, projectId]);

  const handleSelect = e => {
    const val = e.target.value;
    navigate(val ? `/timeline/${val}` : '/timeline');
  };

  const selected    = projects.find(p => p.id === projectId);
  const isLoadingAll = loadingSet.size > 0;

  const S = {
    page: {
      padding:    '24px 32px',
      background: '#0a0f1a',
      minHeight:  '100vh',
      fontFamily: "'DM Mono', 'ui-monospace', monospace",
    },
    topBar: {
      display:      'flex',
      alignItems:   'center',
      gap:          12,
      marginBottom: 20,
      flexWrap:     'wrap',
    },
    label: {
      fontSize:      11,
      color:         '#94a3b8',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
    },
    select: {
      background:   '#131c2e',
      border:       '1px solid #1e2d45',
      borderRadius: 6,
      color:        '#e2e8f0',
      fontFamily:   'inherit',
      fontSize:     12,
      padding:      '6px 10px',
      cursor:       'pointer',
      outline:      'none',
      minWidth:     260,
    },
  };

  return (
    <div style={S.page}>

      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <Link to="/" style={{ fontSize: 11, color: '#60a5fa', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>← Back to DM Tracker</Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.02em' }}>
          {projectId && selected ? selected.name : 'DT Schedule'}
        </h1>
        <div style={{ fontSize: 12, color: '#7b90b0', marginTop: 4 }}>
          {projectId && selected ? 'Project programme timeline' : 'All active projects · programme overview'}
        </div>
      </div>

      <AppNav />

      <div style={S.topBar}>
        <span style={S.label}>Project</span>
        <select value={projectId || ''} onChange={handleSelect} style={S.select} disabled={projLoading}>
          <option value="">All Projects</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {!projectId && isLoadingAll && (
          <span style={{ fontSize: 10, color: '#7b90b0', fontStyle: 'italic' }}>
            Loading {loadingSet.size} project{loadingSet.size !== 1 ? 's' : ''}…
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastRefreshed && (
            <span style={{ fontSize: 10, color: '#7b90b0' }}>
              updated {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            title="Refresh data"
            style={{ background: 'none', border: '1px solid #1e2d45', borderRadius: 4, color: '#7b90b0', fontSize: 11, padding: '3px 8px', cursor: 'pointer', lineHeight: 1 }}
          >
            ↻
          </button>
        </div>

        {!projectId && !isLoadingAll && projects.filter(p => p.status === 'In progress' || p.status === 'Active').length > 1 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginLeft: 4 }}>
            {projects
              .filter(p => p.status === 'In progress' || p.status === 'Active')
              .map(p => (
                <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#94a3b8' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
                  {p.name}
                </span>
              ))
            }
          </div>
        )}
      </div>

      {projectId && (
        <ProjectTimeline projectId={projectId} projectName={selected?.name} refreshKey={refreshKey} />
      )}

      {!projectId && (combinedItems.length > 0 || isLoadingAll) && (
        <ProjectTimeline items={combinedItems} showProjectBadge />
      )}

      {!projectId && !isLoadingAll && combinedItems.length === 0 && !projLoading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#7b90b0', fontSize: 12 }}>
          No active projects found
        </div>
      )}
    </div>
  );
}
