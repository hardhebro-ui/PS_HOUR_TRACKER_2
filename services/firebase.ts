
import { initializeApp } from "firebase/app";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged, 
    User as FirebaseUser 
} from "firebase/auth";
import { 
    getFirestore,
    doc,
    setDoc,
    getDoc,
    addDoc,
    updateDoc,
    collection,
    query,
    where,
    getDocs,
    arrayUnion,
    DocumentData,
    DocumentSnapshot,
    orderBy,
    limit,
    startAfter,
    Query,
    serverTimestamp,
    Timestamp,
    increment
} from "firebase/firestore";
import { User, UserSettings, ShopSession, TripSession, LatLng, DailySummary } from '../types';
import { firebaseConfig } from "../config";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);
const auth = getAuth(app);

// Helper to convert a Firestore doc into a typed object with its ID
const fromDoc = <T>(doc: DocumentSnapshot<DocumentData>): T => {
    const data = doc.data();
    // Convert Firestore Timestamps to JS Timestamps for easier use, then to numbers
    for (const key in data) {
        if (data[key] instanceof Timestamp) {
            data[key] = data[key];
        }
    }
    return { ...data, id: doc.id } as T;
};

// New Auth types
interface RegisterCredentials {
    name: string;
    mobile: string;
    password: string;
}

interface LoginCredentials {
    mobile: string;
    password: string;
}

