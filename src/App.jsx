import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AxiomHome from './pages/AxiomHome.jsx';
import ClientHome from './pages/ClientHome.jsx';
import ProjectHome from './pages/ProjectHome.jsx';

function TimelinePlaceholder() {
  return (
    <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center text-[#94a3b8] text-sm">
      Full Timeline — coming soon
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AxiomHome />} />
        <Route path="/client/:clientId" element={<ClientHome />} />
        <Route path="/project/:projectId" element={<ProjectHome />} />
        <Route path="/timeline" element={<TimelinePlaceholder />} />
      </Routes>
    </BrowserRouter>
  );
}
