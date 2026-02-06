/**
 * Offline Storage Service using IndexedDB
 * Provides persistent storage for offline functionality
 */

const DB_NAME = 'bethel-closer-offline';
const DB_VERSION = 1;

// Store names
const STORES = {
  CLIENTS: 'clients',
  CALLS: 'calls',
  PROFILES: 'profiles',
  TAGS: 'tags',
  ACTIVITIES: 'activities',
  SYNC_QUEUE: 'syncQueue',
  CACHE_META: 'cacheMeta'
} as const;

type StoreName = typeof STORES[keyof typeof STORES];

interface SyncQueueItem {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  timestamp: number;
  retryCount: number;
  status: 'pending' | 'processing' | 'failed';
}

interface CacheMeta {
  store: string;
  lastUpdated: number;
  version: number;
}

class OfflineStorageService {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[OfflineStorage] Error opening database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[OfflineStorage] Database initialized');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        console.log('[OfflineStorage] Upgrading database...');

        // Create object stores
        if (!db.objectStoreNames.contains(STORES.CLIENTS)) {
          const clientsStore = db.createObjectStore(STORES.CLIENTS, { keyPath: 'id' });
          clientsStore.createIndex('user_id', 'user_id', { unique: false });
          clientsStore.createIndex('status', 'status', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.CALLS)) {
          const callsStore = db.createObjectStore(STORES.CALLS, { keyPath: 'id' });
          callsStore.createIndex('closer_id', 'closer_id', { unique: false });
          callsStore.createIndex('client_id', 'client_id', { unique: false });
          callsStore.createIndex('call_date', 'call_date', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.PROFILES)) {
          const profilesStore = db.createObjectStore(STORES.PROFILES, { keyPath: 'id' });
          profilesStore.createIndex('email', 'email', { unique: true });
        }

        if (!db.objectStoreNames.contains(STORES.TAGS)) {
          db.createObjectStore(STORES.TAGS, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(STORES.ACTIVITIES)) {
          const activitiesStore = db.createObjectStore(STORES.ACTIVITIES, { keyPath: 'id' });
          activitiesStore.createIndex('client_id', 'client_id', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
          const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
          syncStore.createIndex('status', 'status', { unique: false });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.CACHE_META)) {
          db.createObjectStore(STORES.CACHE_META, { keyPath: 'store' });
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Get the database instance
   */
  private async getDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    return this.db!;
  }

  /**
   * Store data in IndexedDB
   */
  async set<T extends { id: string | number }>(storeName: StoreName, data: T | T[]): Promise<void> {
    const db = await this.getDB();
    const items = Array.isArray(data) ? data : [data];

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      items.forEach(item => {
        store.put(item);
      });
    });
  }

  /**
   * Get data by ID from IndexedDB
   */
  async get<T>(storeName: StoreName, id: string | number): Promise<T | undefined> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all data from a store
   */
  async getAll<T>(storeName: StoreName): Promise<T[]> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get data by index
   */
  async getByIndex<T>(storeName: StoreName, indexName: string, value: IDBValidKey): Promise<T[]> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete data by ID
   */
  async delete(storeName: StoreName, id: string | number): Promise<void> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all data from a store
   */
  async clear(storeName: StoreName): Promise<void> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update cache metadata
   */
  async updateCacheMeta(storeName: StoreName): Promise<void> {
    const meta: CacheMeta = {
      store: storeName,
      lastUpdated: Date.now(),
      version: DB_VERSION
    };
    await this.set(STORES.CACHE_META, meta as any);
  }

  /**
   * Get cache metadata
   */
  async getCacheMeta(storeName: StoreName): Promise<CacheMeta | undefined> {
    return this.get<CacheMeta>(STORES.CACHE_META, storeName);
  }

  /**
   * Check if cache is stale (older than maxAge in milliseconds)
   */
  async isCacheStale(storeName: StoreName, maxAge: number = 5 * 60 * 1000): Promise<boolean> {
    const meta = await this.getCacheMeta(storeName);
    if (!meta) return true;
    return Date.now() - meta.lastUpdated > maxAge;
  }

  // Sync Queue Methods

  /**
   * Add item to sync queue
   */
  async addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'retryCount' | 'status'>): Promise<string> {
    const id = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const queueItem: SyncQueueItem = {
      ...item,
      id,
      retryCount: 0,
      status: 'pending'
    };

    await this.set(STORES.SYNC_QUEUE, queueItem);
    console.log('[OfflineStorage] Added to sync queue:', id);
    return id;
  }

  /**
   * Get all pending sync items
   */
  async getPendingSyncItems(): Promise<SyncQueueItem[]> {
    return this.getByIndex<SyncQueueItem>(STORES.SYNC_QUEUE, 'status', 'pending');
  }

  /**
   * Update sync queue item status
   */
  async updateSyncItemStatus(id: string, status: SyncQueueItem['status'], retryCount?: number): Promise<void> {
    const item = await this.get<SyncQueueItem>(STORES.SYNC_QUEUE, id);
    if (item) {
      item.status = status;
      if (retryCount !== undefined) {
        item.retryCount = retryCount;
      }
      await this.set(STORES.SYNC_QUEUE, item);
    }
  }

  /**
   * Remove item from sync queue
   */
  async removeSyncItem(id: string): Promise<void> {
    await this.delete(STORES.SYNC_QUEUE, id);
  }

  /**
   * Get sync queue count
   */
  async getSyncQueueCount(): Promise<number> {
    const items = await this.getAll<SyncQueueItem>(STORES.SYNC_QUEUE);
    return items.filter(item => item.status === 'pending').length;
  }

  // Convenience methods for specific data types

  async saveClients(clients: any[]): Promise<void> {
    await this.set(STORES.CLIENTS, clients);
    await this.updateCacheMeta(STORES.CLIENTS);
  }

  async getClients(): Promise<any[]> {
    return this.getAll(STORES.CLIENTS);
  }

  async saveCalls(calls: any[]): Promise<void> {
    await this.set(STORES.CALLS, calls);
    await this.updateCacheMeta(STORES.CALLS);
  }

  async getCalls(): Promise<any[]> {
    return this.getAll(STORES.CALLS);
  }

  async saveProfiles(profiles: any[]): Promise<void> {
    await this.set(STORES.PROFILES, profiles);
    await this.updateCacheMeta(STORES.PROFILES);
  }

  async getProfiles(): Promise<any[]> {
    return this.getAll(STORES.PROFILES);
  }

  async saveTags(tags: any[]): Promise<void> {
    await this.set(STORES.TAGS, tags);
    await this.updateCacheMeta(STORES.TAGS);
  }

  async getTags(): Promise<any[]> {
    return this.getAll(STORES.TAGS);
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.dbPromise = null;
    }
  }
}

// Export singleton instance
export const offlineStorage = new OfflineStorageService();

// Export store names for type safety
export { STORES };
export type { SyncQueueItem, CacheMeta };
