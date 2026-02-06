// Bethel Closer Service Worker - Offline Support
const CACHE_NAME = 'bethel-closer-v1';
const STATIC_CACHE = 'bethel-static-v1';
const DATA_CACHE = 'bethel-data-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png'
];

// API endpoints to cache
const API_CACHE_PATTERNS = [
  /\/rest\/v1\/clients/,
  /\/rest\/v1\/calls/,
  /\/rest\/v1\/profiles/,
  /\/rest\/v1\/tags/,
  /\/rest\/v1\/client_activities/,
  /\/rest\/v1\/monthly_goals/
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== DATA_CACHE && name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Check if request should be cached
function shouldCacheRequest(request) {
  const url = new URL(request.url);

  // Cache API requests
  if (API_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    return true;
  }

  // Cache Supabase API requests
  if (url.hostname.includes('supabase')) {
    return true;
  }

  return false;
}

// Network first, fallback to cache strategy
async function networkFirstStrategy(request) {
  const cache = await caches.open(DATA_CACHE);

  try {
    const networkResponse = await fetch(request);

    // Only cache successful GET responses
    if (networkResponse.ok && request.method === 'GET') {
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache for:', request.url);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // Return offline response for API requests
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
}

// Cache first, fallback to network strategy (for static assets)
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network and cache failed for:', request.url);

    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/');
    }

    throw error;
  }
}

// Fetch event handler
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests for caching (but still intercept for offline queue)
  if (request.method !== 'GET') {
    event.respondWith(handleMutationRequest(request));
    return;
  }

  // Use appropriate strategy based on request type
  if (shouldCacheRequest(request)) {
    event.respondWith(networkFirstStrategy(request));
  } else if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(cacheFirstStrategy(request));
  } else {
    // For other static assets
    event.respondWith(cacheFirstStrategy(request));
  }
});

// Handle mutation requests (POST, PUT, DELETE, PATCH)
async function handleMutationRequest(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    console.log('[SW] Mutation failed, queueing for sync:', request.url);

    // Clone request data for queuing
    const clonedRequest = request.clone();
    const body = await clonedRequest.text();

    // Store in IndexedDB via message to main thread
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'QUEUE_SYNC',
        payload: {
          url: request.url,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          body: body,
          timestamp: Date.now()
        }
      });
    });

    // Return optimistic response
    return new Response(
      JSON.stringify({
        queued: true,
        message: 'Operação salva localmente. Será sincronizada quando online.',
        offline: true
      }),
      {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Background sync event
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);

  if (event.tag === 'sync-mutations') {
    event.waitUntil(syncQueuedMutations());
  }
});

// Sync queued mutations
async function syncQueuedMutations() {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'PROCESS_SYNC_QUEUE' });
  });
}

// Handle messages from main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
});

// Push notification support (for future use)
self.addEventListener('push', (event) => {
  const options = {
    body: event.data?.text() || 'Nova atualização disponível',
    icon: '/logo.png',
    badge: '/logo.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };

  event.waitUntil(
    self.registration.showNotification('Bethel Closer', options)
  );
});

console.log('[SW] Service Worker loaded');
