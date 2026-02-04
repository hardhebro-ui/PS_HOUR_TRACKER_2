
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { User, UserSettings, LocationCoords, ShopSession, TripSession, TrackingStatus } from './types';
import { hashPassword, verifyPassword } from './utils/crypto';
import { getDistance } from './utils/geolocation';
import { isWithinWorkingHours, getTodaysDateString } from './utils/time';
import { db } from './services/firebase';
import AuthScreen from './components/AuthScreen';
import HomeScreen from './screens/HomeScreen';
import TripScreen from './screens/TripScreen';
import SettingsScreen from './screens/SettingsScreen';
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
        const checkUser = async () => {
            const userId = localStorage.getItem('userId');
            if (userId) {
                const fetchedUser = await db.getUser(userId);
                if(fetchedUser){
                    setUser(fetchedUser);
                    const userSettings = await db.getSettings(fetchedUser.mobile);
                    setSettings(userSettings);
                }
            }
            setLoading(false);
        };
        checkUser();
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

    useEffect(() => {
        if (user) {
            fetchTodaysTotals(user.mobile);
        }
    }, [user, fetchTodaysTotals]);

    const handleLogin = (loggedInUser: User, userSettings: UserSettings | null) => {
        setUser(loggedInUser);
        setSettings(userSettings);
        localStorage.setItem('userId', loggedInUser.mobile);
        navigate('/');
    };

    const handleLogout = () => {
        if(watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
        setUser(null);
        setSettings(null);
        localStorage.removeItem('userId');
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
            const newSession: Omit<TripSession, 'id'> = { startTime, date: getTodaysDateString(), path: [currentPosition!] };
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
                // Entered shop
                await endCurrentSession(now);
                await startNewSession(TrackingStatus.IN_SHOP, now);
            } else if ((!isWorking || !isInside) && currentlyInShop) {
                // Left shop or work hours ended
                await endCurrentSession(now);
                setTrackingStatus(TrackingStatus.IDLE);
            }
        };

        const handleError = (error: GeolocationPositionError) => {
            console.error("GPS Error:", error.message);
            // Optionally, update UI to show GPS error
        };

        if ('geolocation' in navigator) {
            watchIdRef.current = navigator.geolocation.watchPosition(
                handlePositionUpdate,
                handleError,
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        }

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
        if (!user || !settings?.shopLocation) return;
        const now = Date.now();
        
        if (trackingStatus === TrackingStatus.ON_TRIP) { // Ending trip
            await endCurrentSession(now);
            // After trip, re-evaluate if user is inside shop or idle
            const distance = getDistance(currentPosition!, settings.shopLocation!);
            const isInside = distance <= (settings.shopLocation?.radius || 50);
            if(isWithinWorkingHours(new Date(now)) && isInside) {
                await startNewSession(TrackingStatus.IN_SHOP, now);
            } else {
                setTrackingStatus(TrackingStatus.IDLE);
            }

        } else { // Starting trip
            await endCurrentSession(now); // End any active shop session
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
                    <Route path="*" element={<AuthScreen onLogin={handleLogin} />} />
                </Routes>
            )}
        </div>
    );
};

export default App;
