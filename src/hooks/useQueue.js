import { useState, useEffect, useRef } from 'react';

const QUEUE_KEY  = 'dm-tracker-queue';
const SYNC_EVENT = 'dm-queue-update';

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}

export function useQueue() {
  const [queue, setQueue] = useState(readQueue);
  const needsSync = useRef(false); // set true by mutations, cleared after flush

  // Flush writes AFTER React finishes rendering (not inside updater — avoids nested setState)
  useEffect(() => {
    if (!needsSync.current) return;
    needsSync.current = false;
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    window.dispatchEvent(new CustomEvent(SYNC_EVENT));
  }); // intentionally no dep array — runs after every render, gated by needsSync

  // Sync state when another useQueue instance writes
  useEffect(() => {
    const sync = () => setQueue(readQueue());
    window.addEventListener(SYNC_EVENT, sync);
    return () => window.removeEventListener(SYNC_EVENT, sync);
  }, []);

  const addItem = (item) => {
    const newItem = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...item };
    needsSync.current = true;
    setQueue(prev => [newItem, ...prev]);
    return newItem;
  };

  const updateItem = (id, updates) => {
    needsSync.current = true;
    setQueue(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };

  const removeItem = (id) => {
    needsSync.current = true;
    setQueue(prev => prev.filter(i => i.id !== id));
  };

  const getByType = (type) => queue.filter(i => i.type === type);

  return { queue, addItem, updateItem, removeItem, getByType };
}
