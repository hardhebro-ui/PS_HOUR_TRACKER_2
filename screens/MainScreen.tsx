
import React, { useState, useEffect, useMemo } from 'react';
import { AppView, TrackingStatus, TripSession, UserSettings, ShopLocation, ShopSession } from '../types';
import { formatDuration, isWithinWorkingHours, getTodaysDateString } from '../utils/time';
import { WORK_END_HOUR } from '../constants';
import { db } from '../services/firebase';
import { idb } from '../utils/indexedDB';
import MapPicker from '../components/MapPicker';
import { DocumentSnapshot, Timestamp } from 'firebase/firestore';

// --- HELPERS ---
const getMillis = (ts: Timestamp | number): number => typeof ts === 'number' ? ts : ts.toMillis();

const formatTimestampForDisplay = (ts: Timestamp | number | undefined): string => {
    if (!ts) return '';
    const date = (typeof ts === 'number') ? new Date(ts) : ts.toDate();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};


// --- PROPS INTERFACE ---
interface MainScreenProps {
    activeView: AppView;
    trackingStatus: TrackingStatus;
    todaysShopTime: number;
    todaysTripTime: number;
    todaysSessions: (ShopSession | TripSession)[];
    currentSessionStartTime: number | null;
    hourlyRate: number;
    shopLocationSet: boolean;
    endDay: () => void;
    toggleTrip: () => void;
    userId: string;
    isOnline: boolean;
    settings: UserSettings | null;
    updateSettings: (settings: UserSettings) => void;
    handleLogout: () => void;
}

// --- SUB-COMPONENTS ---

