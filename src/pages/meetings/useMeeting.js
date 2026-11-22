// The active meeting (Item Tracker spec §6.2). Held per browser in
// localStorage; the record itself is the Meetings page in Notion.
// While a meeting is active, quick-adds link to it and every item opened in
// the Item Tracker is added to its Items (items discussed).
import { useCallback, useSyncExternalStore } from 'react';
import { useSnapshot, useUpdateRecord } from '../../hooks/hub.js';

const KEY = 'hub.meeting.active';
const subs = new Set();
const read = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const write = v => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch { /* ignore */ } subs.forEach(f => f()); };
const subscribe = f => { subs.add(f); const onStore = e => { if (e.key === KEY) f(); }; window.addEventListener('storage', onStore); return () => { subs.delete(f); window.removeEventListener('storage', onStore); }; };

export function useActiveMeeting() {
  const id = useSyncExternalStore(subscribe, read, () => '');
  const { data } = useSnapshot('meetings');
  const meeting = id ? (data?.rows || []).find(m => m.id === id) || null : null;
  const update = useUpdateRecord('meetings');
  const setActive = useCallback(v => write(v), []);
  // Add an item to "items discussed" (once)
  const discuss = useCallback(itemId => {
    if (!meeting || !itemId || (meeting.itemIds || []).includes(itemId)) return;
    update.mutate({ id: meeting.id, set: { itemIds: [...(meeting.itemIds || []), itemId] } });
  }, [meeting, update]);
  return { id: meeting ? id : (id && !data ? id : ''), meeting, setActive, discuss, update };
}
