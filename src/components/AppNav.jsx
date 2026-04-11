import { NavLink } from 'react-router-dom';

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
  return (
    <nav style={{
      display:       'flex',
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
            // Re-check active state by looking at aria-current
            const isActive = e.currentTarget.getAttribute('aria-current') === 'page';
            e.currentTarget.style.color = isActive ? '#e2e8f0' : '#7b90b0';
          }}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
