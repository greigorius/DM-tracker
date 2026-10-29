// Launch tiles. Tools already in the Hub route internally; the rest link out
// to their current URL (set via VITE_URL_* in .env / Netlify env) until ported.
import { Sun, ListChecks, CalendarClock, GitPullRequestArrow, PenTool, CircleHelp, FileDiff, ChartColumn } from 'lucide-react';

const env = import.meta.env;

// Defaults are the live addresses; a VITE_URL_* env var overrides any of them.
const A = id => `https://claude.ai/artifact/${id}`;

export const TOOLS = [
  { id: 'brief', name: 'Daily Brief', path: '/brief', icon: Sun, inHub: false, href: env.VITE_URL_BRIEF || A('5sjZs2KgtwHqWZpS5dGgWp'), envVar: 'VITE_URL_BRIEF' },
  // Opens the existing Daily Triage artifact (it can edit) until /triage is rebuilt in the Hub.
  // The count cards still open the Hub's read-only /triage lists.
  { id: 'triage', name: 'Triage', path: '/triage', icon: ListChecks, inHub: false, href: env.VITE_URL_TRIAGE || A('WW1tLtGhUHh4aFcb8Gn612'), envVar: 'VITE_URL_TRIAGE', tone: 'accent', dbs: ['tasks', 'actions', 'rfis', 'variations', 'projects', 'team'] },
  { id: 'scheduling', name: 'Scheduling', path: '/scheduling', icon: CalendarClock, inHub: false, href: env.VITE_URL_SCHEDULING || 'https://dm-scheduling-tool.netlify.app/', envVar: 'VITE_URL_SCHEDULING' },
  { id: 'drawing-flow', name: 'Drawing Flow', path: '/drawing-flow', icon: GitPullRequestArrow, inHub: false, href: env.VITE_URL_DRAWING_FLOW || 'https://axiom-drawing-flow.netlify.app', envVar: 'VITE_URL_DRAWING_FLOW', tone: 'accent' },
  { id: 'drawing-studio', name: 'Drawing Studio', path: '/drawing-studio', icon: PenTool, inHub: false, href: env.VITE_URL_DRAWING_STUDIO || A('XpE4W273jbPeiyzeDArokd'), envVar: 'VITE_URL_DRAWING_STUDIO' },
  { id: 'rfis', name: 'RFIs', path: '/trackers/rfis', icon: CircleHelp, inHub: true, tone: 'info', dbs: ['rfis'] },
  { id: 'variations', name: 'Variations', path: '/trackers/variations', icon: FileDiff, inHub: true, dbs: ['variations'] },
  {
    id: 'reports', name: 'Reports', path: '/reports', icon: ChartColumn, inHub: false,
    links: [
      { label: 'Weekly Client Report', href: env.VITE_URL_REPORT_CLIENT || A('4Xf4VaXVcwbXwikW33GVoR') },
      { label: 'Contract vs Variation Hours', href: env.VITE_URL_REPORT_HOURS || A('WukVtAcucmqg678Cgtu8bT') },
    ],
  },
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
