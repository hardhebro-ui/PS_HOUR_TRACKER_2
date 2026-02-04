
import { User, UserSettings, ShopSession, TripSession, LocationCoords } from '../types';

// This is a mock database service that uses localStorage to simulate Firestore.
// It helps in developing and testing the app without a real Firebase project.

const DB_KEY = 'patel_sons_db';

interface Database {
    users: Record<string, User>;
    settings: Record<string, UserSettings>;
    shop_sessions: Record<string, ShopSession[]>;
    trips: Record<string, TripSession[]>;
}

const getDb = (): Database => {
    try {
        const data = localStorage.getItem(DB_KEY);
        return data ? JSON.parse(data) : { users: {}, settings: {}, shop_sessions: {}, trips: {} };
    } catch (error) {
        console.error("Could not read from localStorage", error);
        return { users: {}, settings: {}, shop_sessions: {}, trips: {} };
    }
};

const saveDb = (db: Database) => {
    try {
        localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (error) {
        console.error("Could not write to localStorage", error);
    }
};

export const db = {
    async createUser(user: User): Promise<void> {
        const db = getDb();
        if (db.users[user.mobile]) {
            throw new Error("User with this mobile number already exists.");
        }
        db.users[user.mobile] = user;
        saveDb(db);
    },

    async getUser(mobile: string): Promise<User | null> {
        const db = getDb();
        return db.users[mobile] || null;
    },

    async saveSettings(userId: string, settings: UserSettings): Promise<void> {
        const db = getDb();
        db.settings[userId] = settings;
        saveDb(db);
    },

    async getSettings(userId: string): Promise<UserSettings | null> {
        const db = getDb();
        return db.settings[userId] || null;
    },

    async addShopSession(userId: string, session: Omit<ShopSession, 'id'>): Promise<string> {
        const db = getDb();
        if (!db.shop_sessions[userId]) {
            db.shop_sessions[userId] = [];
        }
        const id = `shop_${Date.now()}`;
        const newSession = { ...session, id };
        db.shop_sessions[userId].push(newSession);
        saveDb(db);
        return id;
    },

    async updateShopSession(userId: string, sessionId: string, updates: Partial<ShopSession>): Promise<void> {
        const db = getDb();
        const sessionIndex = db.shop_sessions[userId]?.findIndex(s => s.id === sessionId);
        if (sessionIndex !== undefined && sessionIndex > -1) {
            db.shop_sessions[userId][sessionIndex] = { ...db.shop_sessions[userId][sessionIndex], ...updates };
            saveDb(db);
        }
    },

    async getShopSessions(userId: string, date: string): Promise<ShopSession[]> {
        const db = getDb();
        return (db.shop_sessions[userId] || []).filter(s => s.date === date);
    },
    
    async addTripSession(userId: string, session: Omit<TripSession, 'id'>): Promise<string> {
        const db = getDb();
        if (!db.trips[userId]) {
            db.trips[userId] = [];
        }
        const id = `trip_${Date.now()}`;
        const newSession = { ...session, id };
        db.trips[userId].push(newSession);
        saveDb(db);
        return id;
    },

    async updateTripSession(userId: string, sessionId: string, updates: Partial<TripSession>): Promise<void> {
        const db = getDb();
        const sessionIndex = db.trips[userId]?.findIndex(s => s.id === sessionId);
        if (sessionIndex !== undefined && sessionIndex > -1) {
            db.trips[userId][sessionIndex] = { ...db.trips[userId][sessionIndex], ...updates };
            saveDb(db);
        }
    },
    
    async addTripPathPoint(userId: string, sessionId: string, point: LocationCoords): Promise<void> {
        const db = getDb();
        const sessionIndex = db.trips[userId]?.findIndex(s => s.id === sessionId);
        if (sessionIndex !== undefined && sessionIndex > -1) {
            db.trips[userId][sessionIndex].path.push(point);
            saveDb(db);
        }
    },

    async getTripSessions(userId: string, date: string): Promise<TripSession[]> {
        const db = getDb();
        return (db.trips[userId] || []).filter(t => t.date === date);
    }
};