export const db = {
    async registerUser({ name, mobile, password }: RegisterCredentials): Promise<FirebaseUser> {
        const fakeEmail = `${mobile}@pstracker.app`;
        const userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, password);
        const userRef = doc(firestore, "users", mobile);
        await setDoc(userRef, { name, mobile });
        return userCredential.user;
    },

    async loginUser({ mobile, password }: LoginCredentials): Promise<FirebaseUser> {
        const fakeEmail = `${mobile}@pstracker.app`;
        const userCredential = await signInWithEmailAndPassword(auth, fakeEmail, password);
        return userCredential.user;
    },

    async logoutUser(): Promise<void> {
        await signOut(auth);
    },

    onAuthChange(callback: (user: FirebaseUser | null) => void) {
        return onAuthStateChanged(auth, callback);
    },
    
    async getUser(mobile: string): Promise<User | null> {
        const docRef = doc(firestore, "users", mobile);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? { mobile, ...docSnap.data() } as User : null;
    },

    async saveSettings(userId: string, settings: UserSettings): Promise<void> {
        const settingsRef = doc(firestore, "settings", userId);
        await setDoc(settingsRef, settings);
    },

    async getSettings(userId: string): Promise<UserSettings | null> {
        const docRef = doc(firestore, "settings", userId);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data() as UserSettings : null;
    },
    
    // --- Event-based Session Management ---

    async addShopSession(userId: string, date: string): Promise<string> {
        const sessionsCollectionRef = collection(firestore, "users", userId, "shop_sessions");
        const docRef = await addDoc(sessionsCollectionRef, { startTime: serverTimestamp(), date });
        return docRef.id;
    },

    async endShopSession(userId: string, sessionId: string): Promise<number> {
        const sessionRef = doc(firestore, "users", userId, "shop_sessions", sessionId);
        await updateDoc(sessionRef, { endTime: serverTimestamp() });

        const updatedDoc = await getDoc(sessionRef);
        const session = fromDoc<ShopSession>(updatedDoc);
        const durationMs = session.endTime!.toMillis() - session.startTime.toMillis();
        await updateDoc(sessionRef, { durationMs });
        return durationMs;
    },

    async addTripSession(userId: string, date: string, startPosition: LatLng | null): Promise<string> {
        const tripsCollectionRef = collection(firestore, "users", userId, "trips");
        const docRef = await addDoc(tripsCollectionRef, { 
            startTime: serverTimestamp(), 
            date,
            path: startPosition ? [startPosition] : []
        });
        return docRef.id;
    },

    async endTripSession(userId: string, sessionId: string): Promise<number> {
        const tripRef = doc(firestore, "users", userId, "trips", sessionId);
        await updateDoc(tripRef, { endTime: serverTimestamp() });

        const updatedDoc = await getDoc(tripRef);
        const session = fromDoc<TripSession>(updatedDoc);
        const durationMs = session.endTime!.toMillis() - session.startTime.toMillis();
        await updateDoc(tripRef, { durationMs });
        return durationMs;
    },

    async getOpenSessionForToday(userId: string, date: string): Promise<ShopSession | TripSession | null> {
        const shopSessionsRef = collection(firestore, "users", userId, "shop_sessions");
        const qShop = query(shopSessionsRef, where("date", "==", date), where("endTime", "==", null));
        const shopSnapshot = await getDocs(qShop);
        if (!shopSnapshot.empty) return { ...fromDoc<ShopSession>(shopSnapshot.docs[0]), type: 'IN_SHOP' } as any;

        const tripSessionsRef = collection(firestore, "users", userId, "trips");
        const qTrip = query(tripSessionsRef, where("date", "==", date), where("endTime", "==", null));
        const tripSnapshot = await getDocs(qTrip);
        if (!tripSnapshot.empty) return { ...fromDoc<TripSession>(tripSnapshot.docs[0]), type: 'ON_TRIP' } as any;

        return null;
    },
    
    // --- Daily Summary Management (New) ---

    async getDailySummary(userId: string, date: string): Promise<DailySummary> {
        const summaryRef = doc(firestore, "users", userId, "daily_summaries", date);
        const docSnap = await getDoc(summaryRef);
        if (docSnap.exists()) {
            return docSnap.data() as DailySummary;
        }
        return { date, shopTime: 0, tripTime: 0, totalTime: 0 };
    },

    async updateDailySummary(userId: string, date: string, durationMs: number, type: 'shop' | 'trip'): Promise<void> {
        const summaryRef = doc(firestore, "users", userId, "daily_summaries", date);
        const fieldToUpdate = type === 'shop' ? 'shopTime' : 'tripTime';
        await setDoc(summaryRef, {
            date,
            [fieldToUpdate]: increment(durationMs),
            totalTime: increment(durationMs)
        }, { merge: true });
    },

    // --- Legacy and Utility Functions ---

    async updateShopSession(userId: string, sessionId: string, updates: Partial<ShopSession>): Promise<void> {
        const sessionRef = doc(firestore, "users", userId, "shop_sessions", sessionId);
        await updateDoc(sessionRef, updates);
    },
    async updateTripSession(userId: string, sessionId: string, updates: Partial<TripSession>): Promise<void> {
        const tripRef = doc(firestore, "users", userId, "trips", sessionId);
        await updateDoc(tripRef, updates);
    },
    async getShopSessions(userId: string, date: string): Promise<ShopSession[]> {
        const sessionsCollectionRef = collection(firestore, "users", userId, "shop_sessions");
        const q = query(sessionsCollectionRef, where("date", "==", date));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => fromDoc<ShopSession>(doc));
    },
    async getTripSessions(userId: string, date: string): Promise<TripSession[]> {
        const tripsCollectionRef = collection(firestore, "users", userId, "trips");
        const q = query(tripsCollectionRef, where("date", "==", date));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => fromDoc<TripSession>(doc));
    },
     async addTripPathPoints(userId: string, sessionId: string, points: LatLng[]): Promise<void> {
        const tripRef = doc(firestore, "users", userId, "trips", sessionId);
        await updateDoc(tripRef, {
            path: arrayUnion(...points)
        });
    },
    async getAllShopSessions(userId: string): Promise<ShopSession[]> {
        const sessionsCollectionRef = collection(firestore, "users", userId, "shop_sessions");
        const querySnapshot = await getDocs(sessionsCollectionRef);
        return querySnapshot.docs.map(doc => fromDoc<ShopSession>(doc));
    },
    async getAllTripSessions(userId: string): Promise<TripSession[]> {
        const tripsCollectionRef = collection(firestore, "users", userId, "trips");
        const querySnapshot = await getDocs(tripsCollectionRef);
        return querySnapshot.docs.map(doc => fromDoc<TripSession>(doc));
    },
    async getPaginatedShopSessions(userId: string, limitCount: number, startAfterDoc?: DocumentSnapshot) {
        const sessionsCollectionRef = collection(firestore, "users", userId, "shop_sessions");
        let q: Query;
        if (startAfterDoc) {
            q = query(sessionsCollectionRef, orderBy("startTime", "desc"), startAfter(startAfterDoc), limit(limitCount));
        } else {
            q = query(sessionsCollectionRef, orderBy("startTime", "desc"), limit(limitCount));
        }
        const querySnapshot = await getDocs(q);
        const sessions = querySnapshot.docs.map(doc => fromDoc<ShopSession>(doc));
        const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
        return { sessions, lastDoc };
    },
    async getPaginatedTripSessions(userId: string, limitCount: number, startAfterDoc?: DocumentSnapshot) {
        const tripsCollectionRef = collection(firestore, "users", userId, "trips");
        let q: Query;
        if (startAfterDoc) {
            q = query(tripsCollectionRef, orderBy("startTime", "desc"), startAfter(startAfterDoc), limit(limitCount));
        } else {
            q = query(tripsCollectionRef, orderBy("startTime", "desc"), limit(limitCount));
        }
        const querySnapshot = await getDocs(q);
        const sessions = querySnapshot.docs.map(doc => fromDoc<TripSession>(doc));
        const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
        return { sessions, lastDoc };
    }
};