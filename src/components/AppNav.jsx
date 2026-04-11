import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import QuickEntryModal from './QuickEntryModal.jsx';

const NAV_LINKS = [
  { to: '/',         label: 'HOME',     end: true },
  { to: '/tasks',    label: 'TASKS'              },
  { to: '/timeline', label: 'TIMELINE'            },
  { to: '/trackers', label: 'TRACKERS'            },
  { to: '/drawings', label: 'DRAWINGS'            },
  { to: '/team',     label: 'TEAM'                },
];

const baseStyle = {
  fontSize:       11,
  fontWeight:     700,
  textDecoration: 'none',
  letterSpacing:  '0.08em',
  textTransform:  'uppercase',
};

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
        borderBottom:  '1px solid #1e2d45',
      }}>
        {NAV_LINKS.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            style={({ isActive }) => ({ ...baseStyle, color: isActive ? '#e2e8f0' : '#7b90b0' })}
            onMouseEnter={e => { e.currentTarget.style.color = '#94a3b8'; }}
            onMouseLeave={e => {
              const isActive = e.currentTarget.getAttribute('aria-current') === 'page';
              e.currentTarget.style.color = isActive ? '#e2e8f0' : '#7b90b0';
            }}
          >
            {label}
          </NavLink>
        ))}

        <button
          onClick={() => setShowQuickEntry(true)}
          style={{
            marginLeft:    'auto',
            padding:       '4px 12px',
            border:        '1px solid #1e2d45',
            borderRadius:  4,
            background:    'transparent',
            color:         '#60a5fa',
            fontSize:      11,
            fontWeight:    700,
            fontFamily:    'inherit',
            letterSpacing: '0.06em',
            cursor:        'pointer',
            transition:    'border-color 0.12s, color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#60a5fa'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e2d45'; }}
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
