
// Using compat libraries for easier use in a non-module service worker environment.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js');
importScripts('https://cdn.jsdelivr.net/npm/open-location-code@2.0.0/openlocationcode.min.js');


// --- Cache Logic ---
const CACHE_NAME = 'work-hours-tracker-v1';
const urlsToCache = [
  '/',
  '/index.html',
  'https://cdn.tailwindcss.com',
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
    apiKey: "AIzaSyDy3i42CEgE64S9i2zbUInCICs2Tm5cFZ8",
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

function getDistance(plusCode1, plusCode2) {
    const point1 = OpenLocationCode.decode(plusCode1);
    const point2 = OpenLocationCode.decode(plusCode2);

    const R = 6371e3; // Earth's radius in metres
    const φ1 = point1.latitudeCenter * Math.PI / 180;
    const φ2 = point2.latitudeCenter * Math.PI / 180;
    const Δφ = (point2.latitudeCenter - point1.latitudeCenter) * Math.PI / 180;
    const Δλ = (point2.longitudeCenter - point1.longitudeCenter) * Math.PI / 180;

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
    if (!settings || !settings.shopLocation) {
        console.log('[SW] No shop location settings. Aborting sync.');
        return;
    }
    
    const now = new Date();
    const nowMs = now.getTime();
    const isWorking = isWithinWorkingHours(now);
    const today = getTodaysDateString();

    try {
        const position = await getCurrentLocation();
        const currentPlusCode = OpenLocationCode.encode(position.coords.latitude, position.coords.longitude);
        
        const distance = getDistance(currentPlusCode, settings.shopLocation.plusCode);
        const isInside = distance <= settings.shopLocation.radius;
        const activeSession = await getActiveSession(userId, today);

        console.log(`[SW] Status: Inside=${isInside}, WorkingHours=${isWorking}, ActiveSession=${!!activeSession}, Distance=${distance.toFixed(0)}m`);

        if (isWorking) {
            if (isInside && !activeSession) {
                await startNewSession(userId, nowMs);
            } else if (!isInside && activeSession) {
                await endSession(userId, activeSession.id, nowMs);
            }
        } else {
            if (activeSession) {
                await endSession(userId, activeSession.id, nowMs);
            }
        }
        console.log('[SW] Sync complete.');
    } catch (error) {
        console.error('[SW] Error during location sync:', error);
    }
}