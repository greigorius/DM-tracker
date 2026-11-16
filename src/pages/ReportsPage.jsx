// Reports: the report tools, until each is ported into the Hub. Programme
// exports (Gantt, release schedule, PDF) live on the Programme page's Export.
import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { PageShell, Card } from '../components/ui/index.js';
import { TOOLS } from '../config/tools.js';

const linkCls = 'flex items-start justify-between gap-4 p-5 min-h-11 no-underline text-text hover:bg-surface-hi';

export default function ReportsPage() {
  const reports = TOOLS.find(t => t.id === 'reports')?.links || [];
  return (
    <PageShell title="Reports" subtitle="Client and internal reports">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {reports.map(r => (
          <Card key={r.label} className="p-0">
            <a href={r.href} target="_blank" rel="noreferrer" className={linkCls}>
              <span className="flex flex-col gap-1.5">
                <span className="text-[16px] font-semibold">{r.label}</span>
                {r.desc && <span className="text-[14px] text-text-2">{r.desc}</span>}
                <span className="font-mono text-[11px] text-muted uppercase tracking-[0.08em]">Opens in a new tab</span>
              </span>
              <ExternalLink size={16} className="shrink-0 mt-1 text-muted" aria-hidden="true" />
            </a>
          </Card>
        ))}
        <Card className="p-0">
          <Link to="/programme?tab=table" className={linkCls}>
            <span className="flex flex-col gap-1.5">
              <span className="text-[16px] font-semibold">Programme exports</span>
              <span className="text-[14px] text-text-2">Gantt chart, drawing release schedule, programme PDF and item rows — from Export on the Programme page.</span>
            </span>
            <ArrowRight size={16} className="shrink-0 mt-1 text-muted" aria-hidden="true" />
          </Link>
        </Card>
      </div>
    </PageShell>
  );
}
