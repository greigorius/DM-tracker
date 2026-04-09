import { useMemo } from 'react';
import { Link } from 'react-router-dom';

const C = {
  bg:      '#0a0f1a',
  bgCard:  '#0d1525',
  bgPanel: '#0d1830',
  border:  '#1e2d45',
  text:    '#e2e8f0',
  textSec: '#94a3b8',
  textMut: '#7b90b0',
  today:   'rgba(74,222,128,0.75)',
  grid:    '#1a2540',
};

const DAY_W   = 48;
const LABEL_W = 340;
const ROW_H   = 58;
const DAYS    = 21;

const MILESTONE_KEYS = [
  { key: 'dt1Start',    label: 'DT1↑', ck: 'dt1'  },
  { key: 'dt1Delivery', label: 'DT1↓', ck: 'dt1'  },
  { key: 'sub1',        label: 'P01',  ck: 'p01'  },
  { key: 's4Status',    label: 'S4',   ck: 's4'   },
  { key: 'dt2Start',    label: 'DT2↑', ck: 'dt2'  },
  { key: 'dt2Delivery', label: 'DT2↓', ck: 'dt2'  },
  { key: 'sub2',        label: 'P02',  ck: 'p02'  },
  { key: 's5Status',    label: 'S5',   ck: 's5'   },
  { key: 'production',  label: 'PROD', ck: 'prod' },
];

const MC = {
  dt1:  { bg: '#1e3a5f', text: '#60a5fa' },
  p01:  { bg: '#2e1f5e', text: '#818cf8' },
  s4:   { bg: '#78350f', text: '#fbbf24' },
  dt2:  { bg: '#1e3a5f', text: '#60a5fa' },
  p02:  { bg: '#2e1f5e', text: '#818cf8' },
  s5:   { bg: '#2e1065', text: '#a78bfa' },
  dtc:  { bg: '#3b1a3b', text: '#e879f9' },
  c01:  { bg: '#1a3a2a', text: '#34d399' },
  prod: { bg: '#1a3a2a', text: '#34d399' },
};

const LEGEND = [
  { ck: 'dt1',  label: 'DT1↑', desc: 'DT start — 1st issue'       },
  { ck: 'dt1',  label: 'DT1↓', desc: 'DT delivery — 1st issue'    },
  { ck: 'p01',  label: 'P01',  desc: '1st submission'              },
  { ck: 's4',   label: 'S4',   desc: 'Contractor approval'         },
  { ck: 'dt2',  label: 'DT2↑', desc: 'DT start — 2nd issue'       },
  { ck: 'dt2',  label: 'DT2↓', desc: 'DT delivery — 2nd issue'    },
  { ck: 'p02',  label: 'P02',  desc: '2nd submission'              },
  { ck: 's5',   label: 'S5',   desc: 'Client approval'             },
  { ck: 'prod', label: 'PROD', desc: 'Production start'            },
];

