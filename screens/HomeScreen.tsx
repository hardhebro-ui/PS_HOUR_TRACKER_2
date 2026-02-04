
import React, { useState, useEffect } from 'react';
import { TrackingStatus } from '../types';
import { formatDuration, isWithinWorkingHours } from '../utils/time';

interface HomeScreenProps {
    trackingStatus: TrackingStatus;
    todaysShopTime: number;
    todaysTripTime: number;
    currentSessionStartTime: number | null;
    hourlyRate: number;
    shopLocationSet: boolean;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ 
    trackingStatus, 
    todaysShopTime, 
    todaysTripTime, 
    currentSessionStartTime,
    hourlyRate,
    shopLocationSet
}) => {
    const [currentTime, setCurrentTime] = useState(Date.now());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    const getStatusInfo = () => {
        if (!shopLocationSet) {
            return { text: 'Tracking Disabled', color: 'bg-yellow-500', subtext: 'Please set shop location in settings.' };
        }
        if (!isWithinWorkingHours(new Date())) {
            return { text: 'Off Hours', color: 'bg-gray-500', subtext: 'Tracking is paused outside 8 AM - 7 PM.' };
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

    const StatCard: React.FC<{ title: string; value: string; color: string }> = ({ title, value, color }) => (
        <div className="bg-white p-4 rounded-lg shadow-md flex-1 text-center">
            <p className="text-sm text-gray-500">{title}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
        </div>
    );

    return (
        <div className="flex flex-col space-y-6">
            <div className="text-center bg-white p-6 rounded-xl shadow-lg">
                <div className="flex items-center justify-center mb-2">
                    <span className={`h-3 w-3 rounded-full ${statusInfo.color} mr-2`}></span>
                    <h2 className="text-xl font-semibold text-gray-700">{statusInfo.text}</h2>
                </div>
                <p className="text-gray-500 text-sm mb-4">{statusInfo.subtext}</p>
                <div className="text-6xl font-mono font-bold text-gray-800 tracking-wider bg-gray-100 p-4 rounded-lg">
                    {formatDuration(currentSessionDuration)}
                </div>
                <p className="text-xs text-gray-400 mt-2">Current Session Timer</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">Today's Summary</h3>
                <div className="space-y-3">
                     <div className="flex justify-between items-center">
                        <span className="text-gray-600">Total Work Hours</span>
                        <span className="font-bold text-lg text-blue-600">{formatDuration(totalWorkTime)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-600">Total Earnings</span>
                        <span className="font-bold text-lg text-green-600">₹{totalEarnings.toFixed(2)}</span>
                    </div>
                    <hr className="my-2"/>
                     <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Shop Time</span>
                        <span className="font-medium text-gray-700">{formatDuration(todaysShopTime + (trackingStatus === TrackingStatus.IN_SHOP ? currentSessionDuration : 0))}</span>
                    </div>
                     <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Trip Time</span>
                        <span className="font-medium text-gray-700">{formatDuration(todaysTripTime + (trackingStatus === TrackingStatus.ON_TRIP ? currentSessionDuration : 0))}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HomeScreen;
