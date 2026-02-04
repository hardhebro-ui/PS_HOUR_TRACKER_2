
const DB_NAME = 'PatelSonsDB';
const DB_VERSION = 1;
const STORE_NAME = 'userState';

let db: IDBDatabase;

function getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (db) {
            return resolve(db);
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('IndexedDB error:', request.error);
            reject('Error opening DB');
        };

        request.onsuccess = (event) => {
            db = (event.target as IDBOpenDBRequest).result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const dbInstance = (event.target as IDBOpenDBRequest).result;
            if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
                dbInstance.createObjectStore(STORE_NAME, { keyPath: 'key' });
            }
        };
    });
}

export const idb = {
    async get<T>(key: string): Promise<T | undefined> {
        const db = await getDB();
        return new Promise((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);
            request.onsuccess = () => {
                resolve(request.result?.value);
            };
            request.onerror = () => {
                resolve(undefined);
            };
        });
    },
    async set(key: string, value: any): Promise<void> {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put({ key, value });
            request.onsuccess = () => {
                resolve();
            };
            request.onerror = () => {
                console.error('IDB set error:', request.error);
                reject(request.error);
            };
        });
    }
};