const HomeScreen: React.FC<Pick<MainScreenProps, 'trackingStatus' | 'todaysShopTime' | 'todaysTripTime' | 'currentSessionStartTime' | 'hourlyRate' | 'shopLocationSet' | 'endDay' | 'todaysSessions'>> = ({ 
    trackingStatus, 
    todaysShopTime, 
    todaysTripTime, 
    currentSessionStartTime,
    hourlyRate,
    shopLocationSet,
    endDay,
    todaysSessions
}) => {
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [showEndDayPrompt, setShowEndDayPrompt] = useState(false);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const checkTimeInterval = setInterval(() => {
            const now = new Date();
            const isActive = trackingStatus === TrackingStatus.IN_SHOP || trackingStatus === TrackingStatus.ON_TRIP;
            const dismissedToday = sessionStorage.getItem('endDayPromptDismissed') === new Date().toISOString().split('T')[0];

            if (now.getHours() >= WORK_END_HOUR && isActive && !dismissedToday) {
                setShowEndDayPrompt(true);
            }
        }, 60 * 1000);

        return () => clearInterval(checkTimeInterval);
    }, [trackingStatus]);


    const getStatusInfo = () => {
        if (!shopLocationSet) {
            return { text: 'Tracking Disabled', color: 'bg-yellow-500', subtext: 'Please set shop location in settings.' };
        }
        if (!isWithinWorkingHours(new Date()) && trackingStatus === TrackingStatus.IDLE) {
            return { text: 'Off Hours', color: 'bg-gray-500', subtext: 'Tracking begins at 8 AM.' };
        }
        switch (trackingStatus) {
            case TrackingStatus.IN_SHOP:
                return { text: 'Inside Shop', color: 'bg-green-500', subtext: 'Work time is being recorded.' };
            case TrackingStatus.ON_TRIP:
                return { text: 'On a Trip', color: 'bg-blue-500', subtext: 'Trip time is being recorded.' };
            case TrackingStatus.IDLE:
                 return { text: 'Outside Shop', color: 'bg-red-500', subtext: 'Currently not tracking work time.' };
            default:
                return { text: 'Idle', color: 'bg-gray-500', subtext: 'Not currently tracking.' };
        }
    };
    
    const statusInfo = getStatusInfo();

    const currentSessionDuration = currentSessionStartTime ? currentTime - currentSessionStartTime : 0;
    const totalWorkTime = todaysShopTime + todaysTripTime + (trackingStatus !== TrackingStatus.IDLE ? currentSessionDuration : 0);
    const totalEarnings = (totalWorkTime / (1000 * 60 * 60)) * hourlyRate;

    const handleDismissPrompt = () => {
        sessionStorage.setItem('endDayPromptDismissed', new Date().toISOString().split('T')[0]);
        setShowEndDayPrompt(false);
    };

    const handleConfirmEndDay = () => {
        endDay();
        setShowEndDayPrompt(false);
    };

    const EndDayModal = () => (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 shadow-xl max-w-sm w-full text-left">
                <h3 className="text-lg font-bold text-gray-800">End of Day</h3>
                <p className="my-4 text-gray-600">It's past 7 PM. Would you like to end your work session for the day?</p>
                <div className="flex justify-end space-x-3">
                    <button onClick={handleDismissPrompt} className="px-4 py-2 rounded font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors">Dismiss</button>
                    <button onClick={handleConfirmEndDay} className="px-4 py-2 rounded font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors">End Day</button>
                </div>
            </div>
        </div>
    );
    
    const TodaysActivity = () => (
         <div className="bg-white p-6 rounded-xl shadow-lg">
            <h3 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2">Today's Activity</h3>
            {todaysSessions.length > 0 ? (
                <ul className="space-y-3">
                    {todaysSessions.map(session => (
                        <li key={session.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                            <div>
                                <p className="font-medium text-gray-800">
                                    {'path' in session ? 'Trip' : 'Shop'}
                                    <span className="text-xs text-gray-500 ml-2">
                                        {formatTimestampForDisplay(session.startTime)} - {session.endTime ? formatTimestampForDisplay(session.endTime) : ''}
                                    </span>
                                </p>
                                {('isPending' in session && session.isPending) && <p className="text-xs text-yellow-600">Pending sync</p>}
                            </div>
                            <span className="font-bold text-gray-700">{formatDuration(session.durationMs || 0)}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-center text-gray-500 py-4">No completed sessions yet today.</p>
            )}
        </div>
    );

    return (
        <div className="flex flex-col space-y-6">
            {showEndDayPrompt && <EndDayModal />}
            <div className="text-center bg-white p-6 rounded-xl shadow-lg">
                <div className="flex items-center justify-center mb-2">
                    <span className={`h-3 w-3 rounded-full ${statusInfo.color} mr-2`}></span>
                    <h2 className="text-xl font-semibold text-gray-700">{statusInfo.text}</h2>
                </div>
                <p className="text-gray-500 text-sm mb-4">{statusInfo.subtext}</p>
                <div className="text-6xl font-mono font-bold text-gray-800 tracking-wider bg-gray-100 p-4 rounded-lg">
                    {formatDuration(totalWorkTime)}
                </div>
                <p className="text-xs text-gray-400 mt-2">Total Work Time Today</p>
                {currentSessionStartTime && (
                    <p className="text-sm text-gray-500 mt-2 h-5">
                        Current: {formatDuration(currentSessionDuration)}
                    </p>
                )}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Today's Summary</h3>
                 <div className="text-center my-4">
                    <span className="font-bold text-4xl text-green-600">₹{totalEarnings.toFixed(2)}</span>
                </div>
                <div className="space-y-3">
                     <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Shop Time</span>
                        <span className="font-medium text-gray-700">{formatDuration(todaysShopTime + (trackingStatus === TrackingStatus.IN_SHOP ? currentSessionDuration : 0))}</span>
                    </div>
                     <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Trip Time</span>
                        <span className="font-medium text-gray-700">{formatDuration(todaysTripTime + (trackingStatus === TrackingStatus.ON_TRIP ? currentSessionDuration : 0))}</span>
                    </div>
                </div>
                 {(trackingStatus === TrackingStatus.IN_SHOP || trackingStatus === TrackingStatus.ON_TRIP) && (
                    <button
                        onClick={endDay}
                        className="w-full bg-orange-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-orange-600 transition duration-300 mt-6"
                    >
                        End Day
                    </button>
                )}
            </div>
            <TodaysActivity />
        </div>
    );
};

const TripScreen: React.FC<Pick<MainScreenProps, 'toggleTrip' | 'currentSessionStartTime' | 'userId' | 'shopLocationSet' | 'isOnline' | 'trackingStatus'>> = ({ toggleTrip, currentSessionStartTime, userId, shopLocationSet, isOnline, trackingStatus }) => {
    const isTripActive = trackingStatus === TrackingStatus.ON_TRIP;
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [todaysTrips, setTodaysTrips] = useState<TripSession[]>([]);

    useEffect(() => {
        const fetchTrips = async () => {
            const today = getTodaysDateString();
            const onlineTrips = await db.getTripSessions(userId, today);
            const pendingTrips = await idb.getAllPendingTrips();
            const todaysPending = pendingTrips.filter(t => t.date === today && t.endTime);
            
            const combined = [...onlineTrips, ...todaysPending];
            setTodaysTrips(combined.sort((a,b) => getMillis(b.startTime) - getMillis(a.startTime)));
        };
        fetchTrips();
    }, [userId, isTripActive, isOnline]);

    useEffect(() => {
        if (isTripActive) {
            const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
            return () => clearInterval(timer);
        }
    }, [isTripActive]);

    const currentTripDuration = isTripActive && currentSessionStartTime ? currentTime - currentSessionStartTime : 0;
    const buttonText = isTripActive ? 'End Trip' : 'Start Trip';
    const buttonColor = isTripActive ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600';

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="text-center bg-white p-6 rounded-xl shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-700">Trip Control</h2>
                    <div className={`flex items-center text-xs px-2 py-1 rounded-full ${isOnline ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        <span className={`h-2 w-2 rounded-full mr-1 ${isOnline ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                        {isOnline ? 'Online' : 'Offline'}
                    </div>
                </div>

                {isTripActive && (
                    <div className="mb-4">
                        <div className="text-5xl font-mono font-bold text-gray-800 tracking-wider bg-gray-100 p-4 rounded-lg">
                           {formatDuration(currentTripDuration)}
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Current Trip Duration</p>
                    </div>
                )}
                 {!shopLocationSet ? (
                    <p className="text-yellow-600 bg-yellow-100 p-3 rounded-md">Set shop location in Settings to start a trip.</p>
                ) : (
                    <button
                        onClick={toggleTrip}
                        className={`w-full text-white font-bold py-4 px-4 rounded-lg transition duration-300 text-lg ${buttonColor}`}
                    >
                        {buttonText}
                    </button>
                )}
            </div>
            
            <div className="flex-grow bg-white p-4 rounded-xl shadow-lg">
                <h3 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2">Today's Completed Trips</h3>
                {todaysTrips.length > 0 ? (
                    <ul className="space-y-3">
                        {todaysTrips.map(trip => (
                            <li key={trip.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                <div>
                                    <p className="font-medium text-gray-800">
                                        {formatTimestampForDisplay(trip.startTime)} - {trip.endTime ? formatTimestampForDisplay(trip.endTime) : ''}
                                    </p>
                                    {trip.isPending && <p className="text-xs text-yellow-600">Pending sync</p>}
                                </div>
                                <span className="font-bold text-gray-700">{formatDuration(trip.durationMs || 0)}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-center text-gray-500 mt-8">No completed trips today.</p>
                )}
            </div>
        </div>
    );
};

const HistoryScreen: React.FC<Pick<MainScreenProps, 'userId' | 'hourlyRate' | 'isOnline'>> = ({ userId, hourlyRate, isOnline }) => {
    type AggregatedSession = ShopSession | TripSession;
    type FilterType = 'week' | 'month' | 'all';
    const PAGE_SIZE = 20;

    const [allSessions, setAllSessions] = useState<AggregatedSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [filter, setFilter] = useState<FilterType>('all');
    
    const [lastShopDoc, setLastShopDoc] = useState<DocumentSnapshot | undefined>();
    const [lastTripDoc, setLastTripDoc] = useState<DocumentSnapshot | undefined>();
    const [hasMore, setHasMore] = useState(true);

    const fetchHistoryFromFirebase = async (initialLoad = false) => {
        if (!isOnline) {
            setHasMore(false);
            return;
        };
        if (initialLoad) setLoading(true); else setLoadingMore(true);

        try {
            const [shopData, tripData] = await Promise.all([
                db.getPaginatedShopSessions(userId, PAGE_SIZE, initialLoad ? undefined : lastShopDoc),
                db.getPaginatedTripSessions(userId, PAGE_SIZE, initialLoad ? undefined : lastTripDoc),
            ]);
            const newSessions = [...shopData.sessions, ...tripData.sessions];
            await idb.cacheHistory(newSessions);

            setLastShopDoc(shopData.lastDoc);
            setLastTripDoc(tripData.lastDoc);

            if (shopData.sessions.length < PAGE_SIZE && tripData.sessions.length < PAGE_SIZE) setHasMore(false);
            
            setAllSessions(prev => {
                const combined = initialLoad ? newSessions : [...prev, ...newSessions];
                const uniqueSessions = Array.from(new Map(combined.map(item => [item.id, item])).values());
                return uniqueSessions;
            });

        } catch (error) {
            console.error("Failed to fetch history:", error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const loadHistory = async () => {
        setLoading(true);
        const cachedSessions = await idb.getAllHistory();
        if (cachedSessions.length > 0) {
            setAllSessions(cachedSessions);
        }
        setLoading(false);

        if (isOnline) {
           await fetchHistoryFromFirebase(true);
        }
    };

    useEffect(() => {
        if (userId) loadHistory();
    }, [userId, isOnline]);

    const dailyData = useMemo(() => {
        const summary: { [key: string]: { totalDurationMs: number } } = {};
        allSessions.forEach(session => {
            if (session.date && session.durationMs) {
                if (!summary[session.date]) summary[session.date] = { totalDurationMs: 0 };
                summary[session.date].totalDurationMs += session.durationMs;
            }
        });
        return Object.entries(summary)
            .map(([date, data]) => ({ date, totalDurationMs: data.totalDurationMs, earnings: (data.totalDurationMs / 3600000) * hourlyRate }))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [allSessions, hourlyRate]);

    const filteredData = useMemo(() => {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
        startOfWeek.setHours(0, 0, 0, 0);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        switch (filter) {
            case 'week': return dailyData.filter(d => new Date(d.date) >= startOfWeek);
            case 'month': return dailyData.filter(d => new Date(d.date) >= startOfMonth);
            default: return dailyData;
        }
    }, [dailyData, filter]);

    const FilterButton: React.FC<{ label: string; type: FilterType; }> = ({ label, type }) => (
        <button onClick={() => setFilter(type)} className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${filter === type ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>{label}</button>
    );

    if (loading && allSessions.length === 0) return <div className="text-center text-gray-500 mt-8">Loading history...</div>;

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className='flex justify-between items-center'>
                <h1 className="text-2xl font-bold text-gray-800">Work History</h1>
                {!isOnline && <div className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">Offline Mode</div>}
            </div>
            <div className="flex space-x-2 bg-gray-200 p-1 rounded-lg shadow-inner">
                <FilterButton label="This Week" type="week" />
                <FilterButton label="This Month" type="month" />
                <FilterButton label="All Time" type="all" />
            </div>
            {filteredData.length > 0 ? (
                <>
                    <ul className="space-y-3 flex-grow overflow-y-auto">
                        {filteredData.map(day => (
                            <li key={day.date} className="bg-white p-4 rounded-lg shadow-md">
                                <div className="flex justify-between items-center">
                                    <p className="font-bold text-gray-800">{new Date(day.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</p>
                                    <span className="font-semibold text-green-600">₹{day.earnings.toFixed(2)}</span>
                                </div>
                                <div className="text-right text-gray-600 mt-1">{formatDuration(day.totalDurationMs)}</div>
                            </li>
                        ))}
                    </ul>
                    {hasMore && filter === 'all' && isOnline && <button onClick={() => fetchHistoryFromFirebase(false)} disabled={loadingMore} className="w-full bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-lg hover:bg-gray-300 transition duration-300 disabled:bg-gray-100">{loadingMore ? 'Loading...' : 'Load More'}</button>}
                </>
            ) : <div className="text-center text-gray-500 mt-12 bg-white p-8 rounded-lg shadow"><p>No recorded history for this period.</p></div>}
        </div>
    );
};

const SettingsScreen: React.FC<Pick<MainScreenProps, 'settings' | 'updateSettings' | 'handleLogout'>> = ({ settings, updateSettings, handleLogout }) => {
    const [hourlyRate, setHourlyRate] = useState(settings?.hourlyRate || 0);
    const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => setHourlyRate(settings?.hourlyRate || 0), [settings]);

    const showMessage = (msg: string) => {
        setMessage(msg);
        setTimeout(() => setMessage(''), 3000);
    };

    const handleSaveRate = () => {
        updateSettings({ ...settings!, hourlyRate: Number(hourlyRate) });
        showMessage("Hourly rate saved!");
    };
    
    const handleSaveLocation = (location: ShopLocation) => {
        updateSettings({ hourlyRate: settings?.hourlyRate || 0, shopLocation: location });
        setIsMapPickerOpen(false);
        showMessage("Location saved successfully!");
    };

    return (
        <div className="space-y-8">
            {message && <div className="bg-green-100 text-green-700 p-3 rounded-md text-center">{message}</div>}
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Shop Location</h2>
                {settings?.shopLocation?.center ? (
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between"><span className="font-medium text-gray-500">Coordinates:</span><span className="font-mono text-gray-800 text-xs">{`Lat: ${settings.shopLocation.center.lat.toFixed(4)}, Lng: ${settings.shopLocation.center.lng.toFixed(4)}`}</span></div>
                        <div className="flex justify-between"><span className="font-medium text-gray-500">Radius:</span><span className="font-mono text-gray-800">{settings.shopLocation.radius} meters</span></div>
                    </div>
                ) : <p className="text-gray-500">Shop location is not set.</p>}
                <button onClick={() => setIsMapPickerOpen(true)} className="w-full mt-4 bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 transition duration-300">{settings?.shopLocation ? 'Change Location' : 'Set Location'}</button>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Financials</h2>
                <div>
                    <label className="block text-sm font-medium text-gray-600">Hourly Rate (₹)</label>
                    <input type="number" value={hourlyRate} onChange={e => setHourlyRate(parseFloat(e.target.value))} className="mt-1 w-full p-2 border border-gray-300 rounded-md" />
                </div>
                 <button onClick={handleSaveRate} className="w-full mt-4 bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition duration-300 text-lg">Save Rate</button>
            </div>
            <button onClick={handleLogout} className="w-full bg-red-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-600 transition duration-300">Logout</button>
            {isMapPickerOpen && <MapPicker initialLocation={settings?.shopLocation} onSave={handleSaveLocation} onCancel={() => setIsMapPickerOpen(false)} />}
        </div>
    );
};


// --- MAIN COMPONENT ---
const MainScreen: React.FC<MainScreenProps> = (props) => {
    const { activeView } = props;
    return (
        <>
            <div style={{ display: activeView === 'home' ? 'block' : 'none' }}>
                <HomeScreen {...props} />
            </div>
            <div style={{ display: activeView === 'trip' ? 'block' : 'none' }}>
                <TripScreen {...props} currentSessionStartTime={props.trackingStatus === TrackingStatus.ON_TRIP ? props.currentSessionStartTime : null} />
            </div>
            <div style={{ display: activeView === 'history' ? 'block' : 'none' }}>
                <HistoryScreen {...props} />
            </div>
            <div style={{ display: activeView === 'settings' ? 'block' : 'none' }}>
                <SettingsScreen {...props} />
            </div>
        </>
    );
};

export default MainScreen;