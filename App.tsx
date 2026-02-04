
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, UserSettings, LatLng, ShopSession, TripSession, TrackingStatus, AppView, DailySummary } from './types';
import { getDistance } from './utils/geolocation';
import { isWithinWorkingHours, getTodaysDateString } from './utils/time';
import { db } from './services/firebase';
import { idb } from './utils/indexedDB';
import AuthScreen from './components/AuthScreen';
import MainScreen from './screens/MainScreen';
import BottomNav from './components/BottomNav';
import { WORK_START_HOUR, WORK_END_HOUR } from './constants';
import { Timestamp } from 'firebase/firestore';

const getMillis = (ts: Timestamp | number): number => typeof ts === 'number' ? ts : ts.toMillis();

const App: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>(TrackingStatus.IDLE);
    const [currentPosition, setCurrentPosition] = useState<LatLng | null>(null);
    const [activeView, setActiveView] = useState<AppView>('home');
    
    // State now driven by daily summary for efficiency
    const [dailySummary, setDailySummary] = useState<DailySummary>({ date: getTodaysDateString(), shopTime: 0, tripTime: 0, totalTime: 0 });
    const [todaysSessions, setTodaysSessions] = useState<(ShopSession | TripSession)[]>([]);
    const [currentSessionStartTime, setCurrentSessionStartTime] = useState<number | null>(null);

    const [isOnline, setIsOnline] = useState(navigator.onLine);

    const activeSessionRef = useRef<{ id: string; type: 'IN_SHOP' | 'ON_TRIP' } | null>(null);
    const watchIdRef = useRef<number | null>(null);
    const tripPathBatchRef = useRef<LatLng[]>([]);
    const tripPathFlushIntervalRef = useRef<number | null>(null);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);
    
    const fetchTodaysData = useCallback(async (userId: string) => {
        const today = getTodaysDateString();
        // Fetch the efficient daily summary
        const summary = await db.getDailySummary(userId, today);
        setDailySummary(summary);
        
        // Fetch full sessions for the activity log
        const shopSessions = await db.getShopSessions(userId, today);
        const tripSessions = await db.getTripSessions(userId, today);
        const pendingTrips = await idb.getAllPendingTrips();
        
        const allTodaysSessions = [
            ...shopSessions.filter(s => s.endTime), 
            ...tripSessions.filter(t => t.endTime),
            ...pendingTrips.filter(t => t.date === today && t.endTime)
        ].sort((a, b) => getMillis(b.startTime) - getMillis(a.startTime));
        setTodaysSessions(allTodaysSessions);
    }, []);

    const syncOfflineData = useCallback(async (userId: string) => {
        // This function would be expanded to handle offline-created shop sessions if needed
        const pendingTrips = await idb.getAllPendingTrips();
        if (pendingTrips.length === 0) return;

        console.log(`Syncing ${pendingTrips.length} offline trips...`);
        try {
            for (const trip of pendingTrips) {
                const session: Omit<TripSession, 'id'> = { ...trip, startTime: new Timestamp(trip.startTime as any / 1000, 0), endTime: new Timestamp(trip.endTime as any / 1000, 0) };
                const newId = await db.addTripSession(userId, session.date, null); // startTime is tricky here
                await db.updateTripSession(userId, newId, session);
                await db.updateDailySummary(userId, trip.date, trip.durationMs!, 'trip');
            }
            await idb.clearPendingTrips();
            console.log('Offline trips synced successfully.');
            fetchTodaysData(userId);
        } catch (error) {
            console.error("Failed to sync offline trips:", error);
        }
    }, [fetchTodaysData]);

    useEffect(() => {
        const unsubscribe = db.onAuthChange(async (firebaseUser) => {
            if (firebaseUser && firebaseUser.email) {
                const mobile = firebaseUser.email.split('@')[0];
                const appUser = await db.getUser(mobile);
                if(appUser){
                    setUser(appUser);
                    const userSettings = await db.getSettings(appUser.mobile);
                    setSettings(userSettings);
                    if (navigator.onLine) await syncOfflineData(appUser.mobile);
                }
            } else {
                setUser(null);
                setSettings(null);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [syncOfflineData]);
    
    // Main state recovery and initialization logic
    useEffect(() => {
        if (!user) return;

        const initializeUserSession = async () => {
            const today = getTodaysDateString();
            await fetchTodaysData(user.mobile);
            
            // Check for an open session from today
            const openSession = await db.getOpenSessionForToday(user.mobile, today);

            if (openSession) {
                console.log("Resuming active session from DB:", openSession);
                const status = (openSession as any).type as 'IN_SHOP' | 'ON_TRIP';
                activeSessionRef.current = { id: openSession.id, type: status };
                setCurrentSessionStartTime(openSession.startTime.toMillis());
                setTrackingStatus(TrackingStatus[status]);

                // Auto-end session if it's past working hours
                if (!isWithinWorkingHours(new Date())) {
                    endCurrentSession();
                }
            } else {
                 setTrackingStatus(TrackingStatus.IDLE);
                 setCurrentSessionStartTime(null);
                 activeSessionRef.current = null;
            }
        };

        initializeUserSession();
    }, [user, fetchTodaysData]);

    const handleLogout = async () => {
        if(watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
        await endCurrentSession();
        await db.logoutUser();
    };

    const updateSettings = (newSettings: UserSettings) => {
        setSettings(newSettings);
        if (user) db.saveSettings(user.mobile, newSettings);
    };

    const endCurrentSession = useCallback(async () => {
        if (!user || !activeSessionRef.current) return;
        
        console.log('Ending session:', activeSessionRef.current.id);
        const { id, type } = activeSessionRef.current;
        let durationMs = 0;

        try {
            if (type === 'IN_SHOP') {
                durationMs = await db.endShopSession(user.mobile, id);
                await db.updateDailySummary(user.mobile, getTodaysDateString(), durationMs, 'shop');
            } else if (type === 'ON_TRIP') {
                durationMs = await db.endTripSession(user.mobile, id);
                await db.updateDailySummary(user.mobile, getTodaysDateString(), durationMs, 'trip');
            }
        } catch (error) {
            console.error("Failed to end session:", error);
        }

        activeSessionRef.current = null;
        setCurrentSessionStartTime(null);
        setTrackingStatus(TrackingStatus.IDLE);
        await fetchTodaysData(user.mobile); // Refresh data
    }, [user, fetchTodaysData]);

    const startNewSession = useCallback(async (status: TrackingStatus.IN_SHOP | TrackingStatus.ON_TRIP) => {
        if (!user || activeSessionRef.current) return;

        const today = getTodaysDateString();
        console.log(`Starting new ${status} session.`);

        try {
            let sessionId: string;
            if (status === TrackingStatus.IN_SHOP) {
                sessionId = await db.addShopSession(user.mobile, today);
            } else { // ON_TRIP
                sessionId = await db.addTripSession(user.mobile, today, currentPosition);
            }
            // After starting, immediately fetch the new state from the DB to get server timestamp
            const openSession = await db.getOpenSessionForToday(user.mobile, today);
            if (openSession) {
                activeSessionRef.current = { id: openSession.id, type: status };
                setCurrentSessionStartTime(openSession.startTime.toMillis());
                setTrackingStatus(status);
            }
        } catch (error) {
            console.error("Failed to start new session:", error);
        }
    }, [user, currentPosition]);

    // GPS tracking effect
    useEffect(() => {
        if (!user || !settings?.shopLocation?.center || trackingStatus === TrackingStatus.ON_TRIP) {
            if (watchIdRef.current) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            return;
        }

        const handlePositionUpdate = (position: GeolocationPosition) => {
            const { latitude, longitude } = position.coords;
            const currentPos = { lat: latitude, lng: longitude };
            setCurrentPosition(currentPos);

            if (!isWithinWorkingHours(new Date())) {
                if (activeSessionRef.current) endCurrentSession();
                return;
            }

            const distance = getDistance(currentPos, settings.shopLocation!.center);
            const isInside = distance <= (settings.shopLocation?.radius || 50);
            const isInShopSession = activeSessionRef.current?.type === 'IN_SHOP';

            if (isInside && !isInShopSession) {
                startNewSession(TrackingStatus.IN_SHOP);
            } else if (!isInside && isInShopSession) {
                endCurrentSession();
            }
        };
        const handleError = (error: GeolocationPositionError) => console.error("GPS Error:", error.message);
        
        watchIdRef.current = navigator.geolocation.watchPosition(handlePositionUpdate, handleError, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
        
        return () => { if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current); };
    }, [user, settings, trackingStatus, endCurrentSession, startNewSession]);


    const toggleTrip = async () => {
        if (!user || !settings?.shopLocation?.center) return;
        
        if (activeSessionRef.current?.type === 'ON_TRIP') {
            await endCurrentSession();
            // Check if we are now inside the shop to start a shop session
            if (currentPosition) {
                const distance = getDistance(currentPosition, settings.shopLocation.center);
                if(isWithinWorkingHours(new Date()) && distance <= (settings.shopLocation.radius || 50)) {
                    await startNewSession(TrackingStatus.IN_SHOP);
                }
            }
        } else {
            // End any existing shop session before starting a trip
            if (activeSessionRef.current) await endCurrentSession();
            await startNewSession(TrackingStatus.ON_TRIP);
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-screen bg-gray-900 text-white">Loading...</div>;
    }

    return (
        <div className="md:max-w-sm md:mx-auto h-screen flex flex-col font-sans bg-gray-50">
            {user ? (
                <>
                    <main className="flex-grow overflow-y-auto p-4 pb-20">
                        <MainScreen
                            {...{
                                activeView,
                                trackingStatus,
                                todaysShopTime: dailySummary.shopTime,
                                todaysTripTime: dailySummary.tripTime,
                                todaysSessions,
                                currentSessionStartTime,
                                hourlyRate: settings?.hourlyRate || 0,
                                shopLocationSet: !!settings?.shopLocation?.center,
                                endDay: endCurrentSession,
                                toggleTrip,
                                userId: user.mobile,
                                isOnline,
                                settings,
                                updateSettings,
                                handleLogout,
                            }}
                        />
                    </main>
                    <BottomNav activeView={activeView} setActiveView={setActiveView} />
                </>
            ) : (
                <AuthScreen />
            )}
        </div>
    );
};

export default App;