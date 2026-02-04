
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, UserSettings, LatLng, ShopSession, TripSession, TrackingStatus, AppView } from './types';
import { getDistance } from './utils/geolocation';
import { isWithinWorkingHours, getTodaysDateString } from './utils/time';
import { db } from './services/firebase';
import { idb } from './utils/indexedDB';
import AuthScreen from './components/AuthScreen';
import MainScreen from './screens/MainScreen';
import BottomNav from './components/BottomNav';
import { WORK_START_HOUR, WORK_END_HOUR } from './constants';

const App: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>(TrackingStatus.IDLE);
    const [currentPosition, setCurrentPosition] = useState<LatLng | null>(null);
    const [activeView, setActiveView] = useState<AppView>('home');
    
    const [todaysShopTime, setTodaysShopTime] = useState(0);
    const [todaysTripTime, setTodaysTripTime] = useState(0);
    const [currentSessionStartTime, setCurrentSessionStartTime] = useState<number | null>(null);

    const [isOnline, setIsOnline] = useState(navigator.onLine);

    const activeSessionIdRef = useRef<string | null>(null);
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
        const pendingTripTime = pendingTrips.filter(t => t.date === today && t.endTime).reduce((acc, t) => acc + (t.durationMs || 0), 0);
        
        setTodaysShopTime(totalShop);
        setTodaysTripTime(totalTrip + pendingTripTime);
    }, []);
    
    useEffect(() => {
        if (!user) return;

        const cleanupIncompleteSessions = async (userId: string) => {
            const todayStr = getTodaysDateString();
            const allShopSessions = await db.getAllShopSessions(userId);
            const allTripSessions = await db.getAllTripSessions(userId);

            const incompleteSessions = [
                ...allShopSessions.filter(s => !s.endTime && s.date < todayStr),
                ...allTripSessions.filter(t => !t.endTime && t.date < todayStr)
            ];

            if (incompleteSessions.length === 0) return;
            console.log(`Cleaning up ${incompleteSessions.length} incomplete sessions from previous days...`);

            const promises = incompleteSessions.map(session => {
                const sessionDate = new Date(session.startTime);
                sessionDate.setHours(WORK_END_HOUR, 0, 0, 0);
                const endTime = sessionDate.getTime();
                const durationMs = Math.max(0, endTime - session.startTime);
                const updates = { endTime, durationMs };
                if ('path' in session) {
                    return db.updateTripSession(userId, session.id, updates);
                }
                return db.updateShopSession(userId, session.id, updates);
            });
            await Promise.all(promises);
        };

        const resumeTodaysSessionFromDB = async (userId: string) => {
            const today = getTodaysDateString();
            
            const shopSessions = await db.getShopSessions(userId, today);
            const activeShopSession = shopSessions.find(s => !s.endTime);
            if (activeShopSession) {
                console.log("Resuming active shop session from DB.");
                setTrackingStatus(TrackingStatus.IN_SHOP);
                setCurrentSessionStartTime(activeShopSession.startTime);
                activeSessionIdRef.current = activeShopSession.id;
                return;
            }

            const tripSessions = await db.getTripSessions(userId, today);
            const activeTripSession = tripSessions.find(t => !t.endTime);
            if (activeTripSession) {
                console.log("Resuming active trip session from DB.");
                setTrackingStatus(TrackingStatus.ON_TRIP);
                setCurrentSessionStartTime(activeTripSession.startTime);
                activeSessionIdRef.current = activeTripSession.id;
                return;
            }
        };

        const initializeUserSession = async () => {
            const savedSessionId = localStorage.getItem('activeSessionId');
            const savedSessionStartTime = localStorage.getItem('activeSessionStartTime');
            const savedSessionStatus = localStorage.getItem('activeSessionStatus');
            let sessionResumed = false;

            if (savedSessionId && savedSessionStartTime && savedSessionStatus) {
                console.log("Resuming session from localStorage.");
                activeSessionIdRef.current = savedSessionId;
                setCurrentSessionStartTime(Number(savedSessionStartTime));
                setTrackingStatus(savedSessionStatus as TrackingStatus);
                sessionResumed = true;
            }

            await cleanupIncompleteSessions(user.mobile);
            await fetchTodaysTotals(user.mobile);
            
            if (!sessionResumed) {
                await resumeTodaysSessionFromDB(user.mobile);
            }
        };

        initializeUserSession();
    }, [user, fetchTodaysTotals]);

    const handleLogout = async () => {
        if(watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
        localStorage.removeItem('activeSessionId');
        localStorage.removeItem('activeSessionStartTime');
        localStorage.removeItem('activeSessionStatus');
        await db.logoutUser();
    };

    const updateSettings = (newSettings: UserSettings) => {
        setSettings(newSettings);
        if (user) db.saveSettings(user.mobile, newSettings);
    };

    const flushTripPathBatch = useCallback(async () => {
        if (!user || !activeSessionIdRef.current || tripPathBatchRef.current.length === 0) return;

        console.log(`Flushing ${tripPathBatchRef.current.length} points to trip ${activeSessionIdRef.current}`);
        if (activeSessionIdRef.current.startsWith('offline_')) {
             await idb.addTripPathPoints(activeSessionIdRef.current, tripPathBatchRef.current);
        } else {
             await db.addTripPathPoints(user.mobile, activeSessionIdRef.current, tripPathBatchRef.current);
        }
        tripPathBatchRef.current = [];
    }, [user]);

    const endCurrentSession = useCallback(async (endTime: number) => {
        if (!user || !activeSessionIdRef.current || !currentSessionStartTime) return;

        localStorage.removeItem('activeSessionId');
        localStorage.removeItem('activeSessionStartTime');
        localStorage.removeItem('activeSessionStatus');

        await flushTripPathBatch();

        const durationMs = endTime - currentSessionStartTime;
        if (activeSessionIdRef.current.startsWith('offline_')) {
             const trip = await idb.getPendingTrip(activeSessionIdRef.current);
             if (trip) {
                 trip.endTime = endTime;
                 trip.durationMs = durationMs;
                 await idb.addOrUpdatePendingTrip(trip);
                 setTodaysTripTime(prev => prev + durationMs);
             }
        } else if (trackingStatus === TrackingStatus.IN_SHOP) {
            const session: Partial<ShopSession> = { endTime, durationMs };
            await db.updateShopSession(user.mobile, activeSessionIdRef.current, session);
            setTodaysShopTime(prev => prev + durationMs);
        } else if (trackingStatus === TrackingStatus.ON_TRIP) {
            const session: Partial<TripSession> = { endTime, durationMs };
            await db.updateTripSession(user.mobile, activeSessionIdRef.current, session);
            setTodaysTripTime(prev => prev + durationMs);
        }

        activeSessionIdRef.current = null;
        setCurrentSessionStartTime(null);
    }, [user, trackingStatus, currentSessionStartTime, flushTripPathBatch]);

    const endDay = async () => {
        const isActive = trackingStatus === TrackingStatus.IN_SHOP || trackingStatus === TrackingStatus.ON_TRIP;
        if (isActive) {
            await endCurrentSession(Date.now());
            setTrackingStatus(TrackingStatus.IDLE);
        }
    };

    const startNewSession = useCallback(async (status: TrackingStatus.IN_SHOP | TrackingStatus.ON_TRIP, startTime: number) => {
        if (!user) return;
        
        setTrackingStatus(status);
        setCurrentSessionStartTime(startTime);
        
        let sessionId: string;
        if (status === TrackingStatus.ON_TRIP && !isOnline) {
            sessionId = `offline_${startTime}`;
            const newTrip: TripSession = {
                id: sessionId,
                startTime,
                date: getTodaysDateString(),
                path: currentPosition ? [currentPosition] : [],
                isPending: true,
            };
            await idb.addOrUpdatePendingTrip(newTrip);
        } else {
            if (status === TrackingStatus.IN_SHOP) {
                const newSession: Omit<ShopSession, 'id'> = { startTime, date: getTodaysDateString() };
                sessionId = await db.addShopSession(user.mobile, newSession);
            } else {
                const newSession: Omit<TripSession, 'id'> = { startTime, date: getTodaysDateString(), path: currentPosition ? [currentPosition] : [] };
                sessionId = await db.addTripSession(user.mobile, newSession);
            }
        }
        activeSessionIdRef.current = sessionId;
        localStorage.setItem('activeSessionId', sessionId);
        localStorage.setItem('activeSessionStartTime', String(startTime));
        localStorage.setItem('activeSessionStatus', status);
    }, [user, currentPosition, isOnline]);

    useEffect(() => {
        if (!user || !settings?.shopLocation?.center || trackingStatus === TrackingStatus.ON_TRIP) {
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
            const distance = getDistance(currentPos, settings.shopLocation!.center);
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
        watchIdRef.current = navigator.geolocation.watchPosition(handlePositionUpdate, handleError, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
        return () => { if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current); };
    }, [user, settings, trackingStatus, endCurrentSession, startNewSession]);

    useEffect(() => {
        if (trackingStatus === TrackingStatus.ON_TRIP && currentPosition) {
            tripPathBatchRef.current.push(currentPosition);
        }

        if (trackingStatus === TrackingStatus.ON_TRIP && !tripPathFlushIntervalRef.current) {
            tripPathFlushIntervalRef.current = window.setInterval(flushTripPathBatch, 60 * 1000);
        } else if (trackingStatus !== TrackingStatus.ON_TRIP && tripPathFlushIntervalRef.current) {
            clearInterval(tripPathFlushIntervalRef.current);
            tripPathFlushIntervalRef.current = null;
        }

        return () => {
            if (tripPathFlushIntervalRef.current) {
                clearInterval(tripPathFlushIntervalRef.current);
            }
        };
    }, [currentPosition, trackingStatus, flushTripPathBatch]);

    const toggleTrip = async () => {
        if (!user || !settings?.shopLocation?.center || !currentPosition) return;
        const now = Date.now();
        if (trackingStatus === TrackingStatus.ON_TRIP) {
            await endCurrentSession(now);
            const distance = getDistance(currentPosition, settings.shopLocation.center);
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
                        <MainScreen
                            {...{
                                activeView,
                                trackingStatus,
                                todaysShopTime,
                                todaysTripTime,
                                currentSessionStartTime,
                                hourlyRate: settings?.hourlyRate || 0,
                                shopLocationSet: !!settings?.shopLocation?.center,
                                endDay,
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
