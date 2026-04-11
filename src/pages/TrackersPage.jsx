import AppNav from '../components/AppNav.jsx';

const C = {
  bg:      '#0a0f1a',
  text:    '#e2e8f0',
  textMut: '#7b90b0',
};

export default function TrackersPage() {
  const today = new Date();
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','ui-monospace',monospace", padding: '24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>TRACKERS</h1>
          <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>Project trackers</div>
        </div>
        <div style={{ fontSize: 11, color: C.textMut }}>
          {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>
      <AppNav />
      <div style={{ fontSize: 12, color: C.textMut, fontStyle: 'italic' }}>Coming soon</div>
    </div>
  );
}
