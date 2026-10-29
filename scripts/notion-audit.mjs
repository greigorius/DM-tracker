// To Do DB audit + backup, run before stripping the database back.
//   npm run audit:todo
// Writes:
//   docs/todo-audit.md                    every To Do property, its formula / rollup, and what depends on it
//   _archive/todo-schema-<date>.json      raw schemas of To Do and the DBs that point at it
//   _archive/todo-backup-<date>.json      every To Do row's stored values (not formulas / rollups)
// Read-only against Notion.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { notion, withRetry, queryAllPages } from '../hub-core/notion.js';
import { DATA_SOURCES } from '../hub-core/config.js';

const today = new Date().toISOString().slice(0, 10);
const ROOT = path.resolve(import.meta.dirname, '..');
fs.mkdirSync(path.join(ROOT, '_archive'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });

const DBS = { todo: 'To Do List', tasks: 'Items (Tasks)', variations: 'Variations', rfis: 'RFIs', team: 'Team', actions: 'Actions & Info' };
const schema = {};
for (const db of Object.keys(DBS)) {
  schema[db] = await withRetry(() => notion().dataSources.retrieve({ data_source_id: DATA_SOURCES[db] }));
  process.stdout.write(`schema ${db} ✓\n`);
}
fs.writeFileSync(path.join(ROOT, `_archive/todo-schema-${today}.json`), JSON.stringify(schema, null, 2));

// id → name per DB (ids appear URL-encoded in schemas and decoded in expressions)
const props = db => Object.entries(schema[db].properties).map(([name, p]) => ({ name, ...p }));
const idsOf = p => (p.id === 'title' ? [] : [...new Set([p.id, decodeURIComponent(p.id)])]);
const refsIn = (expr, db) => props(db).filter(p => idsOf(p).some(id => expr.includes(id)) || expr.includes(`prop("${p.name}")`)).map(p => p.name);
const readable = (expr, db) => {
  let out = expr;
  for (const p of props(db)) for (const id of idsOf(p)) out = out.split(id).join(`⟨${p.name}⟩`);
  return out.replace(/\{\{notion:block_property:⟨([^⟩]+)⟩[^}]*\}\}/g, 'prop("$1")');
};
const relName = (db, rel) => props(db).find(p => p.type === 'relation' && (p.name === rel.relation_property_name || idsOf(p).includes(rel.relation_property_id)))?.name || rel.relation_property_name;

// Which To Do properties are read by other To Do formulas, and by rollups elsewhere
const todo = props('todo');
const usedBy = new Map(todo.map(p => [p.name, []]));
for (const p of todo.filter(x => x.type === 'formula')) for (const r of refsIn(p.formula.expression, 'todo')) if (r !== p.name) usedBy.get(r)?.push(`To Do formula "${p.name}"`);

const inbound = []; // rollups in other DBs reading To Do
for (const db of Object.keys(DBS).filter(d => d !== 'todo')) {
  const relsToTodo = props(db).filter(p => p.type === 'relation' && p.relation?.data_source_id?.replace(/-/g, '') === DATA_SOURCES.todo.replace(/-/g, ''));
  for (const p of props(db).filter(x => x.type === 'rollup')) {
    const viaName = relName(db, p.rollup);
    if (!relsToTodo.some(r => r.name === viaName)) continue;
    const target = todo.find(t => t.name === p.rollup.rollup_property_name || idsOf(t).includes(p.rollup.rollup_property_id));
    inbound.push({ db, name: p.name, via: viaName, target: target?.name || `(missing: ${p.rollup.rollup_property_name || p.rollup.rollup_property_id})`, fn: p.rollup.function });
    if (target) usedBy.get(target.name).push(`${DBS[db]} rollup "${p.name}"`);
  }
  for (const r of relsToTodo) {
    const back = todo.find(t => t.type === 'relation' && t.relation?.dual_property?.synced_property_name === r.name);
    if (back) usedBy.get(back.name).push(`${DBS[db]} relation "${r.name}"`);
  }
}

