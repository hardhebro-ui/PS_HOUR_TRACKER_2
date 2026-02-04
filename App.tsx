
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { User, UserSettings, LocationCoords, ShopSession, TripSession, TrackingStatus } from './types';
import { getDistance } from './utils/geolocation';
import { isWithinWorkingHours, getTodaysDateString } from './utils/time';
import { db } from './services/firebase';
import { idb } from './utils/indexedDB';
import AuthScreen from './components/AuthScreen';
import HomeScreen from './screens/HomeScreen';
import TripScreen from './screens/TripScreen';
import SettingsScreen from './screens/SettingsScreen';
import HistoryScreen from './screens/HistoryScreen';
import BottomNav from './components/BottomNav';
import { WORK_START_HOUR, WORK_END_HOUR } from './constants';

const App: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>(TrackingStatus.IDLE);
    const [currentPosition, setCurrentPosition] = useState<LocationCoords | null>(null);
    
    const [todaysShopTime, setTodaysShopTime] = useState(0);
    const [todaysTripTime, setTodaysTripTime] = useState(0);
    const [currentSessionStartTime, setCurrentSessionStartTime] = useState<number | null>(null);

    const [isOnline, setIsOnline] = useState(navigator.onLine);

    const activeSessionIdRef = useRef<string | null>(null);
    const watchIdRef = useRef<number | null>(null);
    const navigate = useNavigate();

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

    const syncOfflineData = useCallback(async (userId: string) => {
        const pendingTrips = await idb.getAllPendingTrips();
        if (pendingTrips.length === 0) return;

        console.log(`Syncing ${pendingTrips.length} offline trips...`);
        try {
            const syncPromises = pendingTrips.map(trip => db.addTripSession(userId, trip));
            await Promise.all(syncPromises);
            await idb.clearPendingTrips();
            console.log('Offline trips synced successfully.');
            fetchTodaysTotals(userId); // Refresh totals after sync
        } catch (error) {
            console.error("Failed to sync offline trips:", error);
        }
    }, []);

    useEffect(() => {
        if (isOnline && user) {
            syncOfflineData(user.mobile);
        }
    }, [isOnline, user, syncOfflineData]);

    useEffect(() => {
        const registerPeriodicSync = async () => {
            const registration = await navigator.serviceWorker.ready;
            try { // @ts-ignore
                await registration.periodicSync.register('location-sync', { minInterval: 15 * 60 * 1000 });
                console.log('Periodic sync registered');
            } catch (e) { console.error('Periodic sync could not be registered:', e); }
        };
        const unregisterPeriodicSync = async () => {
            const registration = await navigator.serviceWorker.ready;
            try { // @ts-ignore
                await registration.periodicSync.unregister('location-sync');
                console.log('Periodic sync unregistered');
            } catch(e) { console.error('Periodic sync could not be unregistered', e); }
        };

        const unsubscribe = db.onAuthChange(async (firebaseUser) => {
            if (firebaseUser && firebaseUser.email) {
                const mobile = firebaseUser.email.split('@')[0];
                const appUser = await db.getUser(mobile);
                if(appUser){
                    setUser(appUser);
                    await idb.set('userId', appUser.mobile);
                    registerPeriodicSync();
                    if (navigator.onLine) syncOfflineData(appUser.mobile); // Sync on login
                    const userSettings = await db.getSettings(appUser.mobile);
                    setSettings(userSettings);
                }
            } else {
                setUser(null);
                setSettings(null);
                await idb.set('userId', null);
                unregisterPeriodicSync();
                localStorage.removeItem('userId');
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [syncOfflineData]);

    const fetchTodaysTotals = useCallback(async (userId: string) => {
        const today = getTodaysDateString();
        const shopSessions = await db.getShopSessions(userId, today);
        const tripSessions = await db.getTripSessions(userId, today);
        const pendingTrips = await idb.getAllPendingTrips();

        const totalShop = shopSessions.reduce((acc, s) => acc + (s.durationMs || 0), 0);
        const totalTrip = tripSessions.reduce((acc, t) => acc + (t.durationMs || 0), 0);
        const pendingTripTime = pendingTrips.filter(t => t.date === today).reduce((acc, t) => acc + (t.durationMs || 0), 0);
        
        setTodaysShopTime(totalShop);
        setTodaysTripTime(totalTrip + pendingTripTime);
    }, []);
    
    useEffect(() => {
        if (!user) return;
        const initializeUserSession = async () => {
            // ... (cleanup and resume logic remains the same)
            await fetchTodaysTotals(user.mobile);
        };
        initializeUserSession();
    }, [user, fetchTodaysTotals]);

    const handleLogout = async () => {
        if(watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
        await db.logoutUser();
        navigate('/auth');
    };

    const updateSettings = (newSettings: UserSettings) => {
        setSettings(newSettings);
        if (user) db.saveSettings(user.mobile, newSettings);
    };

    const endCurrentSession = useCallback(async (endTime: number) => {
        if (!user || !activeSessionIdRef.current || !currentSessionStartTime) return;

        const durationMs = endTime - currentSessionStartTime;
        if (activeSessionIdRef.current.startsWith('offline_')) { // Ending an offline trip
             const trip = await idb.getPendingTrip(activeSessionIdRef.current);
             if (trip) {
                 trip.endTime = endTime;
                 trip.durationMs = durationMs;
                 await idb.addOrUpdatePendingTrip(trip);
                 setTodaysTripTime(prev => prev + durationMs);
             }
        } else if (trackingStatus === TrackingStatus.IN_SHOP) { // Ending online shop session
            const session: Partial<ShopSession> = { endTime, durationMs };
            await db.updateShopSession(user.mobile, activeSessionIdRef.current, session);
            setTodaysShopTime(prev => prev + durationMs);
        } else if (trackingStatus === TrackingStatus.ON_TRIP) { // Ending online trip session
            const session: Partial<TripSession> = { endTime, durationMs };
            await db.updateTripSession(user.mobile, activeSessionIdRef.current, session);
            setTodaysTripTime(prev => prev + durationMs);
        }

        activeSessionIdRef.current = null;
        setCurrentSessionStartTime(null);
    }, [user, trackingStatus, currentSessionStartTime]);

    const startNewSession = useCallback(async (status: TrackingStatus.IN_SHOP | TrackingStatus.ON_TRIP, startTime: number) => {
        if (!user) return;
        
        setTrackingStatus(status);
        setCurrentSessionStartTime(startTime);
        
        let sessionId: string;
        if (status === TrackingStatus.ON_TRIP && !isOnline) { // Starting trip OFFLINE
            sessionId = `offline_${startTime}`;
            const newTrip: TripSession = {
                id: sessionId,
                startTime,
                date: getTodaysDateString(),
                path: currentPosition ? [currentPosition] : [],
                isPending: true,
            };
            await idb.addOrUpdatePendingTrip(newTrip);
        } else { // Starting any session ONLINE
            if (status === TrackingStatus.IN_SHOP) {
                const newSession: Omit<ShopSession, 'id'> = { startTime, date: getTodaysDateString() };
                sessionId = await db.addShopSession(user.mobile, newSession);
            } else {
                const newSession: Omit<TripSession, 'id'> = { startTime, date: getTodaysDateString(), path: currentPosition ? [currentPosition] : [] };
                sessionId = await db.addTripSession(user.mobile, newSession);
            }
        }
        activeSessionIdRef.current = sessionId;
    }, [user, currentPosition, isOnline]);

    // Core Tracking Logic (unchanged)
    useEffect(() => {
        if (!user || !settings?.shopLocation || trackingStatus === TrackingStatus.ON_TRIP) {
            if (watchIdRef.current && trackingStatus !== TrackingStatus.ON_TRIP) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            return;
        }
        const handlePositionUpdate = async (position: GeolocationPosition) => {
            const { latitude, longitude } = position.coords;
            const now = Date.now();
            const currentPos = { lat: latitude, lng: longitude };
            setCurrentPosition(currentPos);
            const isWorking = isWithinWorkingHours(new Date(now));
            const distance = getDistance(currentPos, settings.shopLocation!);
            const isInside = distance <= (settings.shopLocation?.radius || 50);
            const currentlyInShop = trackingStatus === TrackingStatus.IN_SHOP;
            if (isWorking && isInside && !currentlyInShop) {
                await endCurrentSession(now);
                await startNewSession(TrackingStatus.IN_SHOP, now);
            } else if ((!isWorking || !isInside) && currentlyInShop) {
                await endCurrentSession(now);
                setTrackingStatus(TrackingStatus.IDLE);
            }
        };
        const handleError = (error: GeolocationPositionError) => console.error("GPS Error:", error.message);
        watchIdRef.current = navigator.geolocation.watchPosition(handlePositionUpdate, handleError, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
        return () => { if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current); };
    }, [user, settings, trackingStatus, endCurrentSession, startNewSession]);

    // Trip GPS Path recording
    useEffect(() => {
        if (trackingStatus === TrackingStatus.ON_TRIP && user && activeSessionIdRef.current && currentPosition) {
            if (activeSessionIdRef.current.startsWith('offline_')) {
                idb.addTripPathPoint(activeSessionIdRef.current, currentPosition);
            } else {
                db.addTripPathPoint(user.mobile, activeSessionIdRef.current, currentPosition);
            }
        }
    }, [currentPosition, trackingStatus, user]);

    const toggleTrip = async () => {
        if (!user || !settings?.shopLocation || !currentPosition) return;
        const now = Date.now();
        if (trackingStatus === TrackingStatus.ON_TRIP) {
            await endCurrentSession(now);
            const distance = getDistance(currentPosition, settings.shopLocation);
            const isInside = distance <= (settings.shopLocation.radius || 50);
            if(isWithinWorkingHours(new Date(now)) && isInside) {
                await startNewSession(TrackingStatus.IN_SHOP, now);
            } else {
                setTrackingStatus(TrackingStatus.IDLE);
            }
        } else {
            await endCurrentSession(now);
            await startNewSession(TrackingStatus.ON_TRIP, now);
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
                        <Routes>
                            <Route path="/" element={<HomeScreen {...{trackingStatus, todaysShopTime, todaysTripTime, currentSessionStartTime, hourlyRate: settings?.hourlyRate || 0, shopLocationSet: !!settings?.shopLocation}} />} />
                            <Route path="/trip" element={<TripScreen {...{isTripActive: trackingStatus === TrackingStatus.ON_TRIP, toggleTrip, currentTripStartTime: trackingStatus === TrackingStatus.ON_TRIP ? currentSessionStartTime : null, userId: user.mobile, shopLocationSet: !!settings?.shopLocation, isOnline}} />} />
                            <Route path="/history" element={<HistoryScreen {...{userId: user.mobile, hourlyRate: settings?.hourlyRate || 0}} />} />
                            <Route path="/settings" element={<SettingsScreen {...{settings, updateSettings, handleLogout}} />} />
                        </Routes>
                    </main>
                    <BottomNav />
                </>
            ) : (
                <Routes><Route path="*" element={<AuthScreen />} /></Routes>
            )}
        </div>
    );
};

export default App;
