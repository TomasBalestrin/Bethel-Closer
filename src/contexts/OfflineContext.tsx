/**
 * Offline Context Provider
 * Provides offline status and sync functionality throughout the app
 */

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { offlineStorage } from '@/services/offlineStorage';
import { syncQueue } from '@/services/syncQueue';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';

interface OfflineContextValue {
  isOnline: boolean;
  isReconnecting: boolean;
  pendingSyncCount: number;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  syncError: string | null;
  isServiceWorkerReady: boolean;
  triggerSync: () => Promise<void>;
  retryFailed: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue | undefined>(undefined);

interface OfflineProviderProps {
  children: ReactNode;
}

export function OfflineProvider({ children }: OfflineProviderProps) {
  const [isServiceWorkerReady, setIsServiceWorkerReady] = useState(false);
  const offlineStatus = useOfflineStatus();

  // Store registration and listeners for cleanup
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const updateFoundHandlerRef = useRef<(() => void) | null>(null);
  const stateChangeHandlerRef = useRef<(() => void) | null>(null);
  const installingWorkerRef = useRef<ServiceWorker | null>(null);

  // Initialize services
  useEffect(() => {
    let isMounted = true;

    const initServices = async () => {
      try {
        // Initialize IndexedDB
        await offlineStorage.init();
        console.log('[OfflineContext] IndexedDB initialized');

        // Initialize sync queue
        await syncQueue.init();
        console.log('[OfflineContext] Sync queue initialized');

        // Register service worker
        if ('serviceWorker' in navigator) {
          try {
            const registration = await navigator.serviceWorker.register('/sw.js', {
              scope: '/'
            });

            if (!isMounted) return;

            registrationRef.current = registration;
            console.log('[OfflineContext] Service Worker registered:', registration.scope);

            // Check if there's a waiting worker
            if (registration.waiting) {
              console.log('[OfflineContext] New Service Worker waiting');
            }

            // Listen for updates
            const handleUpdateFound = () => {
              const newWorker = registration.installing;
              if (newWorker) {
                installingWorkerRef.current = newWorker;

                const handleStateChange = () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('[OfflineContext] New Service Worker available');
                    // Could show a notification to refresh
                  }
                };

                stateChangeHandlerRef.current = handleStateChange;
                newWorker.addEventListener('statechange', handleStateChange);
              }
            };

            updateFoundHandlerRef.current = handleUpdateFound;
            registration.addEventListener('updatefound', handleUpdateFound);

            // Check if service worker is active
            if (registration.active) {
              if (isMounted) setIsServiceWorkerReady(true);
            } else {
              navigator.serviceWorker.ready.then(() => {
                if (isMounted) setIsServiceWorkerReady(true);
              });
            }
          } catch (error) {
            console.error('[OfflineContext] Service Worker registration failed:', error);
          }
        }
      } catch (error) {
        console.error('[OfflineContext] Failed to initialize offline services:', error);
      }
    };

    initServices();

    // Cleanup
    return () => {
      isMounted = false;
      syncQueue.stopPeriodicSync();

      // Remove event listeners
      if (registrationRef.current && updateFoundHandlerRef.current) {
        registrationRef.current.removeEventListener('updatefound', updateFoundHandlerRef.current);
      }
      if (installingWorkerRef.current && stateChangeHandlerRef.current) {
        installingWorkerRef.current.removeEventListener('statechange', stateChangeHandlerRef.current);
      }
    };
  }, []);

  const value: OfflineContextValue = {
    ...offlineStatus,
    isServiceWorkerReady
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline(): OfflineContextValue {
  const context = useContext(OfflineContext);
  if (context === undefined) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
}

export { OfflineContext };
