/**
 * Offline Query Client Integration
 * Integrates React Query with IndexedDB for offline support
 */

import { QueryClient, MutationCache, QueryCache } from '@tanstack/react-query';
import { offlineStorage, STORES } from './offlineStorage';
import { syncQueue } from './syncQueue';

// Map of query keys to storage names
const QUERY_STORAGE_MAP: Record<string, keyof typeof STORES> = {
  clients: 'CLIENTS',
  calls: 'CALLS',
  profiles: 'PROFILES',
  tags: 'TAGS',
  activities: 'ACTIVITIES'
};

/**
 * Create a query client with offline support
 */
export function createOfflineQueryClient(): QueryClient {
  const queryCache = new QueryCache({
    onSuccess: async (data, query) => {
      // Cache successful queries to IndexedDB
      const queryKey = query.queryKey[0] as string;
      const storeName = QUERY_STORAGE_MAP[queryKey];

      if (storeName && Array.isArray(data)) {
        try {
          const store = STORES[storeName];
          await offlineStorage.set(store, data);
          await offlineStorage.updateCacheMeta(store);
          console.log(`[OfflineQueryClient] Cached ${data.length} items for ${queryKey}`);
        } catch (error) {
          console.error(`[OfflineQueryClient] Failed to cache ${queryKey}:`, error);
        }
      }
    },
    onError: async (_error, query) => {
      // On network error, try to load from cache
      if (!navigator.onLine) {
        const queryKey = query.queryKey[0] as string;
        const storeName = QUERY_STORAGE_MAP[queryKey];

        if (storeName) {
          try {
            const store = STORES[storeName];
            const cachedData = await offlineStorage.getAll(store);
            if (cachedData.length > 0) {
              console.log(`[OfflineQueryClient] Loaded ${cachedData.length} items from cache for ${queryKey}`);
              query.setData(cachedData);
            }
          } catch (cacheError) {
            console.error(`[OfflineQueryClient] Failed to load cache for ${queryKey}:`, cacheError);
          }
        }
      }
    }
  });

  const mutationCache = new MutationCache({
    onError: async (_error, _variables, _context, mutation) => {
      // Queue failed mutations for later sync
      if (!navigator.onLine && mutation.options.mutationKey) {
        const mutationKey = mutation.options.mutationKey[0] as string;
        console.log(`[OfflineQueryClient] Queuing failed mutation: ${mutationKey}`);

        // The actual queuing is handled by the service worker
        // But we can also queue here as a fallback
      }
    }
  });

  return new QueryClient({
    queryCache,
    mutationCache,
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 30, // 30 minutes
        retry: (failureCount, _error: unknown) => {
          // Don't retry if offline
          if (!navigator.onLine) return false;
          // Retry up to 2 times
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
        refetchOnReconnect: 'always',
        networkMode: 'offlineFirst' // Try cache first when offline
      },
      mutations: {
        retry: (failureCount, _error: unknown) => {
          // Don't retry mutations if offline
          if (!navigator.onLine) return false;
          return failureCount < 1;
        },
        networkMode: 'offlineFirst'
      }
    }
  });
}

/**
 * Initialize offline data from IndexedDB
 */
export async function initializeOfflineData(queryClient: QueryClient): Promise<void> {
  try {
    await offlineStorage.init();

    // Load cached data into query client
    for (const [queryKey, storeName] of Object.entries(QUERY_STORAGE_MAP)) {
      const store = STORES[storeName as keyof typeof STORES];
      const cachedData = await offlineStorage.getAll(store);

      if (cachedData.length > 0) {
        queryClient.setQueryData([queryKey], cachedData);
        console.log(`[OfflineQueryClient] Loaded ${cachedData.length} cached items for ${queryKey}`);
      }
    }
  } catch (error) {
    console.error('[OfflineQueryClient] Failed to initialize offline data:', error);
  }
}

/**
 * Sync all cached data with server
 */
export async function syncOfflineData(queryClient: QueryClient): Promise<void> {
  if (!navigator.onLine) {
    console.log('[OfflineQueryClient] Cannot sync while offline');
    return;
  }

  try {
    // Process queued mutations
    await syncQueue.processQueue();

    // Invalidate queries to fetch fresh data
    await queryClient.invalidateQueries();

    console.log('[OfflineQueryClient] Offline data synced');
  } catch (error) {
    console.error('[OfflineQueryClient] Sync failed:', error);
  }
}

/**
 * Custom fetch wrapper that handles offline scenarios
 */
export async function offlineFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    return response;
  } catch (error) {
    if (!navigator.onLine) {
      // Return a mock response for offline mode
      return new Response(
        JSON.stringify({
          error: 'offline',
          message: 'Você está offline. Os dados serão sincronizados quando a conexão for restaurada.',
          offline: true
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    throw error;
  }
}
