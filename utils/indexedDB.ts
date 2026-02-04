
import { TripSession, PlusCode } from '../types';

const DB_NAME = 'WorkHoursDB';
const DB_VERSION = 2; // Incremented version for new store
const USER_STORE = 'userState';
const TRIP_STORE = 'pendingTrips';

let db: IDBDatabase;

function getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (db) return resolve(db);

        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject('Error opening DB');
        request.onsuccess = (event) => {
            db = (event.target as IDBOpenDBRequest).result;
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            const dbInstance = (event.target as IDBOpenDBRequest).result;
            if (!dbInstance.objectStoreNames.contains(USER_STORE)) {
                dbInstance.createObjectStore(USER_STORE, { keyPath: 'key' });
            }
            if (!dbInstance.objectStoreNames.contains(TRIP_STORE)) {
                dbInstance.createObjectStore(TRIP_STORE, { keyPath: 'id' });
            }
        };
    });
}

export const idb = {
    async get<T>(key: string): Promise<T | undefined> {
        const db = await getDB();
        return new Promise((resolve) => {
            const transaction = db.transaction(USER_STORE, 'readonly');
            const request = transaction.objectStore(USER_STORE).get(key);
            request.onsuccess = () => resolve(request.result?.value);
            request.onerror = () => resolve(undefined);
        });
    },
    async set(key: string, value: any): Promise<void> {
        const db = await getDB();
        const transaction = db.transaction(USER_STORE, 'readwrite');
        transaction.objectStore(USER_STORE).put({ key, value });
    },
    async addOrUpdatePendingTrip(trip: TripSession): Promise<void> {
        const db = await getDB();
        const transaction = db.transaction(TRIP_STORE, 'readwrite');
        transaction.objectStore(TRIP_STORE).put(trip);
    },
    async getPendingTrip(id: string): Promise<TripSession | undefined> {
        const db = await getDB();
        return new Promise(resolve => {
            const transaction = db.transaction(TRIP_STORE, 'readonly');
            const request = transaction.objectStore(TRIP_STORE).get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(undefined);
        });
    },
    async getAllPendingTrips(): Promise<TripSession[]> {
        const db = await getDB();
        return new Promise(resolve => {
            const transaction = db.transaction(TRIP_STORE, 'readonly');
            const request = transaction.objectStore(TRIP_STORE).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => resolve([]);
        });
    },
    async clearPendingTrips(): Promise<void> {
        const db = await getDB();
        const transaction = db.transaction(TRIP_STORE, 'readwrite');
        transaction.objectStore(TRIP_STORE).clear();
    },
    async addTripPathPoint(tripId: string, point: PlusCode): Promise<void> {
        const db = await getDB();
        const transaction = db.transaction(TRIP_STORE, 'readwrite');
        const store = transaction.objectStore(TRIP_STORE);
        const request = store.get(tripId);
        request.onsuccess = () => {
            const trip = request.result;
            if (trip) {
                trip.path.push(point);
                store.put(trip);
            }
        };
    }
};