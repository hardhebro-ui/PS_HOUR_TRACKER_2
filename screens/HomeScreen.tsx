
import React, { useState, useEffect } from 'react';
import { TrackingStatus } from '../types';
import { formatDuration, isWithinWorkingHours } from '../utils/time';
import { WORK_END_HOUR } from '../constants';

interface HomeScreenProps {
    trackingStatus: TrackingStatus;
    todaysShopTime: number;
    todaysTripTime: number;
    currentSessionStartTime: number | null;
    hourlyRate: number;
    shopLocationSet: boolean;
    endDay: () => void;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ 
    trackingStatus, 
    todaysShopTime, 
    todaysTripTime, 
    currentSessionStartTime,
    hourlyRate,
    shopLocationSet,
    endDay
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
        }, 60 * 1000); // Check every minute

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
                 {(trackingStatus === TrackingStatus.IN_SHOP || trackingStatus === TrackingStatus.ON_TRIP) && (
                    <button
                        onClick={endDay}
                        className="w-full bg-orange-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-orange-600 transition duration-300 mt-6"
                    >
                        End Day
                    </button>
                )}
            </div>
        </div>
    );
};

export default HomeScreen;
