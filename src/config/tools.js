// Launch tiles. Tools already in the Hub route internally; the rest link out
// to their current URL (set via VITE_URL_* in .env / Netlify env) until ported.
import { Sun, ListChecks, CalendarClock, GitPullRequestArrow, PenTool, CircleHelp, FileDiff, ChartColumn } from 'lucide-react';

const env = import.meta.env;
const BRIEF_DBS = ['tasks', 'actions', 'rfis', 'variations', 'submissions', 'projects', 'team', 'activity', 'meetings', 'drawings'];

// Defaults are the live addresses; a VITE_URL_* env var overrides any of them.
const A = id => `https://claude.ai/artifact/${id}`;

export const TOOLS = [
  { id: 'brief', name: 'Daily Brief', path: '/brief', icon: Sun, inHub: true, dbs: BRIEF_DBS },
  { id: 'triage', name: 'Triage', path: '/triage', icon: ListChecks, inHub: true, tone: 'accent', dbs: BRIEF_DBS },
  { id: 'scheduling', name: 'Programme', path: '/programme', icon: CalendarClock, inHub: true, dbs: ['tasks', 'drawings'] },
  { id: 'drawing-flow', name: 'Drawing Flow', path: '/drawing-flow', icon: GitPullRequestArrow, inHub: false, href: env.VITE_URL_DRAWING_FLOW || 'https://axiom-drawing-flow.netlify.app', envVar: 'VITE_URL_DRAWING_FLOW', tone: 'accent' },
  { id: 'drawing-studio', name: 'Drawing Studio', path: '/drawing-studio', icon: PenTool, inHub: false, href: env.VITE_URL_DRAWING_STUDIO || A('XpE4W273jbPeiyzeDArokd'), envVar: 'VITE_URL_DRAWING_STUDIO' },
  { id: 'rfis', name: 'RFIs', path: '/trackers/rfis', icon: CircleHelp, inHub: true, tone: 'info', dbs: ['rfis'] },
  { id: 'variations', name: 'Variations', path: '/trackers/variations', icon: FileDiff, inHub: true, dbs: ['variations'] },
  {
    id: 'reports', name: 'Reports', path: '/reports', icon: ChartColumn, inHub: false,
    // The Reports tab lists these too (src/pages/ReportsPage.jsx)
    links: [
      { label: 'Weekly Client Report', href: env.VITE_URL_REPORT_CLIENT || A('4Xf4VaXVcwbXwikW33GVoR'), desc: 'Per-project week overview from the Notion databases, with PDF export' },
      { label: 'Contract vs Variation Hours', href: env.VITE_URL_REPORT_HOURS || A('WukVtAcucmqg678Cgtu8bT'), desc: 'Hours split between contracted work and variations' },
    ],
  },
];

// Snapshot DBs each tool reads, for "Updated x ago" on its tile.
export const TOOL_SNAPSHOT = { triage: 'actions', rfis: 'rfis', variations: 'variations', 'drawing-flow': 'submissions', brief: 'actions' };

// Programme page with the current Project and Item preselected (Review tab).
export function schedulingLink(projectId, itemId) {
  const q = new URLSearchParams({ tab: 'review', ...(itemId && { item: itemId }) });
  return `${projectId ? `/programme/${projectId}` : '/programme'}?${q}`;
}
