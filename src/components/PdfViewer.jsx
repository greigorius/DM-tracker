import { useRef, useEffect, useState, useCallback } from 'react';
import SketchCanvas, { toolCursor } from './SketchCanvas.jsx';
import DrawingToolbar from './DrawingToolbar.jsx';
import { useSketchPaste } from '../hooks/useSketchPaste.js';

function PdfViewer({
  pdfDoc,
  pageNumber,
  scale,
  pins = [],
  activeField,
  onPinClick,
  onPinDragEnd,
  onPinDelete,
  onPageClick,   // (fracX, fracY) — fired when canvas is clicked (not on a pin), pan tool only
  onScaleChange, // (newScale: number) — fired on scroll-wheel zoom
  // ── Sketch props ──
  sketches       = [],   // committed sketch objects for the current page
  onAddObject,           // (obj) => void
  onRemoveObject,        // (index) => void
  onUndoSketch,          // () => void
  onClearSketches,       // () => void
  onUpdateObject,        // (index, newObj) => void  — for select/move
}) {
  const canvasRef          = useRef(null);
  const containerRef       = useRef(null);
  const wrapperRef         = useRef(null);
  const renderTaskRef      = useRef(null);
  const effectiveScaleRef  = useRef(1);
  const isPanningRef       = useRef(false);
  const [loading, setLoading]       = useState(false);
  const [canvasDims, setCanvasDims] = useState({ width: 0, height: 0 });

  // ── Drawing tool state (local to viewer) ──
  const [activeTool,         setActiveTool]         = useState('pan');
  const [activeColor,        setActiveColor]        = useState('#ef4444');
  const [activeWidth,        setActiveWidth]        = useState(2);
  const [activeFontSizeFrac, setActiveFontSizeFrac] = useState(0.025);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      // Ctrl/Cmd+Z → undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); onUndoSketch?.(); return; }
      // Escape → pan
      if (e.key === 'Escape') { setActiveTool('pan'); return; }
      // Tool shortcuts
      const map = { s: 'select', p: 'pen', h: 'highlight', a: 'arrow', r: 'rect', e: 'ellipse', l: 'line', t: 'text', x: 'eraser' };
      if (!e.ctrlKey && !e.metaKey && !e.altKey && map[e.key]) setActiveTool(map[e.key]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onUndoSketch]);

  // ── Paste images from clipboard ──
  const handlePaste = useCallback((dataUrl, naturalWidth, naturalHeight) => {
    if (!canvasDims.width || !canvasDims.height) return;
    const w = 0.45; // 45% of canvas width
    const h = (w * canvasDims.width * naturalHeight) / (naturalWidth * canvasDims.height);
    onAddObject?.({ type: 'image', x: 0.05, y: 0.05, w, h: Math.min(h, 0.9), dataUrl });
  }, [canvasDims, onAddObject]);

  useSketchPaste(handlePaste, !!pdfDoc);

  // ── PDF render ──
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !containerRef.current) return;
    let cancelled = false;

    const renderPage = async () => {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
        renderTaskRef.current = null;
      }
      setLoading(true);
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;
        const container = containerRef.current;
        const canvas    = canvasRef.current;
        if (!container || !canvas) return;

        const viewport0 = page.getViewport({ scale: 1 });
        let effectiveScale;
        if (scale != null) {
          effectiveScale = scale;
        } else {
          const scaleX = container.clientWidth  / viewport0.width;
          const scaleY = container.clientHeight / viewport0.height;
          effectiveScale = Math.min(scaleX, scaleY);
        }
        if (!effectiveScale || effectiveScale <= 0) effectiveScale = 1.0;
        effectiveScaleRef.current = effectiveScale;

        const vp  = page.getViewport({ scale: effectiveScale });
        const dpr = window.devicePixelRatio || 1;
        const cssWidth  = Math.floor(vp.width);
        const cssHeight = Math.floor(vp.height);

        canvas.width  = Math.floor(vp.width  * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        canvas.style.width  = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        setCanvasDims({ width: cssWidth, height: cssHeight });

        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const renderTask = page.render({ canvasContext: ctx, viewport: vp });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException' && !cancelled) {
          console.error('PDF render error:', err);
          setLoading(false);
        }
      }
    };

    renderPage();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
        renderTaskRef.current = null;
      }
    };
  }, [pdfDoc, pageNumber, scale]);

  // ── Scroll-wheel zoom ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e) => {
      if (!onScaleChange) return;
      e.preventDefault();
      const factor   = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newScale = Math.max(0.2, Math.min(4.0, effectiveScaleRef.current * factor));
      onScaleChange(newScale);
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [onScaleChange]);

  // ── Drag-to-pan (only when pan tool is active) ──
  const handleContainerMouseDown = useCallback((e) => {
    if (activeTool !== 'pan') return;
    if (e.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;

    const origX  = e.clientX;
    const origY  = e.clientY;
    const startScrollLeft = container.scrollLeft;
    const startScrollTop  = container.scrollTop;
    let moved = false;

    const onMove = (me) => {
      if (!moved && (Math.abs(me.clientX - origX) > 3 || Math.abs(me.clientY - origY) > 3)) {
        moved = true;
        isPanningRef.current = true;
        container.style.cursor = 'grabbing';
      }
      if (moved) {
        container.scrollLeft = startScrollLeft - (me.clientX - origX);
        container.scrollTop  = startScrollTop  - (me.clientY - origY);
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      container.style.cursor = '';
      setTimeout(() => { isPanningRef.current = false; }, 0);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [activeTool]);

  // ── Pin drag ──
  const handlePinDragStart = useCallback((e, pin) => {
    e.preventDefault();
    e.stopPropagation();
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const pinEl        = e.currentTarget;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let hasMoved = false;

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startClientX;
      const dy = moveEvent.clientY - startClientY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
      if (hasMoved) {
        const rect     = wrapper.getBoundingClientRect();
        const newFracX = pin.x + dx / rect.width;
        const newFracY = pin.y + dy / rect.height;
        pinEl.style.left = `${Math.max(0, Math.min(1, newFracX)) * 100}%`;
        pinEl.style.top  = `${Math.max(0, Math.min(1, newFracY)) * 100}%`;
      }
    };

    const onUp = (upEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      if (hasMoved) {
        const rect  = wrapper.getBoundingClientRect();
        const dx    = upEvent.clientX - startClientX;
        const dy    = upEvent.clientY - startClientY;
        const newX  = Math.max(0, Math.min(1, pin.x + dx / rect.width));
        const newY  = Math.max(0, Math.min(1, pin.y + dy / rect.height));
        onPinDragEnd?.(pin.field, newX, newY);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [onPinDragEnd]);

  const containerCursor = activeTool === 'pan' ? (onPageClick ? 'crosshair' : 'grab') : toolCursor(activeTool);

  return (
    <div className="pdf-viewer-root">
      {/* ── Drawing toolbar ── */}
      <DrawingToolbar
        activeTool={activeTool}          setActiveTool={setActiveTool}
        activeColor={activeColor}        setActiveColor={setActiveColor}
        activeWidth={activeWidth}        setActiveWidth={setActiveWidth}
        activeFontSizeFrac={activeFontSizeFrac} setActiveFontSizeFrac={setActiveFontSizeFrac}
        onUndo={onUndoSketch}
        onClear={onClearSketches}
        hasObjects={sketches.length > 0}
        disabled={!pdfDoc}
      />

      {/* ── Scrollable PDF area ── */}
      <div
        className="pdf-container"
        ref={containerRef}
        onMouseDown={handleContainerMouseDown}
        style={{ overflow: 'auto', cursor: containerCursor, flex: 1, minHeight: 0 }}
      >
        <div className="pdf-center-wrapper">
          {loading && <div className="pdf-loading">Loading page…</div>}
          <div
            className="pdf-page-wrapper"
            ref={wrapperRef}
            onClick={e => {
              if (activeTool !== 'pan') return; // only fire in pan mode
              if (!onPageClick || !wrapperRef.current) return;
              if (isPanningRef.current) return;
              const rect = wrapperRef.current.getBoundingClientRect();
              onPageClick(
                (e.clientX - rect.left) / rect.width,
                (e.clientY - rect.top)  / rect.height,
              );
            }}
            style={{
              position:    'relative',
              display:     'inline-block',
              width:       canvasDims.width  || undefined,
              height:      canvasDims.height || undefined,
              cursor:      'inherit',
            }}
          >
            {/* Layer 1: PDF */}
            <canvas ref={canvasRef} className="pdf-canvas" />

            {/* Layer 2: Sketch overlay */}
            {canvasDims.width > 0 && (
              <SketchCanvas
                sketches={sketches}
                onAddObject={onAddObject}
                onRemoveObject={onRemoveObject}
                onUpdateObject={onUpdateObject}
                activeTool={activeTool}
                activeColor={activeColor}
                activeWidth={activeWidth}
                activeFontSizeFrac={activeFontSizeFrac}
                canvasDims={canvasDims}
              />
            )}

            {/* Layer 3: Pins (always on top) */}
            {canvasDims.width > 0 && (
              <div className="pdf-pin-overlay">
                {pins.map(pin => (
                  <div
                    key={pin.field}
                    className={`pdf-pin ${activeField === pin.field ? 'pdf-pin-active' : ''}`}
                    style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                    onMouseDown={(e) => handlePinDragStart(e, pin)}
                    onClick={(e) => { e.stopPropagation(); onPinClick?.(pin.field); }}
                    onContextMenu={(e) => { e.preventDefault(); onPinDelete?.(pin.field); }}
                  >
                    {pin.number}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PdfViewer;
