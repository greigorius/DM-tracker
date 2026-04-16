import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AxiomHome from './pages/AxiomHome.jsx';
import ClientHome from './pages/ClientHome.jsx';
import ProjectHome from './pages/ProjectHome.jsx';
import TimelinePage from './pages/TimelinePage.jsx';
import TasksPage from './pages/TasksPage.jsx';
import ProductionPage from './pages/ProductionPage.jsx';
import ItemSchedulePage from './pages/ItemSchedulePage.jsx';
import RFISchedulePage from './pages/RFISchedulePage.jsx';
import VariationSchedulePage from './pages/VariationSchedulePage.jsx';
import DrawingsPage from './pages/DrawingsPage.jsx';
import DTDrawingChecksPage from './pages/DTDrawingChecksPage.jsx';
import ClientCommentReviewPage from './pages/ClientCommentReviewPage.jsx';
import TeamPage from './pages/TeamPage.jsx';
import ItemDateMatrixPage from './pages/ItemDateMatrixPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AxiomHome />} />
        <Route path="/client/:clientId" element={<ClientHome />} />
        <Route path="/project/:projectId" element={<ProjectHome />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/timeline/item-date-matrix" element={<ItemDateMatrixPage />} />
        <Route path="/timeline/:projectId" element={<TimelinePage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/production" element={<ProductionPage />} />
        <Route path="/trackers" element={<Navigate to="/trackers/item-schedule" replace />} />
        <Route path="/trackers/item-schedule" element={<ItemSchedulePage />} />
        <Route path="/trackers/rfis" element={<RFISchedulePage />} />
        <Route path="/trackers/variations" element={<VariationSchedulePage />} />
        <Route path="/drawings" element={<DrawingsPage />} />
        <Route path="/drawings/dt-checks" element={<DTDrawingChecksPage />} />
        <Route path="/drawings/comment-review" element={<ClientCommentReviewPage />} />
        <Route path="/team" element={<TeamPage />} />
      </Routes>
    </BrowserRouter>
  );
}
