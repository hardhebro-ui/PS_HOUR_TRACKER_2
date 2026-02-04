// Using compat libraries for easier use in a non-module service worker environment.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js');


// --- Cache Logic ---
const CACHE_NAME = 'work-hours-tracker-v2'; // Bumped version for new cache
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
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});


// --- Background Sync Logic ---

// --- Constants and Config ---
const WORK_START_HOUR = 8;
const WORK_END_HOUR = 19;
const firebaseConfig = {
    apiKey: "AIzaSyBVyhJD7-gz0Q9nxPQ99V2_6TjBHceOIGw",
    authDomain: "ps-hour-tracker.firebaseapp.com",
    projectId: "ps-hour-tracker",
    storageBucket: "ps-hour-tracker.firebasestorage.app",
    messagingSenderId: "598253855185",
    appId: "1:598253855185:web:0fdea9b673441d9a3000f0",
    measurementId: "G-5QW80BN81E"
};

let firebaseApp;
let firestore;

// --- Helper Functions ---

function getFirebase() {
    if (!firebaseApp) {
        firebaseApp = firebase.initializeApp(firebaseConfig);
        firestore = firebase.firestore();
    }
    return { firebaseApp, firestore };
}

const idb = {
    get(key) {
        return new Promise((resolve) => {
            const request = indexedDB.open('WorkHoursDB', 1);
            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction('userState', 'readonly');
                const store = transaction.objectStore('userState');
                const getRequest = store.get(key);
                getRequest.onsuccess = () => resolve(getRequest.result?.value);
                getRequest.onerror = () => resolve(undefined);
            };
            request.onerror = () => resolve(undefined);
        });
    }
};

function getDistance(point1, point2) {
    if (!point1 || !point2) return Infinity;

    const R = 6371e3; // Earth's radius in metres
    const φ1 = point1.lat * Math.PI / 180;
    const φ2 = point2.lat * Math.PI / 180;
    const Δφ = (point2.lat - point1.lat) * Math.PI / 180;
    const Δλ = (point2.lng - point1.lng) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}


function isWithinWorkingHours(date) {
    const hour = date.getHours();
    return hour >= WORK_START_HOUR && hour < WORK_END_HOUR;
}

function getTodaysDateString() {
    return new Date().toISOString().split('T')[0];
}

function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0
        });
    });
}

// --- Firestore Functions ---

async function getSettings(userId) {
    const { firestore } = getFirebase();
    const docRef = firestore.collection('settings').doc(userId);
    const doc = await docRef.get();
    return doc.exists ? doc.data() : null;
}

async function getActiveSession(userId, today) {
    const { firestore } = getFirebase();
    const sessionsRef = firestore.collection('users').doc(userId).collection('shop_sessions');
    const query = sessionsRef.where('date', '==', today).where('endTime', '==', null);
    const snapshot = await query.get();
    if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    }
    return null;
}

async function startNewSession(userId, startTime) {
    const { firestore } = getFirebase();
    const sessionsRef = firestore.collection('users').doc(userId).collection('shop_sessions');
    await sessionsRef.add({
        startTime,
        date: getTodaysDateString(),
        endTime: null,
        durationMs: null
    });
    console.log('[SW] Started new session at', new Date(startTime).toLocaleTimeString());
}

async function endSession(userId, sessionId, endTime) {
    const { firestore } = getFirebase();
    const sessionRef = firestore.collection('users').doc(userId).collection('shop_sessions').doc(sessionId);
    const doc = await sessionRef.get();
    if (doc.exists) {
        const session = doc.data();
        const durationMs = endTime - session.startTime;
        await sessionRef.update({ endTime, durationMs });
        console.log('[SW] Ended session at', new Date(endTime).toLocaleTimeString());
    }
}

// --- Sync Event Handler ---

self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'location-sync') {
        console.log('[SW] Periodic sync event received.');
        event.waitUntil(handleLocationSync());
    }
});

async function handleLocationSync() {
    console.log('[SW] Handling location sync...');
    const userId = await idb.get('userId');
    if (!userId) {
        console.log('[SW] No user ID found. Aborting sync.');
        return;
    }

    const settings = await getSettings(userId);
    if (!settings || !settings.shopLocation || !settings.shopLocation.center) {
        console.log('[SW] No shop location settings. Aborting sync.');
        return;
    }
    
    const now = new Date();
    const nowMs = now.getTime();
    const isWorking = isWithinWorkingHours(now);
    const today = getTodaysDateString();

    try {
        const position = await getCurrentLocation();
        const currentPosition = { lat: position.coords.latitude, lng: position.coords.longitude };
        
        const distance = getDistance(currentPosition, settings.shopLocation.center);
        const isInside = distance <= settings.shopLocation.radius;
        const activeSession = await getActiveSession(userId, today);

        console.log(`[SW] Status: Inside=${isInside}, WorkingHours=${isWorking}, ActiveSession=${!!activeSession}, Distance=${distance.toFixed(0)}m`);

        if (isWorking) {
            if (isInside && !activeSession) {
                console.log('[SW] Condition: Working hours, inside, no active session. Starting new session.');
                await startNewSession(userId, nowMs);
            } else if (!isInside && activeSession) {
                console.log('[SW] Condition: Working hours, outside, active session exists. Ending session.');
                await endSession(userId, activeSession.id, nowMs);
            } else {
                console.log('[SW] Condition: No change in state needed during working hours.');
            }
        } else {
            if (activeSession) {
                console.log('[SW] Condition: Outside working hours, active session exists. Ending session.');
                await endSession(userId, activeSession.id, nowMs);
            } else {
                 console.log('[SW] Condition: Outside working hours, no active session. Nothing to do.');
            }
        }
        console.log('[SW] Sync complete.');
    } catch (error) {
        console.error('[SW] Error during location sync:', error);
    }
}
