// Page frame shared by Brief (/brief) and Triage (/triage): same project
// filter (remembered across both) and the same snapshot data.
import { Outlet } from 'react-router-dom';
import { PageShell } from '../../components/ui/index.js';
import { ToolbarSelect } from '../../components/ui/table.jsx';
import { useBriefData, useStored } from './shared.jsx';

export default function BriefLayout({ title, subtitle }) {
  const [project, setProject] = useStored('hub.brief.project', '');
  const data = useBriefData(project);
  return (
    <PageShell
      title={title}
      subtitle={subtitle}
      toolbar={<ToolbarSelect label="Project" value={project} onChange={setProject} options={[{ value: '', label: 'All projects' }, ...data.projectOptions]} />}
    >
      <Outlet context={{ data, project }} />
    </PageShell>
  );
}
