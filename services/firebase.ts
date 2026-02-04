
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
    Query
} from "firebase/firestore";
import { User, UserSettings, ShopSession, TripSession, LatLng } from '../types';
import { firebaseConfig } from "../config";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);
const auth = getAuth(app);

// Helper to convert a Firestore doc into a typed object with its ID
const fromDoc = <T>(doc: DocumentSnapshot<DocumentData>): T => {
    return { ...doc.data(), id: doc.id } as T;
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
        // Use mobile number as a unique ID for email/password auth
        const fakeEmail = `${mobile}@pstracker.app`;
        const userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, password);
        
        // Create user profile in Firestore
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
    
    // --- Firestore Methods ---
    
    async getUser(mobile: string): Promise<User | null> {
        const docRef = doc(firestore, "users", mobile);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { mobile, ...docSnap.data() } as User;
        }
        return null;
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

    async addShopSession(userId: string, session: Omit<ShopSession, 'id'>): Promise<string> {
        const sessionsCollectionRef = collection(firestore, "users", userId, "shop_sessions");
        const docRef = await addDoc(sessionsCollectionRef, session);
        return docRef.id;
    },

    async updateShopSession(userId: string, sessionId: string, updates: Partial<ShopSession>): Promise<void> {
        const sessionRef = doc(firestore, "users", userId, "shop_sessions", sessionId);
        await updateDoc(sessionRef, updates);
    },

    async getShopSessions(userId: string, date: string): Promise<ShopSession[]> {
        const sessionsCollectionRef = collection(firestore, "users", userId, "shop_sessions");
        const q = query(sessionsCollectionRef, where("date", "==", date));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => fromDoc<ShopSession>(doc));
    },
    
    async getAllShopSessions(userId: string): Promise<ShopSession[]> {
        const sessionsCollectionRef = collection(firestore, "users", userId, "shop_sessions");
        const querySnapshot = await getDocs(sessionsCollectionRef);
        return querySnapshot.docs.map(doc => fromDoc<ShopSession>(doc));
    },

    async addTripSession(userId: string, session: Omit<TripSession, 'id'>): Promise<string> {
        const tripsCollectionRef = collection(firestore, "users", userId, "trips");
        const docRef = await addDoc(tripsCollectionRef, session);
        return docRef.id;
    },

    async updateTripSession(userId: string, sessionId: string, updates: Partial<TripSession>): Promise<void> {
        const tripRef = doc(firestore, "users", userId, "trips", sessionId);
        await updateDoc(tripRef, updates);
    },
    
    async addTripPathPoints(userId: string, sessionId: string, points: LatLng[]): Promise<void> {
        const tripRef = doc(firestore, "users", userId, "trips", sessionId);
        await updateDoc(tripRef, {
            path: arrayUnion(...points)
        });
    },

    async getTripSessions(userId: string, date: string): Promise<TripSession[]> {
        const tripsCollectionRef = collection(firestore, "users", userId, "trips");
        const q = query(tripsCollectionRef, where("date", "==", date));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => fromDoc<TripSession>(doc));
    },

    async getAllTripSessions(userId: string): Promise<TripSession[]> {
        const tripsCollectionRef = collection(firestore, "users", userId, "trips");
        const querySnapshot = await getDocs(tripsCollectionRef);
        return querySnapshot.docs.map(doc => fromDoc<TripSession>(doc));
    },

    // --- PAGINATED HISTORY ---
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