// Launch tiles. Tools already in the Hub route internally; the rest link out
// to their current URL (set via VITE_URL_* in .env / Netlify env) until ported.
import { Sun, ListChecks, CalendarClock, GitPullRequestArrow, PenTool, CircleHelp, FileDiff, ChartColumn } from 'lucide-react';

const env = import.meta.env;

export const TOOLS = [
  { id: 'brief', name: 'Daily Brief', path: '/brief', icon: Sun, inHub: false, href: env.VITE_URL_BRIEF, envVar: 'VITE_URL_BRIEF' },
  { id: 'triage', name: 'Triage', path: '/triage', icon: ListChecks, inHub: true, tone: 'accent', dbs: ['tasks', 'actions', 'rfis', 'variations', 'projects', 'team'] },
  { id: 'scheduling', name: 'Scheduling', path: '/scheduling', icon: CalendarClock, inHub: false, href: env.VITE_URL_SCHEDULING || 'https://dm-scheduling-tool.netlify.app/', envVar: 'VITE_URL_SCHEDULING' },
  { id: 'drawing-flow', name: 'Drawing Flow', path: '/drawing-flow', icon: GitPullRequestArrow, inHub: false, href: env.VITE_URL_DRAWING_FLOW, envVar: 'VITE_URL_DRAWING_FLOW', tone: 'accent' },
  { id: 'drawing-studio', name: 'Drawing Studio', path: '/drawing-studio', icon: PenTool, inHub: false, href: env.VITE_URL_DRAWING_STUDIO, envVar: 'VITE_URL_DRAWING_STUDIO' },
  { id: 'rfis', name: 'RFIs', path: '/trackers/rfis', icon: CircleHelp, inHub: true, tone: 'info', dbs: ['rfis'] },
  { id: 'variations', name: 'Variations', path: '/trackers/variations', icon: FileDiff, inHub: true, dbs: ['variations'] },
  { id: 'reports', name: 'Reports', path: '/reports', icon: ChartColumn, inHub: false, href: env.VITE_URL_REPORTS, envVar: 'VITE_URL_REPORTS' },
];

// Snapshot DBs each tool reads, for "Updated x ago" on its tile.
export const TOOL_SNAPSHOT = { triage: 'tasks', rfis: 'rfis', variations: 'variations', 'drawing-flow': 'submissions', brief: 'actions' };

// Scheduling Tool deep link with the current Project and Item preselected.
export function schedulingLink(projectId, itemId) {
  const base = TOOLS.find(t => t.id === 'scheduling').href;
  try {
    const u = new URL(base);
    if (projectId) u.searchParams.set('project', projectId);
    if (itemId) u.searchParams.set('item', itemId);
    return u.toString();
  } catch { return base; }
}
