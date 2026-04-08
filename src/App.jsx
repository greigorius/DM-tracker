import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AxiomHome from './pages/AxiomHome.jsx';
import ClientHome from './pages/ClientHome.jsx';
import ProjectHome from './pages/ProjectHome.jsx';
import TimelinePage from './pages/TimelinePage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AxiomHome />} />
        <Route path="/client/:clientId" element={<ClientHome />} />
        <Route path="/project/:projectId" element={<ProjectHome />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/timeline/:projectId" element={<TimelinePage />} />
      </Routes>
    </BrowserRouter>
  );
}
