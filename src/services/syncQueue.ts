/**
 * Sync Queue Service
 * Handles queuing and processing of offline mutations
 */

import { offlineStorage, SyncQueueItem } from './offlineStorage';

const MAX_RETRY_COUNT = 3;
const RETRY_DELAYS = [1000, 5000, 15000]; // Progressive delays

type SyncEventType = 'queue-updated' | 'sync-started' | 'sync-completed' | 'sync-failed' | 'item-synced';

interface SyncEvent {
  type: SyncEventType;
  payload?: any;
}

type SyncEventListener = (event: SyncEvent) => void;

class SyncQueueService {
  private listeners: Set<SyncEventListener> = new Set();
  private isSyncing = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Initialize the sync queue service
   */
  async init(): Promise<void> {
    await offlineStorage.init();

    // Listen for messages from service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage.bind(this));
    }

    // Start periodic sync check
    this.startPeriodicSync();

    // Listen for online events
    window.addEventListener('online', this.handleOnline.bind(this));

    console.log('[SyncQueue] Initialized');
  }

  /**
   * Start periodic sync checking
   */
  private startPeriodicSync(): void {
    // Check every 30 seconds when online
    this.syncInterval = setInterval(() => {
      if (navigator.onLine && !this.isSyncing) {
        this.processQueue();
      }
    }, 30000);
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Handle messages from service worker
   */
  private async handleServiceWorkerMessage(event: MessageEvent): Promise<void> {
    const { type, payload } = event.data;

    if (type === 'QUEUE_SYNC') {
      await this.addToQueue(payload);
    }

    if (type === 'PROCESS_SYNC_QUEUE') {
      await this.processQueue();
    }
  }

  /**
   * Handle coming back online
   */
  private handleOnline(): void {
    console.log('[SyncQueue] Back online, processing queue...');
    this.processQueue().catch(err => {
      console.error('[SyncQueue] Error processing queue after coming online:', err);
    });
  }

  /**
   * Add event listener
   */
  addEventListener(listener: SyncEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit event to all listeners
   */
  private emit(event: SyncEvent): void {
    this.listeners.forEach(listener => listener(event));
  }

  /**
   * Add item to the sync queue
   */
  async addToQueue(item: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
    timestamp: number;
  }): Promise<string> {
    const id = await offlineStorage.addToSyncQueue(item);
    this.emit({ type: 'queue-updated', payload: { added: id } });
    return id;
  }

  /**
   * Get pending items count
   */
  async getPendingCount(): Promise<number> {
    return offlineStorage.getSyncQueueCount();
  }

  /**
   * Get all pending items
   */
  async getPendingItems(): Promise<SyncQueueItem[]> {
    return offlineStorage.getPendingSyncItems();
  }

  /**
   * Process the sync queue
   */
  async processQueue(): Promise<{ success: number; failed: number }> {
    if (this.isSyncing) {
      console.log('[SyncQueue] Already syncing, skipping...');
      return { success: 0, failed: 0 };
    }

    if (!navigator.onLine) {
      console.log('[SyncQueue] Offline, skipping sync...');
      return { success: 0, failed: 0 };
    }

    this.isSyncing = true;
    this.emit({ type: 'sync-started' });

    const items = await offlineStorage.getPendingSyncItems();
    console.log(`[SyncQueue] Processing ${items.length} pending items`);

    let success = 0;
    let failed = 0;

    // Sort by timestamp (oldest first)
    items.sort((a, b) => a.timestamp - b.timestamp);

    for (const item of items) {
      try {
        await offlineStorage.updateSyncItemStatus(item.id, 'processing');

        const response = await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body || undefined
        });

        if (response.ok) {
          await offlineStorage.removeSyncItem(item.id);
          success++;
          this.emit({ type: 'item-synced', payload: { id: item.id, success: true } });
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.error(`[SyncQueue] Failed to sync item ${item.id}:`, error);

        const newRetryCount = item.retryCount + 1;

        if (newRetryCount >= MAX_RETRY_COUNT) {
          await offlineStorage.updateSyncItemStatus(item.id, 'failed', newRetryCount);
          failed++;
          this.emit({ type: 'item-synced', payload: { id: item.id, success: false, error } });
        } else {
          await offlineStorage.updateSyncItemStatus(item.id, 'pending', newRetryCount);

          // Schedule retry with backoff
          const delay = RETRY_DELAYS[newRetryCount - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
          setTimeout(() => {
            this.processQueue().catch(err => {
              console.error('[SyncQueue] Error processing queue during retry:', err);
            });
          }, delay);
        }
      }
    }

    this.isSyncing = false;
    this.emit({
      type: 'sync-completed',
      payload: { success, failed, total: items.length }
    });

    console.log(`[SyncQueue] Sync completed: ${success} success, ${failed} failed`);

    return { success, failed };
  }

  /**
   * Retry failed items
   */
  async retryFailed(): Promise<void> {
    await offlineStorage.init();
    const items = await offlineStorage.getAll<SyncQueueItem>('syncQueue');

    for (const item of items) {
      if (item.status === 'failed') {
        await offlineStorage.updateSyncItemStatus(item.id, 'pending', 0);
      }
    }

    this.emit({ type: 'queue-updated' });
    await this.processQueue();
  }

  /**
   * Clear failed items
   */
  async clearFailed(): Promise<void> {
    const items = await offlineStorage.getAll<SyncQueueItem>('syncQueue');

    for (const item of items) {
      if (item.status === 'failed') {
        await offlineStorage.removeSyncItem(item.id);
      }
    }

    this.emit({ type: 'queue-updated' });
  }

  /**
   * Clear all items
   */
  async clearAll(): Promise<void> {
    await offlineStorage.clear('syncQueue');
    this.emit({ type: 'queue-updated' });
  }

  /**
   * Request background sync (if supported)
   */
  async requestBackgroundSync(): Promise<boolean> {
    // Check if Background Sync API is available
    const hasServiceWorker = 'serviceWorker' in navigator;
    const swRegistrationPrototype = typeof ServiceWorkerRegistration !== 'undefined'
      ? ServiceWorkerRegistration.prototype
      : null;
    const hasSync = swRegistrationPrototype && 'sync' in swRegistrationPrototype;

    if (hasServiceWorker && hasSync) {
      try {
        const registration = await navigator.serviceWorker.ready;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (registration as any).sync.register('sync-mutations');
        console.log('[SyncQueue] Background sync registered');
        return true;
      } catch (error) {
        console.error('[SyncQueue] Background sync registration failed:', error);
        return false;
      }
    }
    return false;
  }
}

// Export singleton instance
export const syncQueue = new SyncQueueService();
