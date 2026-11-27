import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { ROUTES, pages } from './routes.jsx';

const { briefLayout: BriefLayout, dailyBrief: DailyBrief, brief: BriefPage, triage: TriagePage, inbox: InboxPage } = pages;
import Cockpit from './pages/Cockpit.jsx';
import { SkeletonRows } from './components/ui/index.js';

function PageFallback() {
  return (
    <div className="hub">
      <div className="bg-bar border-b border-line h-16" />
      <div className="mx-auto max-w-[1920px] px-4 sm:px-6 py-6"><SkeletonRows rows={8} /></div>
    </div>
  );
}

function KeepQuery({ to }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

// Timeline became the Programme page's Table tab
function TimelineRedirect() {
  const { projectId } = useParams();
  return <Navigate to={`/programme/${projectId}?tab=table`} replace />;
}

// The project and client pages were retired (Nov 2026): every tab has a project filter
function ProjectRedirect() {
  const { projectId } = useParams();
  return <Navigate to={`/programme/${projectId}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Cockpit />} />
          <Route element={<BriefLayout title="Brief" subtitle="My day and the latest movements across the Hub" />}>
            <Route path="/brief" element={<BriefPage />} />
            <Route path="/brief/classic" element={<DailyBrief />} />
          </Route>
          <Route element={<BriefLayout title="Triage" subtitle="Records with no item: link or file each one" />}>
            <Route path="/triage" element={<InboxPage />} />
          </Route>
          <Route element={<BriefLayout title="Triage lists" subtitle="The old tabbed lists, until the Item Tracker replaces them" />}>
            <Route path="/triage/lists" element={<TriagePage />} />
          </Route>
          {ROUTES.map(([path, Page]) => <Route key={path} path={path} element={<Page />} />)}

          {/* Old paths */}
          <Route path="/brief/triage" element={<KeepQuery to="/triage" />} />
          <Route path="/timeline" element={<Navigate to="/programme?tab=table" replace />} />
          <Route path="/timeline/:projectId" element={<TimelineRedirect />} />
          <Route path="/project/:projectId" element={<ProjectRedirect />} />
          <Route path="/client/:clientId" element={<Navigate to="/programme" replace />} />
          <Route path="/scheduling" element={<Navigate to="/programme" replace />} />
          <Route path="/trackers/task-schedule" element={<KeepQuery to="/workspace/team" />} />
          <Route path="/tasks" element={<KeepQuery to="/workspace/team" />} />
          <Route path="/team" element={<KeepQuery to="/workspace/team" />} />
          <Route path="/drawings" element={<KeepQuery to="/trackers/drawings" />} />
          <Route path="/trackers" element={<Navigate to="/trackers/actions" replace />} />
          <Route path="/workspace" element={<Navigate to="/workspace/items" replace />} />
          <Route path="/trackers/item-schedule" element={<KeepQuery to="/workspace/items" />} />
          <Route path="/trackers/team" element={<KeepQuery to="/workspace/team" />} />
          <Route path="/trackers/tasks" element={<KeepQuery to="/workspace/team" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
