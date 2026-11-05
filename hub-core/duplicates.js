// Possible duplicate actions. Meeting transcriptions repeat the same action in
// different words ("Chase DRS-303 hardware schedule" / "chase hardware sched
// for door 303"), so this compares meaning-carrying words rather than text:
// TF-IDF cosine over normalised words, plus character trigrams to catch
// spelling and spacing drift (DRS303 / DRS-303 / drs 303).
//
// Only open actions are compared. Pairs that share an item need less overlap
// than pairs that only share a project; actions with no item are compared with
// everything at the higher bar. Pure: runs in the browser and in tests.

const STOP = new Set(`a an and are as at be been by can could do does for from get got has have he her his i if in into is it its
let me more my need needs needed no not of on or our out please re shall she so some still than that the their them then there these they
this those to too up us via was we were what when where which who will with would you your also just make sure confirm confirmed check
ok okay action actions item items update updated asap today tomorrow week next`.split(/\s+/));

const stem = w => w.length > 4 ? w.replace(/(ings|ing|ed|es|s)$/, '') : w;

export function words(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/([a-z])[-_/.]+(\d)/g, '$1$2')          // DRS-303 → drs303
    .replace(/\b([a-z]{1,4})\s+(\d{2,})\b/g, '$1$2')  // DRS 303 → drs303 (short prefixes only)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(w => w && !STOP.has(w) && (w.length > 1 || /\d/.test(w)))
    .map(stem);
}

function trigrams(s) {
  const t = ` ${String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '')} `;
  const out = new Set();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n);
}

// Reference numbers (3+ digits: drawing / door / VC numbers). Two actions that
// each name a reference the other doesn't are about different things, however
// alike the wording ("Review …-27240" / "Review …-27241").
const refs = ws => new Set(ws.filter(w => /\d{3,}/.test(w)));
const differentRefs = (a, b) => [...a].some(x => !b.has(x)) && [...b].some(x => !a.has(x));

export const pairKey = (a, b) => [a, b].sort().join('|');

export const THRESHOLD = { item: 0.5, project: 0.6, any: 0.7 };

/**
 * @param {object[]} actions   actions snapshot rows
 * @param {object}   [opts]
 * @param {Map}      [opts.items]      item id → tasks row (for projectId)
 * @param {Iterable} [opts.dismissed]  pairKeys marked "not a duplicate"
 * @returns {{ a, b, score, shared: 'item'|'project'|'any', key }[]} best first
 */
export function findDuplicatePairs(actions, { items, dismissed } = {}) {
  const open = actions.filter(r => !r.archived && !r.done && r.type !== 'Note' && (r.title || '').trim());
  const skip = new Set(dismissed || []);

  const docs = open.map(r => { const w = words(r.title); return { r, w, refs: refs(w), g: trigrams(r.title) }; });
  const df = new Map();
  for (const d of docs) for (const w of new Set(d.w)) df.set(w, (df.get(w) || 0) + 1);
  const N = docs.length || 1;
  for (const d of docs) {
    const tf = new Map();
    for (const w of d.w) tf.set(w, (tf.get(w) || 0) + 1);
    d.vec = new Map([...tf].map(([w, n]) => [w, n * Math.log(1 + N / df.get(w))]));
    d.norm = Math.sqrt([...d.vec.values()].reduce((s, x) => s + x * x, 0)) || 1;
    d.projects = new Set((d.r.itemIds || []).map(id => items?.get?.(id)?.projectId).filter(Boolean));
  }

  const out = [];
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const A = docs[i], B = docs[j];
      const key = pairKey(A.r.id, B.r.id);
      if (skip.has(key)) continue;
      const aItems = A.r.itemIds || [], bItems = B.r.itemIds || [];
      let shared;
      if (aItems.some(id => bItems.includes(id))) shared = 'item';
      else if ([...A.projects].some(p => B.projects.has(p))) shared = 'project';
      else if (aItems.length && bItems.length) continue;          // filed on different items in different projects
      else shared = 'any';

      if (differentRefs(A.refs, B.refs)) continue;

      let dot = 0;
      for (const [w, x] of A.vec) { const y = B.vec.get(w); if (y) dot += x * y; }
      const cos = dot / (A.norm * B.norm);
      const score = Math.max(cos, jaccard(A.g, B.g) * 0.9);
      if (score >= THRESHOLD[shared]) out.push({ a: A.r, b: B.r, score: Math.round(score * 100) / 100, shared, key });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

// Ids of actions in any pair (for the "possible duplicate" badge).
export const duplicateIds = pairs => new Set(pairs.flatMap(p => [p.a.id, p.b.id]));
