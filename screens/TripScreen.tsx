
import React, { useState, useEffect, useMemo } from 'react';
import { TripSession } from '../types';
import { formatDuration } from '../utils/time';
import { db } from '../services/firebase';
import { idb } from '../utils/indexedDB';
import { getTodaysDateString } from '../utils/time';

interface TripScreenProps {
    isTripActive: boolean;
    toggleTrip: () => void;
    currentTripStartTime: number | null;
    userId: string;
    shopLocationSet: boolean;
    isOnline: boolean;
}

const TripScreen: React.FC<TripScreenProps> = ({ isTripActive, toggleTrip, currentTripStartTime, userId, shopLocationSet, isOnline }) => {
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [todaysTrips, setTodaysTrips] = useState<TripSession[]>([]);

    useEffect(() => {
        const fetchTrips = async () => {
            const today = getTodaysDateString();
            const onlineTrips = await db.getTripSessions(userId, today);
            const pendingTrips = await idb.getAllPendingTrips();
            const todaysPending = pendingTrips.filter(t => t.date === today && t.endTime);
            
            const combined = [...onlineTrips, ...todaysPending];
            setTodaysTrips(combined.sort((a,b) => b.startTime - a.startTime));
        };
        fetchTrips();
    }, [userId, isTripActive, isOnline]);

    useEffect(() => {
        if (isTripActive) {
            const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
            return () => clearInterval(timer);
        }
    }, [isTripActive]);

    const currentTripDuration = isTripActive && currentTripStartTime ? currentTime - currentTripStartTime : 0;
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
                                        {new Date(trip.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {trip.endTime ? new Date(trip.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
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

export default TripScreen;