
// Using compat libraries for easier use in a non-module service worker environment.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js');


// --- Cache Logic ---
const CACHE_NAME = 'work-hours-tracker-v5'; // Bumped version for new SW logic
const urlsToCache = [
  // App Shell
  '/',
  '/index.html',
  '/manifest.json',

  // App Code
  '/index.tsx',
  '/App.tsx',
  '/types.ts',
  '/constants.ts',
  '/config.ts',
  '/utils/geolocation.ts',
  '/utils/time.ts',
  '/utils/indexedDB.ts',
  '/services/firebase.ts',
  '/components/AuthScreen.tsx',
  '/components/BottomNav.tsx',
  '/components/MapPicker.tsx',
  '/screens/MainScreen.tsx',
  
  // Styles & Assets
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',

  // Vendor JS (from importmap)
  'https://esm.sh/react@19.2.4',
  'https://esm.sh/react-dom@19.2.4/client',
  'https://esm.sh/react-router-dom@7.13.0',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js',
  'https://esm.sh/leaflet@1.9.4'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // Use addAll with a catch to prevent install failure if one resource fails
        return cache.addAll(urlsToCache).catch(err => {
          console.warn('SW Cache addAll failed:', err);
        });
      })
      .then(() => self.skipWaiting()) // Force the waiting service worker to become the active one.
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of all pages under its scope immediately.
  );
});

self.addEventListener('fetch', event => {
  // For navigation requests, use a "network-first, falling back to cache" strategy.
  // This is crucial for SPAs to handle deep links and 404s correctly.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // If the network returns a 404 or other error, fall back to the app shell.
          if (!response.ok) {
            console.log(`Fetch for navigation returned error ${response.status}, falling back to cache.`);
            return caches.match('/index.html');
          }
          // If the request is successful, return the response from the network.
          return response;
        })
        .catch(() => {
          // If the network request fails entirely (e.g., offline), 
          // also fall back to the app shell.
          console.log('Fetch for navigation failed, falling back to cache.');
          return caches.match('/index.html');
        })
    );
    return;
  }

  // For all other requests (assets like JS, CSS, images),
  // use a "cache-first, falling back to network" strategy.
  // This is fast and ensures the app works offline.
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        // If not in cache, fetch from network but don't cache it here.
        // Let the install step manage the cache.
        return fetch(event.request);
      })
  );
});