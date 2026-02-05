
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
    
    const [dailySummary, setDailySummary] = useState<DailySummary>({ date: getTodaysDateString(), shopTime: 0, tripTime: 0, totalTime: 0 });
    const [todaysSessions, setTodaysSessions] = useState<(ShopSession | TripSession)[]>([]);
    const [currentSessionStartTime, setCurrentSessionStartTime] = useState<number | null>(null);

    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);
    const [locationError, setLocationError] = useState<string | null>(null);
    const locationErrorTimeoutRef = useRef<number | null>(null);

    const activeSessionRef = useRef<{ id: string; type: 'IN_SHOP' | 'ON_TRIP' } | null>(null);

    const handleLocationError = useCallback((message: string | null) => {
        if (locationErrorTimeoutRef.current) {
            clearTimeout(locationErrorTimeoutRef.current);
        }
        setLocationError(message);
        if (message) {
            locationErrorTimeoutRef.current = window.setTimeout(() => {
                setLocationError(null);
            }, 5000);
        }
    }, []);
    
    const fetchTodaysData = useCallback(async (userId: string) => {
        const today = getTodaysDateString();
        const summary = await db.getDailySummary(userId, today);
        setDailySummary(summary);
        
        const shopSessions = await db.getShopSessions(userId, today);
        const tripSessions = await db.getTripSessions(userId, today);
        
        const allTodaysSessions = [
            ...shopSessions.filter(s => s.endTime), 
            ...tripSessions.filter(t => t.endTime),
        ].sort((a, b) => getMillis(b.startTime) - getMillis(a.startTime));
        setTodaysSessions(allTodaysSessions);
    }, []);

    const endCurrentSession = useCallback(async (bypassTimeCheck = false) => {
        if (!user || !activeSessionRef.current) return;

        console.log('Attempting to end session:', activeSessionRef.current.id);
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
        await fetchTodaysData(user.mobile);
    }, [user, fetchTodaysData]);

    const startNewSession = useCallback(async (status: TrackingStatus.IN_SHOP | TrackingStatus.ON_TRIP) => {
        if (!user || activeSessionRef.current) return;

        const today = getTodaysDateString();
        console.log(`Starting new ${status} session.`);

        try {
            if (!isWithinWorkingHours(new Date())) {
                console.log("Cannot start session outside of working hours.");
                return;
            }
            
            if (status === TrackingStatus.IN_SHOP) {
                await db.addShopSession(user.mobile, today);
            } else {
                await db.addTripSession(user.mobile, today, currentPosition);
            }

            const openSession = await db.getOpenSessionForToday(user.mobile, today);
            if (openSession) {
                activeSessionRef.current = { id: openSession.id, type: (openSession as any).type };
                setCurrentSessionStartTime(openSession.startTime.toMillis());
                setTrackingStatus(status);
            }
        } catch (error) {
            console.error("Failed to start new session:", error);
        }
    }, [user, currentPosition]);

    const reconcileLocationState = useCallback(async () => {
        if (!user || !settings?.shopLocation?.center || isRefreshingLocation) return;
        setIsRefreshingLocation(true);
        console.log("Reconciling location state...");
    
        const openSession = await db.getOpenSessionForToday(user.mobile, getTodaysDateString());
        const openSessionType = openSession ? (openSession as any).type : null;
    
        if (!isWithinWorkingHours(new Date())) {
            if (openSession) {
                console.log("Outside working hours. Ending any open session.");
                await endCurrentSession(true);
            }
            setIsRefreshingLocation(false);
            return;
        }
    
        navigator.geolocation.getCurrentPosition(async (position) => {
            handleLocationError(null);
            const currentPos = { lat: position.coords.latitude, lng: position.coords.longitude };
            setCurrentPosition(currentPos);
    
            const distance = getDistance(currentPos, settings.shopLocation!.center);
            const isInside = distance <= (settings.shopLocation?.radius || 50);
    
            if (isInside && openSessionType !== 'IN_SHOP') {
                if (openSession) await endCurrentSession();
                await startNewSession(TrackingStatus.IN_SHOP);
            } else if (!isInside && openSessionType === 'IN_SHOP') {
                await endCurrentSession();
            }
            setIsRefreshingLocation(false);
        }, async (error) => {
            console.error("GPS Error on reconcile:", error.message);
            let errorMessage = "Could not get location. Tracking is paused.";
            if (error.code === error.PERMISSION_DENIED) {
                errorMessage = "Location permission denied. Tracking is paused.";
            }
            handleLocationError(errorMessage);

            if (openSession) {
                console.log("Ending session due to location error.");
                await endCurrentSession();
            }
            setIsRefreshingLocation(false);
        }, { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
    
    }, [user, settings, isRefreshingLocation, handleLocationError, endCurrentSession, startNewSession]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && user) {
                console.log("App is visible, reconciling state.");
                reconcileLocationState();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [user, reconcileLocationState]);

    useEffect(() => {
        const unsubscribe = db.onAuthChange(async (firebaseUser) => {
            if (firebaseUser && firebaseUser.email) {
                const mobile = firebaseUser.email.split('@')[0];
                const appUser = await db.getUser(mobile);
                if (appUser) {
                    setUser(appUser);
                    const userSettings = await db.getSettings(appUser.mobile);
                    setSettings(userSettings);
                }
            } else {
                setUser(null);
                setSettings(null);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!user) return;
    
        const initializeUserSession = async () => {
            await fetchTodaysData(user.mobile);
            const openSession = await db.getOpenSessionForToday(user.mobile, getTodaysDateString());
    
            if (openSession) {
                console.log("Found open session on load:", openSession);
                activeSessionRef.current = { id: openSession.id, type: (openSession as any).type };
                setCurrentSessionStartTime(openSession.startTime.toMillis());
                setTrackingStatus(TrackingStatus[(openSession as any).type]);
            } else {
                activeSessionRef.current = null;
                setCurrentSessionStartTime(null);
                setTrackingStatus(TrackingStatus.IDLE);
            }
            // Trigger reconciliation to check if the state is still valid
            reconcileLocationState();
        };
    
        initializeUserSession();
    }, [user, settings]); // Rerun if settings load after user
    
    const handleLogout = async () => {
        if (activeSessionRef.current) await endCurrentSession();
        await db.logoutUser();
    };

    const updateSettings = (newSettings: UserSettings) => {
        setSettings(newSettings);
        if (user) db.saveSettings(user.mobile, newSettings);
    };
    
    const toggleTrip = async () => {
        if (!user || !settings?.shopLocation?.center) return;
        
        if (activeSessionRef.current?.type === 'ON_TRIP') {
            await endCurrentSession();
            // After ending a trip, reconcile state to check if we should start a shop session
            reconcileLocationState();
        } else {
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
                                forceLocationCheck: reconcileLocationState,
                                isRefreshingLocation,
                                locationError,
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