// Formulas in other DBs that depend (directly or through other formulas) on those rollups
const dependents = {};
for (const db of [...new Set(inbound.map(x => x.db))]) {
  const seeds = new Set(inbound.filter(x => x.db === db).map(x => x.name));
  const formulas = props(db).filter(p => p.type === 'formula');
  let grew = true;
  const hit = new Map();
  while (grew) {
    grew = false;
    for (const f of formulas) {
      if (hit.has(f.name)) continue;
      const refs = refsIn(f.formula.expression, db).filter(r => seeds.has(r) || hit.has(r));
      if (refs.length) { hit.set(f.name, refs); seeds.add(f.name); grew = true; }
    }
  }
  dependents[db] = [...hit].map(([name, refs]) => ({ name, refs, expr: readable(props(db).find(p => p.name === name).formula.expression, db) }));
}

// Backup rows
const rows = await queryAllPages('todo');
const plain = p => {
  switch (p.type) {
    case 'title': return p.title.map(t => t.plain_text).join('');
    case 'rich_text': return p.rich_text.map(t => t.plain_text).join('');
    case 'select': return p.select?.name ?? null;
    case 'status': return p.status?.name ?? null;
    case 'multi_select': return p.multi_select.map(o => o.name);
    case 'date': return p.date;
    case 'checkbox': return p.checkbox;
    case 'number': return p.number;
    case 'relation': return p.relation.map(r => r.id);
    case 'unique_id': return p.unique_id?.number ?? null;
    default: return undefined; // formulas / rollups are recomputed, not backed up
  }
};
const backup = rows.map(pg => ({ id: pg.id, url: pg.url, created: pg.created_time, edited: pg.last_edited_time,
  properties: Object.fromEntries(Object.entries(pg.properties).map(([k, v]) => [k, plain(v)]).filter(([, v]) => v !== undefined)) }));
fs.writeFileSync(path.join(ROOT, `_archive/todo-backup-${today}.json`), JSON.stringify(backup, null, 1));

// Report
const esc = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
let md = `# To Do DB audit (${today})\n\n${rows.length} rows backed up to \`_archive/todo-backup-${today}.json\`.\n\n## To Do properties\n\n| Property | Type | Definition | Used by |\n|---|---|---|---|\n`;
for (const p of todo.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))) {
  const def = p.type === 'formula' ? `\`${readable(p.formula.expression, 'todo')}\``
    : p.type === 'rollup' ? `${p.rollup.function} of ${p.rollup.rollup_property_name} via ${relName('todo', p.rollup)}`
    : p.type === 'relation' ? `→ ${Object.entries(DATA_SOURCES).find(([, id]) => id.replace(/-/g, '') === p.relation.data_source_id?.replace(/-/g, ''))?.[0] || p.relation.data_source_id}`
    : '';
  md += `| ${esc(p.name)} | ${p.type} | ${esc(def)} | ${esc(usedBy.get(p.name).join('; ')) || '—'} |\n`;
}
md += `\n## Rollups in other databases that read To Do\n\n| Database | Rollup | Via | Reads | Function |\n|---|---|---|---|---|\n`;
for (const x of inbound) md += `| ${DBS[x.db]} | ${esc(x.name)} | ${esc(x.via)} | ${esc(x.target)} | ${x.fn} |\n`;
md += `\n## Formulas elsewhere that depend on those rollups\n`;
for (const [db, list] of Object.entries(dependents)) {
  md += `\n### ${DBS[db]}\n\n`;
  md += list.length ? list.map(f => `- **${f.name}** ← ${f.refs.join(', ')}\n  \`${esc(f.expr)}\``).join('\n') + '\n' : 'None.\n';
}
fs.writeFileSync(path.join(ROOT, 'docs/todo-audit.md'), md);
console.log(`\nDone: ${rows.length} rows backed up, report in docs/todo-audit.md`);
