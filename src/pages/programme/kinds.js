// Date kinds: recorded actual, client programme date, set by hand, forecast
export const KIND = {
  act: { label: 'Issued (actual)', text: 'text-ok', dot: 'bg-ok' },
  prog: { label: 'Client programme date', text: 'text-accent', dot: 'bg-accent' },
  manual: { label: 'Set by hand', text: 'text-info', dot: 'bg-info' },
  fc: { label: 'Forecast', text: 'text-text-2', dot: 'bg-line-strong' },
};
export const TONE_TEXT = { ok: 'text-ok', accent: 'text-accent', danger: 'text-danger', info: 'text-info', muted: 'text-muted' };
export const TONE_BORDER = { ok: 'border-t-ok', accent: 'border-t-accent', danger: 'border-t-danger', info: 'border-t-info', muted: 'border-t-line-strong' };

