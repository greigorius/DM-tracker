import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cx } from './primitives.jsx';

const ToastCtx = createContext({ show: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);
  const dismiss = useCallback(id => setToasts(t => t.filter(x => x.id !== id)), []);
  const show = useCallback((message, { tone = 'ok', action, ms = 5000 } = {}) => {
    const id = ++seq.current;
    setToasts(t => [...t.slice(-2), { id, message, tone, action }]);
    setTimeout(() => dismiss(id), ms);
    return id;
  }, [dismiss]);
  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed z-50 bottom-4 left-4 right-4 sm:left-auto sm:w-[380px] flex flex-col gap-2" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={cx('bg-surface-hi border border-line border-l-4 px-4 py-3 flex items-center gap-3 text-[14px]', t.tone === 'danger' ? 'border-l-danger' : 'border-l-ok')}>
            <span className={cx('flex-1 min-w-0', t.tone === 'danger' ? 'text-danger' : 'text-text')}>{t.message}</span>
            {t.action?.onClick && (
              <button type="button" onClick={() => { t.action.onClick(); dismiss(t.id); }} className="bg-transparent border-0 p-0 font-mono text-[12px] uppercase tracking-[0.08em] text-accent min-h-11 inline-flex items-center cursor-pointer">
                {t.action.label}
              </button>
            )}
            {t.action?.href && (
              <a href={t.action.href} target="_blank" rel="noreferrer" className="font-mono text-[12px] uppercase tracking-[0.08em] text-accent no-underline min-h-11 inline-flex items-center">
                {t.action.label}
              </a>
            )}
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="min-h-11 min-w-11 inline-flex items-center justify-center bg-transparent border-0 text-muted hover:text-text cursor-pointer">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
