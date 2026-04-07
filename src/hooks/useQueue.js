import { useState, useEffect } from 'react';

const QUEUE_KEY = 'dm-tracker-queue';

export function useQueue() {
  const [queue, setQueue] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }, [queue]);

  const addItem = (item) => {
    const newItem = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...item,
    };
    setQueue(prev => [newItem, ...prev]);
    return newItem;
  };

  const updateItem = (id, updates) => {
    setQueue(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };

  const removeItem = (id) => {
    setQueue(prev => prev.filter(i => i.id !== id));
  };

  const getByType = (type) => queue.filter(i => i.type === type);

  return { queue, addItem, updateItem, removeItem, getByType };
}
