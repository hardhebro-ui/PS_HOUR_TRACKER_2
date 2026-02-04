
import React, { useState, useEffect } from 'react';
import { UserSettings } from '../types';

interface SettingsScreenProps {
    settings: UserSettings | null;
    updateSettings: (settings: UserSettings) => void;
    handleLogout: () => void;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({ settings, updateSettings, handleLogout }) => {
    const [hourlyRate, setHourlyRate] = useState(settings?.hourlyRate || 0);
    const [lat, setLat] = useState(settings?.shopLocation?.lat || '');
    const [lng, setLng] = useState(settings?.shopLocation?.lng || '');
    const [radius, setRadius] = useState(settings?.shopLocation?.radius || 50);
    const [message, setMessage] = useState('');

    useEffect(() => {
        setHourlyRate(settings?.hourlyRate || 0);
        setLat(settings?.shopLocation?.lat.toString() || '');
        setLng(settings?.shopLocation?.lng.toString() || '');
        setRadius(settings?.shopLocation?.radius || 50);
    }, [settings]);

    const showMessage = (msg: string) => {
        setMessage(msg);
        setTimeout(() => setMessage(''), 3000);
    };

    const handleSave = () => {
        const newSettings: UserSettings = {
            hourlyRate: Number(hourlyRate),
            shopLocation: {
                lat: parseFloat(lat.toString()),
                lng: parseFloat(lng.toString()),
                radius: Number(radius),
            },
        };
        if(isNaN(newSettings.shopLocation.lat) || isNaN(newSettings.shopLocation.lng)) {
            showMessage("Invalid latitude or longitude.");
            return;
        }
        updateSettings(newSettings);
        showMessage("Settings saved successfully!");
    };
    
    const useCurrentLocation = () => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLat(position.coords.latitude.toString());
                setLng(position.coords.longitude.toString());
                showMessage("Location fetched. Press Save.");
            },
            (error) => {
                showMessage(`Error fetching location: ${error.message}`);
            }
        );
    };

    return (
        <div className="space-y-8">
            {message && <div className="bg-green-100 text-green-700 p-3 rounded-md text-center">{message}</div>}

            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Shop Location</h2>
                <div className="space-y-4">
                    <div className="flex space-x-2">
                        <div>
                            <label className="block text-sm font-medium text-gray-600">Latitude</label>
                            <input type="number" value={lat} onChange={e => setLat(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600">Longitude</label>
                            <input type="number" value={lng} onChange={e => setLng(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md" />
                        </div>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-600">Radius (meters)</label>
                        <input type="number" value={radius} onChange={e => setRadius(parseInt(e.target.value, 10))} className="mt-1 w-full p-2 border border-gray-300 rounded-md" />
                    </div>
                    <button onClick={useCurrentLocation} className="w-full bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 transition duration-300">
                        Use Current Location
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Financials</h2>
                <div>
                    <label className="block text-sm font-medium text-gray-600">Hourly Rate (₹)</label>
                    <input type="number" value={hourlyRate} onChange={e => setHourlyRate(parseFloat(e.target.value))} className="mt-1 w-full p-2 border border-gray-300 rounded-md" />
                </div>
            </div>

            <button onClick={handleSave} className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition duration-300 text-lg">
                Save Settings
            </button>
            
            <button onClick={handleLogout} className="w-full bg-red-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-600 transition duration-300">
                Logout
            </button>
        </div>
    );
};

export default SettingsScreen;
