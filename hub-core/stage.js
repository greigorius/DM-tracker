// Item stage: a read-only label worked out from data that already keeps itself
// up to date, replacing the manual DM Phase select. Never stored in Notion.
//
//   Item Status  (Item Status automation)   Omitted / Design Complete /
//                                           In Production / Blocked win outright
//   Drawings     (MDS Submission Stage +    otherwise the item is as far along as
//                 Drawing Status, kept by   its least-advanced drawing: the lowest
//                 Drawing Flow / automation) stage (S3 → S4 → S5 → A4.5 → PRD), and
//                                           within it the status that needs
//                                           attention first
//   Nothing to go on                        Not started (To Do / Backlog) or In progress

const STAGE_ORDER = ['S3', 'S4', 'S5', 'A4.5', 'PRD', 'AB'];

// Drawing Status → label, in the order they need attention.
const STATUS = [
  ['On Hold', 'On hold', 'danger'],
  ['DM Review', 'DM review', 'accent'],
  ['Approval Updates', 'Revising', 'muted'],
  ['Production Updates', 'Production updates', 'muted'],
  ['DT Review', 'DT drawing', 'muted'],
  ['First Issue', 'DT drawing', 'muted'],
  ['With Supplier', 'With supplier', 'muted'],
  [null, 'DT drawing', 'muted'],                 // has a stage, not issued yet
  ['Client Review', 'With client', 'info'],
  ['Schedule', 'Approved', 'ok'],
  ['As Built Updates', 'As-built updates', 'muted'],
  ['In Production', 'In production', 'ok'],
  ['Complete', 'Complete', 'ok'],
];
const RANK = new Map(STATUS.map((s, i) => [s[0], i]));

const ITEM_WINS = {
  Omitted: ['Omitted', 'muted'],
  'Design Complete': ['Design complete', 'ok'],
  'In Production': ['In production', 'ok'],
  Blocked: ['On hold', 'danger'],
};

export const stageCode = s => (s ? String(s).split(' - ')[0].trim() : null);

/**
 * @param {object}   item      tasks snapshot row
 * @param {object[]} drawings  the item's drawings (MDS rows)
 * @returns {{ label: string, tone: string, why: string }}
 */
export function itemStage(item, drawings = []) {
  const win = ITEM_WINS[item.status];
  if (win) return { label: win[0], tone: win[1], why: `Item Status: ${item.status}` };

  const live = drawings.filter(d => !d.archived && stageCode(d.stage) && (d.type === 'Drawing' || !drawings.some(x => x.type === 'Drawing')));
  if (!live.length) {
    const started = !['To Do', 'Backlog', 'Set Up', null, undefined, ''].includes(item.status);
    return started
      ? { label: 'In progress', tone: 'muted', why: 'No drawings issued through Drawing Flow yet' }
      : { label: 'Not started', tone: 'muted', why: 'No drawings issued through Drawing Flow yet' };
  }

  const rank = c => { const i = STAGE_ORDER.indexOf(c); return i < 0 ? 99 : i; };
  const lowest = Math.min(...live.map(d => rank(stageCode(d.stage))));
  const at = live.filter(d => rank(stageCode(d.stage)) === lowest);
  const code = stageCode(at[0].stage);
  const pick = at.reduce((best, d) => ((RANK.get(d.status ?? null) ?? 50) < (RANK.get(best.status ?? null) ?? 50) ? d : best));
  const [, label, tone] = STATUS[RANK.get(pick.status ?? null)] || [null, pick.status || 'In progress', 'muted'];

  const counts = new Map();
  for (const d of [...at].sort((x, y) => (RANK.get(x.status ?? null) ?? 50) - (RANK.get(y.status ?? null) ?? 50))) {
    const l = STATUS[RANK.get(d.status ?? null)]?.[1] || d.status;
    counts.set(l, (counts.get(l) || 0) + 1);
  }
  const why = `${code}: ${[...counts].map(([l, n]) => `${l} ${n}`).join(', ')}`
    + (live.length > at.length ? ` · ${live.length - at.length} drawing${live.length - at.length === 1 ? '' : 's'} further on` : '');
  return { label: `${code} · ${label}`, tone, why };
}

// item id → stage, for a list of items.
export function stagesFor(items, drawings) {
  const byItem = new Map();
  for (const d of drawings || []) for (const id of d.itemIds || []) {
    if (!byItem.has(id)) byItem.set(id, []);
    byItem.get(id).push(d);
  }
  return new Map(items.map(i => [i.id, itemStage(i, byItem.get(i.id) || [])]));
}
