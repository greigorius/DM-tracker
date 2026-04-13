import { useState, useCallback, useEffect } from 'react';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const ISSUED_FOR_OPTIONS = [
  { value: 'A4.5',         label: 'A4.5 - AUTHORISED MFG. and CONST. DESIGN' },
  { value: 'APPROVAL',     label: 'APPROVAL' },
  { value: 'AS BUILT',     label: 'AS BUILT' },
  { value: 'CONSTRUCTION', label: 'CONSTRUCTION' },
  { value: 'INFORMATION',  label: 'INFORMATION' },
  { value: 'S4',           label: 'S4 - FOR REVIEW AND AUTHORISATION' },
  { value: 'S5',           label: 'S5 - FOR REVIEW AND ACCEPTANCE' },
];

function buildPageRows(manualProject, manualSel) {
  const issuedForLabel = ISSUED_FOR_OPTIONS.find(o => o.value === manualSel?.issuedFor)?.label || null;
  const statusBy =
    manualSel?.issuedFor === 'S5'           ? manualProject?.mainContractor :
    manualSel?.issuedFor === 'A4.5'         ? manualProject?.architect : null;

  return [
    { field: 'projectName',   label: 'Project Name',    expected: manualProject?.projectName    || null },
    { field: 'projectNumber', label: 'Project Number',  expected: manualProject?.projectNumber  || null },
    { field: 'clientName',    label: 'Client Name',     expected: manualProject?.mainContractor || null },
    { field: 'suffixNumber',  label: 'Suffix Number',   expected: manualSel?.suffixNumber                    || null },
    { field: 'drawingNumber', label: 'Drawing Number',  expected: manualSel?.drawingNumber                   || null },
    { field: 'drawingTitle',  label: 'Drawing Title 1', expected: manualSel?.notionRow?.drawingTitle1        || null },
    { field: 'drawingTitle2', label: 'Drawing Title 2', expected: manualSel?.notionRow?.drawingTitle2        || null },
    { field: 'drawingTitle3', label: 'Drawing Title 3', expected: manualSel?.notionRow?.drawingTitle3        || null },
    { field: 'revision',      label: 'Revision',        expected: manualSel?.notionRow?.revision             || null },
    { field: 'issuedFor',     label: 'Issued For',      expected: issuedForLabel },
    { field: 'status',        label: 'Status',          expected: manualSel?.notionRow?.s5Status             || null },
    { field: 'statusBy',      label: 'Status By',       expected: statusBy },
    { field: 'statusDate',    label: 'Status Date',     expected: manualSel?.notionRow?.s5StatusDate         || null },
    { field: 'author',        label: 'Author',          expected: manualSel?.notionRow?.assignedTo           || null },
  ];
}

// ── Canvas drawing helpers ──

function roundedRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawPinAnnotations(ctx, pinsForPage, failItems, canvasWidth, canvasHeight) {
  const RADIUS    = 12;
  const CALLOUT_W = 220;
  const CALLOUT_H = 44;

  failItems.forEach((fi, i) => {
    const pin = pinsForPage[fi.field];
    if (!pin) return;
    const n  = i + 1;
    const px = pin.x * canvasWidth;
    const py = pin.y * canvasHeight;
    const calloutX = Math.max(10, px - CALLOUT_W - 18);
    const calloutY = Math.max(10, py - CALLOUT_H / 2);

    ctx.save(); ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 5;
    ctx.beginPath(); roundedRect(ctx, calloutX, calloutY, CALLOUT_W, CALLOUT_H, 4);
    ctx.fill(); ctx.restore();
    ctx.save(); ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1.5;
    ctx.beginPath(); roundedRect(ctx, calloutX, calloutY, CALLOUT_W, CALLOUT_H, 4);
    ctx.stroke(); ctx.restore();

    ctx.save(); ctx.fillStyle = '#6b7280'; ctx.font = '8px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(fi.label.toUpperCase(), calloutX + 8, calloutY + 14); ctx.restore();
    ctx.save(); ctx.fillStyle = '#dc2626'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText((fi.expected ? String(fi.expected).slice(0, 40) : '(none)'), calloutX + 8, calloutY + 30); ctx.restore();

    ctx.save(); ctx.strokeStyle = '#dc2626'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(calloutX + CALLOUT_W, py); ctx.lineTo(px - RADIUS, py);
    ctx.stroke(); ctx.setLineDash([]); ctx.restore();

    ctx.save(); ctx.fillStyle = '#dc2626'; ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.arc(px, py, RADIUS, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
    ctx.save(); ctx.fillStyle = 'white'; ctx.font = `bold ${RADIUS > 10 ? 10 : 9}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), px, py); ctx.restore();
  });

  const unplaced = failItems.filter(fi => !pinsForPage[fi.field]);
  if (unplaced.length > 0) {
    const listX = canvasWidth - 230;
    unplaced.forEach((fi, i) => {
      const n = failItems.indexOf(fi) + 1;
      const y = 20 + i * 52;
      ctx.save(); ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 4;
      ctx.beginPath(); roundedRect(ctx, listX, y, 210, 44, 4); ctx.fill(); ctx.restore();
      ctx.save(); ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1.5;
      ctx.beginPath(); roundedRect(ctx, listX, y, 210, 44, 4); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.fillStyle = '#dc2626';
      ctx.beginPath(); ctx.arc(listX + 16, y + 22, 9, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = 'white'; ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), listX + 16, y + 22); ctx.restore();
      ctx.save(); ctx.fillStyle = '#6b7280'; ctx.font = '8px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(fi.label.toUpperCase(), listX + 30, y + 15); ctx.restore();
      ctx.save(); ctx.fillStyle = '#dc2626'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText((fi.expected ? String(fi.expected).slice(0, 35) : '(none)'), listX + 30, y + 30); ctx.restore();
    });
  }
}

async function buildAnnotatedPdf(pdfPageData) {
  const FAIL_RED   = rgb(0.86, 0.15, 0.15);
  const LABEL_GRAY = rgb(0.42, 0.45, 0.50);
  const WHITE      = rgb(1, 1, 1);
  const PIN_RADIUS = 8;
  const CALLOUT_W  = 120;
  const CALLOUT_H  = 28;

  const exportDoc      = await PDFDocument.create();
  const helvetica      = await exportDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold  = await exportDoc.embedFont(StandardFonts.HelveticaBold);

  for (const { pngBase64, pageWidthPt, pageHeightPt, annotations = [], unplaced = [] } of pdfPageData) {
    const pngBytes = Uint8Array.from(atob(pngBase64), c => c.charCodeAt(0));
    const pngImage = await exportDoc.embedPng(pngBytes);
    const page     = exportDoc.addPage([pageWidthPt, pageHeightPt]);

    page.drawImage(pngImage, { x: 0, y: 0, width: pageWidthPt, height: pageHeightPt });

    for (const ann of annotations) {
      const px = ann.x * pageWidthPt;
      const py = (1 - ann.y) * pageHeightPt;
      const calloutX = Math.max(10, px - CALLOUT_W - 12);
      const calloutY = Math.max(10, Math.min(pageHeightPt - CALLOUT_H - 10, py - CALLOUT_H / 2));

      page.drawRectangle({ x: calloutX, y: calloutY, width: CALLOUT_W, height: CALLOUT_H, color: WHITE, borderColor: FAIL_RED, borderWidth: 1 });
      page.drawText(ann.label.toUpperCase(), { x: calloutX + 5, y: calloutY + CALLOUT_H - 11, font: helvetica, size: 5, color: LABEL_GRAY });
      const expectedStr = ann.expected ? String(ann.expected).slice(0, 35) : '(none)';
      page.drawText(expectedStr, { x: calloutX + 5, y: calloutY + 5, font: helveticaBold, size: 6, color: FAIL_RED });
      page.drawLine({ start: { x: calloutX + CALLOUT_W, y: py }, end: { x: px - PIN_RADIUS, y: py }, thickness: 0.75, color: FAIL_RED, lineDashPattern: [4, 3] });
      page.drawCircle({ x: px, y: py, size: PIN_RADIUS, color: FAIL_RED });
      const nStr = String(ann.n);
      const textWidth = helveticaBold.widthOfTextAtSize(nStr, 7);
      page.drawText(nStr, { x: px - textWidth / 2, y: py - 7 * 0.35, font: helveticaBold, size: 7, color: WHITE });
    }

    if (unplaced.length > 0) {
      const LIST_W = 130, LIST_H = 28, LIST_GAP = 4;
      const listX  = pageWidthPt - LIST_W - 10;
      unplaced.forEach((ann, i) => {
        const boxY = pageHeightPt - 10 - (i + 1) * (LIST_H + LIST_GAP);
        page.drawRectangle({ x: listX, y: boxY, width: LIST_W, height: LIST_H, color: WHITE, borderColor: FAIL_RED, borderWidth: 1 });
        const badgeX = listX + 10, badgeY = boxY + LIST_H / 2;
        page.drawCircle({ x: badgeX, y: badgeY, size: 7, color: FAIL_RED });
        const nStr = String(ann.n);
        const nW   = helveticaBold.widthOfTextAtSize(nStr, 6);
        page.drawText(nStr,               { x: badgeX - nW / 2, y: badgeY - 6 * 0.35, font: helveticaBold, size: 6, color: WHITE });
        page.drawText(ann.label.toUpperCase(), { x: listX + 22, y: boxY + LIST_H - 11, font: helvetica,     size: 5, color: LABEL_GRAY });
        const expStr = ann.expected ? String(ann.expected).slice(0, 22) : '(none)';
        page.drawText(expStr,             { x: listX + 22, y: boxY + 5,           font: helveticaBold, size: 6, color: FAIL_RED });
      });
    }
  }

  const pdfBytes = await exportDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

function canvasToBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

async function openSaveDialog(suggestedName, mimeType, extensions) {
  if (!('showSaveFilePicker' in window)) return null;
  try {
    return await window.showSaveFilePicker({
      suggestedName,
      types: [{ description: mimeType, accept: { [mimeType]: extensions } }],
    });
  } catch (e) {
    if (e.name === 'AbortError') return 'cancelled';
    return null;
  }
}

async function writeToHandle(handle, blob) {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

const SECTION_KEY = 'export-markups';

export default function DTExportSection({
  pdfs,
  filterByOptions,
  getOverride,
  collapsed,
  toggleCollapse,
  pins = {},
  finishesOverrides = {},
}) {
  const isCollapsed = collapsed[SECTION_KEY];
  const checkedDone = pdfs.filter(p => p.checked && p.pdfDoc);

  const [exportPdf,     setExportPdf]     = useState(true);
  const [exportPng,     setExportPng]     = useState(true);
  const [exporting,     setExporting]     = useState(false);
  const [progress,      setProgress]      = useState('');
  const [result,        setResult]        = useState(null);
  // { [pdfId]: Set<pageIndex> } — which pages to include in the export
  const [selectedPages, setSelectedPages] = useState({});

  // Keep selectedPages in sync as checkedDone changes
  useEffect(() => {
    setSelectedPages(prev => {
      const next = {};
      for (const pdf of checkedDone) {
        next[pdf.id] = prev[pdf.id] instanceof Set
          ? prev[pdf.id]
          : new Set(Array.from({ length: pdf.totalPages }, (_, i) => i));
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedDone.map(p => p.id).join(',')]);

  const togglePage = useCallback((pdfId, pi) => {
    setSelectedPages(prev => {
      const cur = new Set(prev[pdfId] || []);
      if (cur.has(pi)) cur.delete(pi); else cur.add(pi);
      return { ...prev, [pdfId]: cur };
    });
  }, []);

  const toggleAllPdfPages = useCallback((pdfId, totalPages) => {
    setSelectedPages(prev => {
      const cur = prev[pdfId] || new Set();
      const all = cur.size === totalPages;
      return { ...prev, [pdfId]: all ? new Set() : new Set(Array.from({ length: totalPages }, (_, i) => i)) };
    });
  }, []);

  const totalSelectedPages = checkedDone.reduce((s, pdf) => s + (selectedPages[pdf.id]?.size ?? pdf.totalPages), 0);
  const canExport = (exportPdf || exportPng) && totalSelectedPages > 0;

  const handleExport = useCallback(async () => {
    if (!canExport) return;

    const now         = new Date();
    const yy          = String(now.getFullYear()).slice(2);
    const mm          = String(now.getMonth() + 1).padStart(2, '0');
    const dd          = String(now.getDate()).padStart(2, '0');
    const datePrefix  = `${yy}${mm}${dd}`;
    const zipBasename = `${datePrefix}_DM_Checks`;

    const firstDrawingNum = checkedDone[0]?.manualSelections?.[0]?.drawingNumber || '';
    const drawingNumX     = firstDrawingNum ? `${firstDrawingNum.slice(0, -1)}X` : '';
    const pdfBasename     = drawingNumX ? `${zipBasename}_${drawingNumX}` : zipBasename;

    let outputType;
    if (exportPdf && !exportPng)                                          outputType = 'pdf';
    else if (!exportPdf && exportPng && totalSelectedPages === 1)         outputType = 'png';
    else                                                                   outputType = 'zip';

    const suggestedName =
      outputType === 'pdf' ? `${pdfBasename}.pdf`
      : outputType === 'png' ? `${firstDrawingNum || zipBasename}.png`
      : `${zipBasename}.zip`;

    const mimeTypes = { pdf: ['application/pdf', ['.pdf']], png: ['image/png', ['.png']], zip: ['application/zip', ['.zip']] };
    const [mime, exts] = mimeTypes[outputType];
    const fileHandle = await openSaveDialog(suggestedName, mime, exts);
    if (fileHandle === 'cancelled') return;

    setExporting(true); setResult(null);
    const EXPORT_SCALE = 150 / 72;

    try {
      const pdfPageData = []; const pngBlobs = []; const pngNames = [];
      let pageNum = 0;

      for (const pdf of checkedDone) {
        const pageSet    = selectedPages[pdf.id] || new Set(Array.from({ length: pdf.totalPages }, (_, i) => i));
        const pagesSorted = [...pageSet].sort((a, b) => a - b);

        for (const pi of pagesSorted) {
          pageNum++;
          setProgress(`Rendering page ${pageNum} of ${totalSelectedPages}\u2026`);

          const manualSel     = pdf.manualSelections?.[pi] || {};
          const manualProject = pdf.manualProject || null;
          const standardRows  = filterByOptions(buildPageRows(manualProject, manualSel));
          const customRows    = (pdf.customFields?.[pi] || []).map(cf => ({ field: cf.id, label: cf.section || 'Custom', expected: cf.expected || null }));
          const failItems     = [...standardRows, ...customRows]
            .filter(r => getOverride?.(pdf.id, pi, r.field) === 'fail')
            .map(r => ({ field: r.field, label: r.label, expected: r.expected || '' }));

          if (pi === 0) {
            (pdf.finishesRows || []).forEach((row, i) => {
              if (finishesOverrides[`${pdf.id}-${i}`] === 'fail') {
                failItems.push({ field: `finishes-row-${i}`, label: `Finishes: ${row.cadRef || row.specRef || `Row ${i + 1}`}`, expected: row.finishDescription || '' });
              }
            });
          }

          const pdfPage  = await pdf.pdfDoc.getPage(pi + 1);
          const vp1      = pdfPage.getViewport({ scale: 1 });
          const viewport = pdfPage.getViewport({ scale: EXPORT_SCALE });
          const canvas   = document.createElement('canvas');
          canvas.width   = Math.floor(viewport.width);
          canvas.height  = Math.floor(viewport.height);
          const ctx      = canvas.getContext('2d');
          await pdfPage.render({ canvasContext: ctx, viewport }).promise;

          if (exportPdf) {
            const pinsForThisPage = pins[pdf.id]?.[pi] || {};
            const annotations = []; const unplaced = [];
            failItems.forEach((fi, i) => {
              const pin = pinsForThisPage[fi.field];
              if (pin) annotations.push({ n: i + 1, x: pin.x, y: pin.y, label: fi.label, expected: fi.expected });
              else     unplaced.push({ n: i + 1, label: fi.label, expected: fi.expected });
            });
            pdfPageData.push({ pngBase64: canvas.toDataURL('image/png').split(',')[1], pageWidthPt: vp1.width, pageHeightPt: vp1.height, annotations, unplaced });
          }

          if (exportPng) {
            if (failItems.length > 0) {
              drawPinAnnotations(ctx, pins[pdf.id]?.[pi] || {}, failItems, canvas.width, canvas.height);
            }
            const blob = await canvasToBlob(canvas);
            pngBlobs.push(blob);
            pngNames.push(`${manualSel?.drawingNumber || `page-${pi + 1}`}.png`);
          }
        }
      }

      let pdfBlob = null;
      if (exportPdf && pdfPageData.length > 0) {
        setProgress('Generating PDF\u2026');
        pdfBlob = await buildAnnotatedPdf(pdfPageData);
      }

      setProgress('Saving\u2026');
      let finalBlob;
      if (outputType === 'zip') {
        const zip = new JSZip();
        if (pdfBlob) zip.file(`${pdfBasename}.pdf`, pdfBlob);
        pngBlobs.forEach((blob, i) => zip.file(pngNames[i], blob));
        finalBlob = await zip.generateAsync({ type: 'blob' });
      } else if (outputType === 'pdf') {
        finalBlob = pdfBlob;
      } else {
        finalBlob = pngBlobs[0];
      }

      if (!finalBlob) throw new Error('Nothing to save');
      if (fileHandle) await writeToHandle(fileHandle, finalBlob);
      else            downloadBlob(finalBlob, suggestedName);

      const parts = [];
      if (exportPdf && pdfBlob)             parts.push('1 PDF');
      if (exportPng && pngBlobs.length > 0) parts.push(`${pngBlobs.length} PNG${pngBlobs.length !== 1 ? 's' : ''}`);
      setResult({ ok: true, msg: `Exported ${parts.join(' and ')}` });
    } catch (err) {
      console.error('Export error:', err);
      setResult({ ok: false, msg: `Export failed: ${err.message}` });
    } finally {
      setExporting(false); setProgress('');
    }
  }, [canExport, checkedDone, totalSelectedPages, selectedPages, filterByOptions, getOverride, exportPdf, exportPng, pins, finishesOverrides]);

  return (
    <div className="v-section">
      <button className="v-section-header" onClick={() => toggleCollapse(SECTION_KEY)}>
        <div className="v-section-left">
          <span className={`v-chevron ${isCollapsed ? 'v-chevron-closed' : ''}`}>&#9662;</span>
          <h3 className="v-section-title">Export Mark-ups</h3>
        </div>
        {totalSelectedPages > 0 && (
          <div className="v-section-counts">
            <span className="sc-pass">{totalSelectedPages} page{totalSelectedPages !== 1 ? 's' : ''}</span>
          </div>
        )}
      </button>

      {!isCollapsed && (
        <div className="export-inline-body">
          <div className="export-cols">
            <div className="export-col">
              <div className="export-col-label">Formats</div>
              <label className="export-check-row">
                <input type="checkbox" checked={exportPdf} onChange={e => setExportPdf(e.target.checked)} disabled={exporting} />
                <div><div className="export-check-title">PDF (merged)</div></div>
              </label>
              <label className="export-check-row">
                <input type="checkbox" checked={exportPng} onChange={e => setExportPng(e.target.checked)} disabled={exporting} />
                <div><div className="export-check-title">PNG (150 DPI)</div><div className="export-check-hint">one per page</div></div>
              </label>
            </div>
            <div className="export-col">
              <div className="export-col-label">Pages</div>
              {checkedDone.length === 0 ? (
                <p className="export-no-checks">No drawings selected.</p>
              ) : (
                <div className="export-drawings-list">
                  {checkedDone.map(pdf => {
                    const pageSet  = selectedPages[pdf.id] || new Set();
                    const allSel   = pageSet.size === pdf.totalPages;
                    const drawName = pdf.manualSelections?.[0]?.drawingNumber || pdf.displayName;
                    return (
                      <div key={pdf.id} className="export-pdf-group">
                        {/* PDF-level toggle row */}
                        <label className="export-drawing-item export-drawing-item-parent">
                          <input
                            type="checkbox"
                            checked={allSel}
                            onChange={() => toggleAllPdfPages(pdf.id, pdf.totalPages)}
                            disabled={exporting}
                          />
                          <span className="export-drawing-name" title={pdf.displayName}>{drawName}</span>
                          <span className="export-drawing-pages">{pageSet.size}/{pdf.totalPages}p</span>
                        </label>
                        {/* Per-page rows (always shown for multi-page) */}
                        {pdf.totalPages > 1 && Array.from({ length: pdf.totalPages }, (_, pi) => {
                          const pageDrawNum = pdf.manualSelections?.[pi]?.drawingNumber;
                          const pageLabel   = pageDrawNum || `Page ${pi + 1}`;
                          return (
                            <label key={pi} className="export-drawing-item export-drawing-item-page">
                              <input
                                type="checkbox"
                                checked={pageSet.has(pi)}
                                onChange={() => togglePage(pdf.id, pi)}
                                disabled={exporting}
                              />
                              <span className="export-drawing-name">{pageLabel}</span>
                            </label>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {exporting && (
            <div className="export-progress-row">
              <div className="spinner spinner-small" style={{ display: 'inline-block', marginRight: 6 }} />
              <span>{progress}</span>
            </div>
          )}

          {result && (
            <div className={`export-result ${result.ok ? 'export-result-ok' : 'export-result-err'}`}>
              {result.msg}
            </div>
          )}

          <button
            className="btn btn-export"
            onClick={handleExport}
            disabled={!canExport || exporting}
          >
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      )}
    </div>
  );
}
