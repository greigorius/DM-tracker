import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ROUTES } from './routes.jsx';
import Cockpit from './pages/Cockpit.jsx';
import { AppDataProvider } from './context/AppDataContext.jsx';
import { SkeletonRows } from './components/ui/index.js';

function PageFallback() {
  return (
    <div className="hub">
      <div className="bg-bar border-b border-line h-16" />
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 py-6"><SkeletonRows rows={8} /></div>
    </div>
  );
}

// Legacy pages still fetch through AppDataContext / usePageCache until they are
// ported to the snapshot hooks. Scoped here so the Cockpit never triggers them.
function LegacyShell() {
  return <AppDataProvider><Outlet /></AppDataProvider>;
}

export default function App() {
  const v2 = ROUTES.filter(([, , o]) => !o?.legacy);
  const legacy = ROUTES.filter(([, , o]) => o?.legacy);
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Cockpit />} />
          {v2.map(([path, Page]) => <Route key={path} path={path} element={<Page />} />)}
          <Route element={<LegacyShell />}>
            {legacy.map(([path, Page]) => <Route key={path} path={path} element={<Page />} />)}
          </Route>

          {/* Old paths */}
          <Route path="/tasks" element={<Navigate to="/trackers/task-schedule" replace />} />
          <Route path="/trackers" element={<Navigate to="/trackers/task-schedule" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
