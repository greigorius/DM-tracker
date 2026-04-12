import AppNav from '../components/AppNav.jsx';

const C = {
  bg:   '#0a0f1a',
  text: '#e2e8f0',
  muted:'#7b90b0',
};

export default function DTDrawingChecksPage() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Mono','ui-monospace',monospace", padding: '24px 32px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>DT DRAWING CHECKS</h1>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Design technology drawing checker</div>
      </div>
      <AppNav />
      <div style={{ fontSize: 12, color: C.muted }}>DT drawing checker coming soon.</div>
    </div>
  );
}
