
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../services/firebase';
import { ShopSession, TripSession } from '../types';
import { formatDuration } from '../utils/time';

interface HistoryScreenProps {
    userId: string;
    hourlyRate: number;
}

type DailySummary = {
    date: string;
    totalDurationMs: number;
    earnings: number;
};

type FilterType = 'week' | 'month' | 'all';

const HistoryScreen: React.FC<HistoryScreenProps> = ({ userId, hourlyRate }) => {
    const [dailyData, setDailyData] = useState<DailySummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterType>('all');

    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            try {
                const shopSessions = await db.getAllShopSessions(userId);
                const tripSessions = await db.getAllTripSessions(userId);
                const allSessions = [...shopSessions, ...tripSessions];

                const summary: { [key: string]: { totalDurationMs: number } } = {};

                allSessions.forEach(session => {
                    if (session.date && session.durationMs) {
                        if (!summary[session.date]) {
                            summary[session.date] = { totalDurationMs: 0 };
                        }
                        summary[session.date].totalDurationMs += session.durationMs;
                    }
                });

                const formattedData = Object.entries(summary)
                    .map(([date, data]) => ({
                        date,
                        totalDurationMs: data.totalDurationMs,
                        earnings: (data.totalDurationMs / (1000 * 60 * 60)) * hourlyRate
                    }))
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                
                setDailyData(formattedData);
            } catch (error) {
                console.error("Failed to fetch history:", error);
            } finally {
                setLoading(false);
            }
        };

        if (userId) {
            fetchHistory();
        }
    }, [userId, hourlyRate]);

    const filteredData = useMemo(() => {
        const now = new Date();
        const today = now.getDay(); // 0=Sun, 1=Mon, ...
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - today + (today === 0 ? -6 : 1)); // Adjust to Monday
        startOfWeek.setHours(0, 0, 0, 0);

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        startOfMonth.setHours(0, 0, 0, 0);

        switch (filter) {
            case 'week':
                return dailyData.filter(d => new Date(d.date) >= startOfWeek);
            case 'month':
                return dailyData.filter(d => new Date(d.date) >= startOfMonth);
            case 'all':
            default:
                return dailyData;
        }
    }, [dailyData, filter]);

    const FilterButton: React.FC<{
        label: string;
        type: FilterType;
    }> = ({ label, type }) => (
        <button
            onClick={() => setFilter(type)}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                filter === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
        >
            {label}
        </button>
    );

    if (loading) {
        return <div className="text-center text-gray-500 mt-8">Loading history...</div>;
    }

    return (
        <div className="flex flex-col h-full space-y-4">
            <h1 className="text-2xl font-bold text-gray-800">Work History</h1>
            
            <div className="flex space-x-2 bg-gray-200 p-1 rounded-lg shadow-inner">
                <FilterButton label="This Week" type="week" />
                <FilterButton label="This Month" type="month" />
                <FilterButton label="All Time" type="all" />
            </div>

            {filteredData.length > 0 ? (
                <ul className="space-y-3 flex-grow overflow-y-auto">
                    {filteredData.map(day => (
                        <li key={day.date} className="bg-white p-4 rounded-lg shadow-md">
                            <div className="flex justify-between items-center">
                                <p className="font-bold text-gray-800">
                                    {new Date(day.date).toLocaleDateString('en-US', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric',
                                        timeZone: 'UTC'
                                    })}
                                </p>
                                <span className="font-semibold text-green-600">₹{day.earnings.toFixed(2)}</span>
                            </div>
                            <div className="text-right text-gray-600 mt-1">
                                {formatDuration(day.totalDurationMs)}
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="text-center text-gray-500 mt-12 bg-white p-8 rounded-lg shadow">
                    <p>No recorded history for this period.</p>
                </div>
            )}
        </div>
    );
};

export default HistoryScreen;
