// Lenses still to build (workspace spec §5.1, §5.4)
import { LensSoon } from './WorkspaceShell.jsx';

export function ProjectsLensSoon() {
  return <LensSoon lens="projects" what="Projects lens: every live project with its items, their position, ball in court and progress % from drawing stages. Being built next; meanwhile use Items with the Project filter." />;
}
export function SuppliersLensSoon() {
  return <LensSoon lens="suppliers" what="Suppliers lens: everything open with a company across projects. Coming after the Projects lens; meanwhile use Trackers → Actions → Suppliers view." />;
}