// Local-date helpers — avoids UTC/local timezone off-by-one (e.g. BST)
const toLocalStr = d => {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};
const parseLocal = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const bestDate   = d => d ? (d.actual || d.adj || d.plan || null) : null;
const fmtDate    = s => s ? parseLocal(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;

export default function MiniTimeline({ items, projectColor }) {
  // Stable window — computed once per mount (today doesn't drift within a session)
  const { todayStr, windowStart, windowEnd, todayX, dayHeaders, weekLabels, totalW } = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr    = toLocalStr(today);
    const windowStart = new Date(today); windowStart.setDate(today.getDate() - 7);
    const windowEnd   = new Date(windowStart); windowEnd.setDate(windowStart.getDate() + DAYS);

    const dateX = s => {
      if (!s) return null;
      const d = parseLocal(s);
      return Math.round((d - windowStart) / 86_400_000) * DAY_W;
    };

    const todayX = dateX(todayStr);
    const totalW = DAYS * DAY_W;

    const dayHeaders = Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(windowStart); d.setDate(d.getDate() + i);
      return { label: d.getDate(), isToday: toLocalStr(d) === todayStr, isWeekStart: d.getDay() === 1, x: i * DAY_W };
    });

    const weekLabels = [];
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(windowStart); d.setDate(d.getDate() + i);
      if (d.getDay() === 1 || i === 0) {
        const fmt = dt => dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        weekLabels.push({ label: `w/c ${fmt(d)}`, x: i * DAY_W, width: Math.min(7, DAYS - i) * DAY_W });
      }
    }

    return { todayStr, windowStart, windowEnd, todayX, dayHeaders, weekLabels, totalW };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // dateX helper — stable reference (windowStart is memoised above)
  const dateX = useMemo(() => s => {
    if (!s) return null;
    return Math.round((parseLocal(s) - windowStart) / 86_400_000) * DAY_W;
  }, [windowStart]);

  // Filter items to the 3-week window — only re-runs when items change
  const windowItems = useMemo(() => items.filter(item => {
    const dates = MILESTONE_KEYS.map(m => bestDate(item.dates?.[m.key])).filter(Boolean).map(s => parseLocal(s));
    if (!dates.length) return false;
    const lo = new Date(Math.min(...dates));
    const hi = new Date(Math.max(...dates));
    return lo <= windowEnd && hi >= windowStart;
  }), [items, windowStart, windowEnd]);

  return (
    <div style={{ width: '100%', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', fontFamily: "'ui-monospace', Consolas, monospace" }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${C.border}`, background: C.bgPanel }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Three-Week Lookahead</span>
          <span style={{ fontSize: 11, color: C.textMut, marginLeft: 10 }}>
            {windowStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — {windowEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
        </div>
        <Link to="/timeline" style={{ fontSize: 11, color: '#60a5fa', textDecoration: 'none', fontWeight: 600 }}>View Full Timeline →</Link>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '6px 14px', flexWrap: 'wrap', padding: '8px 16px', borderBottom: `1px solid ${C.border}`, background: '#070d18' }}>
        {LEGEND.map((li, i) => {
          const mc = MC[li.ck];
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ background: mc.bg, color: mc.text, border: `1px solid ${mc.text}50`, borderRadius: 3, padding: '1px 5px', fontSize: 8, fontWeight: 800, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{li.label}</span>
              <span style={{ fontSize: 9, color: C.textMut }}>{li.desc}</span>
            </div>
          );
        })}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 24, height: 2, background: C.today, borderRadius: 1 }} />
          <span style={{ fontSize: 9, color: C.textMut }}>Today</span>
        </div>
      </div>

      {windowItems.length === 0 ? (
        <div style={{ padding: '24px', color: C.textMut, fontSize: 11, textAlign: 'center' }}>No milestone activity in this window</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>

          {/* Week labels row */}
          <div style={{ display: 'flex', height: 20, marginLeft: LABEL_W, position: 'relative', minWidth: totalW }}>
            {weekLabels.map((w, i) => (
              <div key={i} style={{ position: 'absolute', left: w.x, width: w.width, fontSize: 9, color: C.textMut, display: 'flex', alignItems: 'center', paddingLeft: 4, borderLeft: i > 0 ? `1px solid ${C.border}` : 'none' }}>{w.label}</div>
            ))}
          </div>

          {/* Day headers */}
          <div style={{ display: 'flex', height: 24, borderBottom: `1px solid ${C.border}`, background: C.bgPanel }}>
            <div style={{ width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, background: C.bgPanel, borderRight: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', paddingLeft: 16, fontSize: 10, color: C.textMut }}>
              Item · Assignee · S4 · S5
            </div>
            {dayHeaders.map((d, i) => (
              <div key={i} style={{ width: DAY_W, flexShrink: 0, fontSize: 9, fontWeight: d.isToday ? 800 : 400, color: d.isToday ? '#4ade80' : d.isWeekStart ? C.textSec : C.textMut, borderLeft: d.isWeekStart && i > 0 ? `1px solid ${C.border}` : `1px solid ${C.grid}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: d.isToday ? 'rgba(74,222,128,0.06)' : 'transparent' }}>{d.label}</div>
            ))}
          </div>

          {/* Item rows */}
          {windowItems.map((item, idx) => {
            const projColor = item.projectColor ?? projectColor ?? C.textMut;
            const rowBg     = idx % 2 === 0 ? C.bgCard : '#0b1020';
            const s4Str     = fmtDate(bestDate(item.dates?.s4Status));
            const s5Str     = fmtDate(bestDate(item.dates?.s5Status));
            return (
              <div key={item.id} style={{ display: 'flex', height: ROW_H, borderBottom: `1px solid ${C.grid}`, background: rowBg }}>

                {/* Label column */}
                <div style={{ width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 10, background: rowBg, borderRight: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', overflow: 'hidden' }}>
                  <div style={{ width: 3, height: '65%', borderRadius: 2, background: projColor, flexShrink: 0 }} />
                  <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>{item.name}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 2, alignItems: 'center', overflow: 'hidden' }}>
                      {item.assignee && (
                        <span style={{ background: '#1e2d45', color: '#60a5fa', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999, border: '1px solid #2d3f5a', flexShrink: 0, whiteSpace: 'nowrap' }}>{item.assignee}</span>
                      )}
                      {item.dmPhase && (
                        <span style={{ background: '#1e293b', color: '#94a3b8', fontSize: 8, fontWeight: 600, padding: '1px 5px', borderRadius: 3, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.dmPhase}</span>
                      )}
                    </div>
                    {(s4Str || s5Str) && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                        {s4Str && <span style={{ fontSize: 8, color: '#fbbf24', fontWeight: 600 }}>S4 {s4Str}</span>}
                        {s5Str && <span style={{ fontSize: 8, color: '#a78bfa', fontWeight: 600 }}>S5 {s5Str}</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Timeline area */}
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: totalW }}>
                  {dayHeaders.map((d, i) => (
                    <div key={i} style={{ position: 'absolute', left: d.x, top: 0, width: 1, height: '100%', background: d.isWeekStart && i > 0 ? C.border : C.grid, zIndex: 0, pointerEvents: 'none' }} />
                  ))}
                  <div style={{ position: 'absolute', left: todayX, top: 0, width: DAY_W, height: '100%', background: 'rgba(74,222,128,0.04)', zIndex: 0, pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', left: todayX, top: 0, width: 2, height: '100%', background: C.today, zIndex: 2, pointerEvents: 'none' }} />
                  {MILESTONE_KEYS.map(m => {
                    const ds = bestDate(item.dates?.[m.key]);
                    if (!ds) return null;
                    const x = dateX(ds);
                    if (x === null || x < 0 || x > totalW) return null;
                    const mc = MC[m.ck] || { bg: '#1e293b', text: '#94a3b8' };
                    return (
                      <div key={m.key} title={`${m.label}: ${ds}`} style={{ position: 'absolute', left: x + DAY_W / 2 - 14, top: '50%', transform: 'translateY(-50%)', background: mc.bg, color: mc.text, fontSize: 8, fontWeight: 800, padding: '2px 4px', borderRadius: 3, zIndex: 3, border: `1px solid ${mc.text}40`, whiteSpace: 'nowrap' }}>
                        {m.label}
                      </div>
                    );
                  })}
                </div>

              </div>
            );
          })}

        </div>
      )}
    </div>
  );
}
