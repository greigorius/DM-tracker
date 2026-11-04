// TanStack Query client, persisted to IndexedDB so a second visit renders the
// last data immediately and refreshes in the background.

import { QueryClient, keepPreviousData } from '@tanstack/react-query';
import { get, set, del, createStore } from 'idb-keyval';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60_000,
      gcTime: 24 * 60 * 60_000,
      refetchOnWindowFocus: true,
      placeholderData: keepPreviousData,
      // The API can answer 502/503 for a moment while it starts; keep trying
      // quietly instead of showing an error. 4xx answers are not retried.
      retry: (count, err) => count < 6 && !(err?.status >= 400 && err?.status < 500),
      retryDelay: n => Math.min(500 * 2 ** n, 5000),
    },
  },
});

const idbStore = (() => {
  try { return typeof indexedDB !== 'undefined' ? createStore('axiom-hub', 'query-cache') : null; }
  catch { return null; }
})();

const KEY = 'tanstack-query';

// Persister contract: persistClient / restoreClient / removeClient.
export const persister = {
  persistClient: async client => { if (idbStore) { try { await set(KEY, client, idbStore); } catch { /* quota / private mode */ } } },
  restoreClient: async () => { if (!idbStore) return undefined; try { return await get(KEY, idbStore); } catch { return undefined; } },
  removeClient: async () => { if (idbStore) { try { await del(KEY, idbStore); } catch { /* ignore */ } } },
};

export const persistOptions = {
  persister,
  maxAge: 24 * 60 * 60_000,
  buster: 'hub-v2-1',
};
