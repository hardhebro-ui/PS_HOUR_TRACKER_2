
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

    const activeSessionIdRef = useRef<string | null>(null);
    const watchIdRef = useRef<number | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        const registerPeriodicSync = async () => {
            const registration = await navigator.serviceWorker.ready;
            try {
                // @ts-ignore
                await registration.periodicSync.register('location-sync', {
                    minInterval: 15 * 60 * 1000, // 15 minutes
                });
                console.log('Periodic sync registered');
            } catch (e) {
                console.error('Periodic sync could not be registered:', e);
            }
        };
        
        const unregisterPeriodicSync = async () => {
            const registration = await navigator.serviceWorker.ready;
            try {
                // @ts-ignore
                await registration.periodicSync.unregister('location-sync');
                console.log('Periodic sync unregistered');
            } catch(e) {
                console.error('Periodic sync could not be unregistered', e);
            }
        };

        const unsubscribe = db.onAuthChange(async (firebaseUser) => {
            if (firebaseUser && firebaseUser.email) {
                const mobile = firebaseUser.email.split('@')[0];
                const appUser = await db.getUser(mobile);
                if(appUser){
                    setUser(appUser);
                    await idb.set('userId', appUser.mobile);
                    registerPeriodicSync();
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
    }, []);

    const fetchTodaysTotals = useCallback(async (userId: string) => {
        const today = getTodaysDateString();
        const shopSessions = await db.getShopSessions(userId, today);
        const tripSessions = await db.getTripSessions(userId, today);
        const totalShop = shopSessions.reduce((acc, s) => acc + (s.durationMs || 0), 0);
        const totalTrip = tripSessions.reduce((acc, t) => acc + (t.durationMs || 0), 0);
        setTodaysShopTime(totalShop);
        setTodaysTripTime(totalTrip);
    }, []);
    
    // Combined effect for all user-dependent initialization logic
    useEffect(() => {
        if (!user) return;

        const cleanupIncompleteSessions = async (userId: string) => {
            console.log("Checking for incomplete sessions from previous days...");
            try {
                const todayStr = getTodaysDateString();
                const allShopSessions = await db.getAllShopSessions(userId);
                const allTripSessions = await db.getAllTripSessions(userId);

                const incompleteShopSessions = allShopSessions.filter(s => !s.endTime && s.date < todayStr);
                const incompleteTripSessions = allTripSessions.filter(t => !t.endTime && t.date < todayStr);

                if (incompleteShopSessions.length === 0 && incompleteTripSessions.length === 0) return;
                
                const updatePromises = incompleteShopSessions.concat(incompleteTripSessions as any).map(session => {
                    const d = new Date(session.date);
                    d.setUTCHours(WORK_END_HOUR, 0, 0, 0);
                    const endTime = d.getTime();
                    const durationMs = endTime - session.startTime;
                    if (durationMs > 0) {
                        const updates = { endTime, durationMs };
                        if ('path' in session) { // It's a trip session
                            return db.updateTripSession(userId, session.id, updates);
                        } else { // It's a shop session
                            return db.updateShopSession(userId, session.id, updates);
                        }
                    }
                    return Promise.resolve();
                });

                await Promise.all(updatePromises);
                console.log("Successfully cleaned up incomplete sessions.");
            } catch (error) {
                console.error("Error during session cleanup:", error);
            }
        };

        const resumeTodaysSession = async (userId: string) => {
            const today = getTodaysDateString();
            const shopSessions = await db.getShopSessions(userId, today);
            const incompleteShopSession = shopSessions.find(s => !s.endTime);

            if (incompleteShopSession) {
                console.log("Resuming an incomplete shop session from today.");
                setTrackingStatus(TrackingStatus.IN_SHOP);
                setCurrentSessionStartTime(incompleteShopSession.startTime);
                activeSessionIdRef.current = incompleteShopSession.id;
                return; // Exit if a shop session is resumed
            }

            const tripSessions = await db.getTripSessions(userId, today);
            const incompleteTripSession = tripSessions.find(t => !t.endTime);

            if (incompleteTripSession) {
                console.log("Resuming an incomplete trip session from today.");
                setTrackingStatus(TrackingStatus.ON_TRIP);
                setCurrentSessionStartTime(incompleteTripSession.startTime);
                activeSessionIdRef.current = incompleteTripSession.id;
            }
        };

        const initializeUserSession = async () => {
            await cleanupIncompleteSessions(user.mobile);
            await fetchTodaysTotals(user.mobile);
            await resumeTodaysSession(user.mobile);
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
        if (user) {
            db.saveSettings(user.mobile, newSettings);
        }
    };

    const endCurrentSession = useCallback(async (endTime: number) => {
        if (!user || !activeSessionIdRef.current || !currentSessionStartTime) return;

        const durationMs = endTime - currentSessionStartTime;
        if (trackingStatus === TrackingStatus.IN_SHOP) {
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
    }, [user, trackingStatus, currentSessionStartTime]);

    const startNewSession = useCallback(async (status: TrackingStatus.IN_SHOP | TrackingStatus.ON_TRIP, startTime: number) => {
        if (!user) return;
        
        setTrackingStatus(status);
        setCurrentSessionStartTime(startTime);
        
        let sessionId: string;
        if (status === TrackingStatus.IN_SHOP) {
            const newSession: Omit<ShopSession, 'id'> = { startTime, date: getTodaysDateString() };
            sessionId = await db.addShopSession(user.mobile, newSession);
        } else {
            const newSession: Omit<TripSession, 'id'> = { startTime, date: getTodaysDateString(), path: currentPosition ? [currentPosition] : [] };
            sessionId = await db.addTripSession(user.mobile, newSession);
        }
        activeSessionIdRef.current = sessionId;
    }, [user, currentPosition]);

    // Core Tracking Logic
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

        const handleError = (error: GeolocationPositionError) => {
            console.error("GPS Error:", error.message);
        };

        watchIdRef.current = navigator.geolocation.watchPosition(
            handlePositionUpdate,
            handleError,
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );

        return () => {
            if (watchIdRef.current) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
    }, [user, settings, trackingStatus, endCurrentSession, startNewSession]);

    // Trip GPS Path recording
    useEffect(() => {
        if (trackingStatus === TrackingStatus.ON_TRIP && user && activeSessionIdRef.current && currentPosition) {
            db.addTripPathPoint(user.mobile, activeSessionIdRef.current, currentPosition);
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
                            <Route path="/" element={
                                <HomeScreen 
                                    trackingStatus={trackingStatus}
                                    todaysShopTime={todaysShopTime}
                                    todaysTripTime={todaysTripTime}
                                    currentSessionStartTime={currentSessionStartTime}
                                    hourlyRate={settings?.hourlyRate || 0}
                                    shopLocationSet={!!settings?.shopLocation}
                                />
                            } />
                            <Route path="/trip" element={
                                <TripScreen 
                                    isTripActive={trackingStatus === TrackingStatus.ON_TRIP}
                                    toggleTrip={toggleTrip}
                                    currentTripStartTime={trackingStatus === TrackingStatus.ON_TRIP ? currentSessionStartTime : null}
                                    userId={user.mobile}
                                    shopLocationSet={!!settings?.shopLocation}
                                />
                            } />
                            <Route path="/history" element={
                                <HistoryScreen 
                                    userId={user.mobile}
                                    hourlyRate={settings?.hourlyRate || 0}
                                />
                            } />
                            <Route path="/settings" element={
                                <SettingsScreen 
                                    settings={settings} 
                                    updateSettings={updateSettings} 
                                    handleLogout={handleLogout}
                                />
                            } />
                        </Routes>
                    </main>
                    <BottomNav />
                </>
            ) : (
                <Routes>
                    <Route path="*" element={<AuthScreen />} />
                </Routes>
            )}
        </div>
    );
};

export default App;