/**
 * GET /api/finishes-schedule
 * Returns all rows from the Finishes database.
 *
 * Confirmed Notion schema:
 *   CAD Ref         → title
 *   APPROVED        → select  ("A"|"B"|"C"|"Awaiting Approval"|"Not Submitted")
 *   Spec Ref        → multi_select
 *   Items           → relation → resolved to item names
 *   Suffix          → rollup  (text from Items.Suffix)
 *   Submitted on    → date    (note: lowercase 'on')
 *   Face Material, Fire Rating, Core, Matching Pattern,
 *   Brand, Supplier, Product Code, Finish Info,
 *   Sheen (%), Lipping, Sample Ref, Spec Class, Notes → text
 *   Action Required, Sample Type → select
 *
 * Env: NOTION_DB_FINISHES
 */
import {
  corsHeaders, tokenGuard, errResponse,
  fetchNotion, notionHeaders, queryAll,
  titleVal, selectVal, checkVal, dateVal, relIds,
} from './_helpers.js';

const DB          = process.env.NOTION_DB_FINISHES;
const NOTION_API  = 'https://api.notion.com/v1';

// ── Local helpers ─────────────────────────────────────────────────────────────
const rt = (p, k) => p[k]?.rich_text?.map(t => t.plain_text).join('') || null;

const rollupTxt = (p, k) => {
  const prop = p[k];
  if (!prop || prop.type !== 'rollup') return null;
  if (prop.rollup?.type === 'array') {
    return prop.rollup.array.map(item => {
      if (item.type === 'rich_text') return item.rich_text?.map(t => t.plain_text).join('');
      if (item.type === 'title')     return item.title?.map(t => t.plain_text).join('');
      if (item.type === 'select')    return item.select?.name;
      return null;
    }).filter(Boolean).join(', ') || null;
  }
  if (prop.rollup?.type === 'number') return String(prop.rollup.number ?? '');
  return null;
};

// Spec Ref is now a multi_select property
const multiSelect = (p, k) => p[k]?.multi_select?.map(o => o.name) ?? [];

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  const guard = tokenGuard(); if (guard) return guard;

  if (!DB) {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ configured: false, items: [] }),
    };
  }

  try {
    const pages = await queryAll(DB, null, {
      sorts: [{ property: 'CAD Ref', direction: 'ascending' }],
    });

    // ── Resolve Item names from relation ──────────────────────────────────────
    const allItemIds = [...new Set(
      pages.flatMap(page => (page.properties['Items']?.relation ?? []).map(r => r.id))
    )];
    const itemNameMap = new Map();
    await Promise.all(allItemIds.slice(0, 150).map(async id => {
      try {
        const r = await fetchNotion(`${NOTION_API}/pages/${id}`, {
          headers: notionHeaders(),
        });
        if (r.ok) {
          const pg = await r.json();
          const titleProp = Object.values(pg.properties || {}).find(p => p.type === 'title');
          const name = titleProp?.title?.[0]?.plain_text ?? null;
          if (name) itemNameMap.set(id, name);
        }
      } catch { /* skip failed lookups */ }
    }));

    const items = pages.map(page => {
      const p = page.properties;

      const itemIds   = (p['Items']?.relation ?? []).map(r => r.id);
      const itemNames = itemIds.map(id => itemNameMap.get(id)).filter(Boolean);

      const materialType    = rt(p, 'Material Type');
      const faceMaterial    = rt(p, 'Face Material');
      const fireRating      = rt(p, 'Fire Rating');
      const core            = rt(p, 'Core');
      const matchingPattern = rt(p, 'Matching Pattern');
      const brand           = rt(p, 'Brand');
      const supplier        = rt(p, 'Supplier');
      const productCode     = rt(p, 'Product Code');
      const finish          = rt(p, 'Finish');
      const sheen           = rt(p, 'Sheen (%)');
      const lipping         = rt(p, 'Lipping');

      // Default order — frontend may override for display, but this drives CSV
      const finishDescription = [
        materialType, supplier, brand, faceMaterial, core,
        finish, productCode, matchingPattern, fireRating, sheen, lipping,
      ].filter(Boolean).join(' | ') || null;

      return {
        id:                  page.id,
        itemNames,
        itemIds,
        projectId:           (relIds(p, 'Project') || [])[0] ?? null,
        cadRef:              titleVal(p, 'CAD Ref'),
        specRef:             multiSelect(p, 'Spec Ref'),  // multi_select → array of strings
        finishDescription,
        materialType,
        faceMaterial,
        fireRating,
        core,
        matchingPattern,
        brand,
        supplier,
        productCode,
        finish,
        sheen,
        lipping,
        sampleRef:           rt(p, 'Sample Ref'),
        sampleType:          selectVal(p, 'Sample Type'),
        suffix:              rollupTxt(p, 'Suffix'),
        approved:            selectVal(p, 'APPROVED'),
        actionRequired:      selectVal(p, 'Action Required'),
        submittedOn:         dateVal(p, 'Submitted on'),
        specClass:           rt(p, 'Spec Class'),
        notes:               rt(p, 'Notes'),
        cuttingListRequired: false,
      };
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ configured: true, items }),
    };
  } catch (err) {
    return errResponse('finishes-schedule', err);
  }
};
