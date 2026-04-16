import { useState, useRef, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import QuickEntryModal from './QuickEntryModal.jsx';

// ── Nav structure ─────────────────────────────────────────────────────────────
// Plain items have `to`; items with sub-menus have `children` and `match`
// (match is the path prefix used to decide active state for the parent label).
const NAV = [
  { to: '/', label: 'HOME', end: true },
  {
    label: 'TASKS',
    match: '/tasks',
    children: [
      { to: '/tasks',            label: 'Task List',  end: true },
      { to: '/tasks/production', label: 'Production'            },
    ],
  },
  {
    label: 'TIMELINE',
    match: '/timeline',
    children: [
      { to: '/timeline',                  label: 'DT Schedule',      end: true },
      { to: '/timeline/item-date-matrix', label: 'Item Date Matrix'             },
    ],
  },
  {
    label: 'TRACKERS',
    match: '/trackers',
    children: [
      { to: '/trackers/item-schedule', label: 'Item Schedule',      end: true },
      { to: '/trackers/rfis',          label: 'RFI Schedule'                  },
      { to: '/trackers/variations',    label: 'Variation Schedule'             },
    ],
  },
  {
    label: 'DRAWINGS',
    match: '/drawings',
    children: [
      { to: '/drawings',                 label: 'Register',              end: true },
      { to: '/drawings/dt-checks',       label: 'DT Drawing Checks'               },
      { to: '/drawings/comment-review',  label: 'Client Comment Review'            },
    ],
  },
  { to: '/team', label: 'TEAM' },
];

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  border:  '#1e2d45',
  text:    '#e2e8f0',
  muted:   '#7b90b0',
  sec:     '#94a3b8',
  bgPanel: '#0d1830',
  bgHover: '#111c30',
  active:  '#60a5fa',
};

const baseLabelStyle = {
  fontSize:       11,
  fontWeight:     700,
  letterSpacing:  '0.08em',
  textTransform:  'uppercase',
  textDecoration: 'none',
  cursor:         'pointer',
  background:     'none',
  border:         'none',
  padding:        0,
  fontFamily:     'inherit',
  lineHeight:     1,
};

// ── Plain nav link ────────────────────────────────────────────────────────────
function PlainLink({ to, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      style={({ isActive }) => ({ ...baseLabelStyle, color: isActive ? C.text : C.muted })}
      onMouseEnter={e => { e.currentTarget.style.color = C.sec; }}
      onMouseLeave={e => {
        const active = e.currentTarget.getAttribute('aria-current') === 'page';
        e.currentTarget.style.color = active ? C.text : C.muted;
      }}
    >
      {label}
    </NavLink>
  );
}

// ── Dropdown nav item ─────────────────────────────────────────────────────────
function DropdownItem({ label, match, children }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);
  const location   = useLocation();
  const isActive   = location.pathname.startsWith(match);

  const scheduleClose = useCallback(() => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  return (
    <div
      style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      {/* Parent label — clicking it navigates to the first child */}
      <NavLink
        to={children[0].to}
        style={{ ...baseLabelStyle, color: isActive ? C.text : C.muted, display: 'flex', alignItems: 'center', gap: 4 }}
        onMouseEnter={e => { e.currentTarget.style.color = C.sec; }}
        onMouseLeave={e => { e.currentTarget.style.color = isActive ? C.text : C.muted; }}
      >
        {label}
        {/* Chevron */}
        <span style={{
          fontSize: 7,
          color: isActive ? C.text : C.muted,
          transition: 'transform 0.15s',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          display: 'inline-block',
          marginTop: 1,
          lineHeight: 1,
        }}>▾</span>
      </NavLink>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position:    'absolute',
            top:         'calc(100% + 10px)',
            left:        '50%',
            transform:   'translateX(-50%)',
            background:  C.bgPanel,
            border:      `1px solid ${C.border}`,
            borderRadius: 7,
            minWidth:    180,
            boxShadow:   '0 8px 24px rgba(0,0,0,0.5)',
            zIndex:      200,
            overflow:    'hidden',
            // Arrow notch
            '--arrow-color': C.bgPanel,
          }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {/* Triangle pointer */}
          <div style={{
            position:    'absolute',
            top:         -6,
            left:        '50%',
            transform:   'translateX(-50%)',
            width:       0,
            height:      0,
            borderLeft:  '6px solid transparent',
            borderRight: '6px solid transparent',
            borderBottom: `6px solid ${C.border}`,
          }} />
          <div style={{
            position:    'absolute',
            top:         -5,
            left:        '50%',
            transform:   'translateX(-50%)',
            width:       0,
            height:      0,
            borderLeft:  '5px solid transparent',
            borderRight: '5px solid transparent',
            borderBottom: `5px solid ${C.bgPanel}`,
          }} />

          {children.map(({ to, label: childLabel, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              style={({ isActive: childActive }) => ({
                display:        'block',
                padding:        '9px 16px',
                fontSize:       11,
                fontWeight:     700,
                letterSpacing:  '0.06em',
                textTransform:  'uppercase',
                textDecoration: 'none',
                color:          childActive ? C.active : C.sec,
                background:     childActive ? 'rgba(96,165,250,0.08)' : 'transparent',
                borderLeft:     childActive ? `2px solid ${C.active}` : '2px solid transparent',
                transition:     'background 0.1s, color 0.1s',
              })}
              onMouseEnter={e => {
                const a = e.currentTarget.getAttribute('aria-current') === 'page';
                e.currentTarget.style.background = a ? 'rgba(96,165,250,0.12)' : C.bgHover;
              }}
              onMouseLeave={e => {
                const a = e.currentTarget.getAttribute('aria-current') === 'page';
                e.currentTarget.style.background = a ? 'rgba(96,165,250,0.08)' : 'transparent';
              }}
            >
              {childLabel}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AppNav ────────────────────────────────────────────────────────────────────
export default function AppNav() {
  const [showQuickEntry, setShowQuickEntry] = useState(false);

  return (
    <>
      <nav style={{
        display:       'flex',
        alignItems:    'center',
        gap:           24,
        paddingBottom: 16,
        marginBottom:  24,
        borderBottom:  `1px solid ${C.border}`,
      }}>
        {NAV.map(item =>
          item.children ? (
            <DropdownItem key={item.label} {...item} />
          ) : (
            <PlainLink key={item.to} {...item} />
          )
        )}

        <button
          onClick={() => setShowQuickEntry(true)}
          style={{
            marginLeft:    'auto',
            padding:       '4px 12px',
            border:        `1px solid ${C.border}`,
            borderRadius:  4,
            background:    'transparent',
            color:         C.active,
            fontSize:      11,
            fontWeight:    700,
            fontFamily:    'inherit',
            letterSpacing: '0.06em',
            cursor:        'pointer',
            transition:    'border-color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.active; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; }}
        >
          + QUICK ENTRY
        </button>
      </nav>

      {showQuickEntry && (
        <QuickEntryModal onClose={() => setShowQuickEntry(false)} />
      )}
    </>
  );
}
