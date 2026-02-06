/**
 * Hook for monitoring online/offline status and sync queue
 */

import { useState, useEffect, useCallback } from 'react';
import { syncQueue } from '@/services/syncQueue';

interface OfflineStatus {
  isOnline: boolean;
  isReconnecting: boolean;
  pendingSyncCount: number;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  syncError: string | null;
}

export function useOfflineStatus() {
  const [status, setStatus] = useState<OfflineStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isReconnecting: false,
    pendingSyncCount: 0,
    isSyncing: false,
    lastSyncTime: null,
    syncError: null
  });

  // Update pending count
  const updatePendingCount = useCallback(async () => {
    try {
      const count = await syncQueue.getPendingCount();
      setStatus(prev => ({ ...prev, pendingSyncCount: count }));
    } catch (error) {
      console.error('[useOfflineStatus] Error getting pending count:', error);
    }
  }, []);

  // Handle online event
  const handleOnline = useCallback(() => {
    setStatus(prev => ({
      ...prev,
      isOnline: true,
      isReconnecting: true
    }));

    // Give a moment for the connection to stabilize
    setTimeout(() => {
      setStatus(prev => ({ ...prev, isReconnecting: false }));
    }, 2000);
  }, []);

  // Handle offline event
  const handleOffline = useCallback(() => {
    setStatus(prev => ({
      ...prev,
      isOnline: false,
      isReconnecting: false
    }));
  }, []);

  // Setup event listeners
  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen to sync queue events
    const unsubscribe = syncQueue.addEventListener((event) => {
      switch (event.type) {
        case 'sync-started':
          setStatus(prev => ({ ...prev, isSyncing: true, syncError: null }));
          break;
        case 'sync-completed':
          setStatus(prev => ({
            ...prev,
            isSyncing: false,
            lastSyncTime: new Date()
          }));
          updatePendingCount();
          break;
        case 'sync-failed':
          setStatus(prev => ({
            ...prev,
            isSyncing: false,
            syncError: event.payload?.error?.message || 'Sync failed'
          }));
          break;
        case 'queue-updated':
          updatePendingCount();
          break;
      }
    });

    // Initial pending count
    updatePendingCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, [handleOnline, handleOffline, updatePendingCount]);

  // Manual sync trigger
  const triggerSync = useCallback(async () => {
    if (!status.isOnline) {
      console.warn('[useOfflineStatus] Cannot sync while offline');
      return;
    }
    await syncQueue.processQueue();
  }, [status.isOnline]);

  // Retry failed items
  const retryFailed = useCallback(async () => {
    await syncQueue.retryFailed();
  }, []);

  return {
    ...status,
    triggerSync,
    retryFailed,
    refreshPendingCount: updatePendingCount
  };
}

export default useOfflineStatus;
