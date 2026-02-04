
import React, { useState, useEffect } from 'react';
import { UserSettings, ShopLocation } from '../types';
import MapPicker from '../components/MapPicker';

interface SettingsScreenProps {
    settings: UserSettings | null;
    updateSettings: (settings: UserSettings) => void;
    handleLogout: () => void;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({ settings, updateSettings, handleLogout }) => {
    const [hourlyRate, setHourlyRate] = useState(settings?.hourlyRate || 0);
    const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        setHourlyRate(settings?.hourlyRate || 0);
    }, [settings]);

    const showMessage = (msg: string) => {
        setMessage(msg);
        setTimeout(() => setMessage(''), 3000);
    };

    const handleSaveRate = () => {
        updateSettings({ ...settings!, hourlyRate: Number(hourlyRate) });
        showMessage("Hourly rate saved!");
    };
    
    const handleSaveLocation = (location: ShopLocation) => {
        const newSettings = {
            ...settings,
            hourlyRate: settings?.hourlyRate || 0,
            shopLocation: location,
        };
        updateSettings(newSettings);
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
                        <div className="flex justify-between">
                            <span className="font-medium text-gray-500">Coordinates:</span>
                            <span className="font-mono text-gray-800 text-xs">{`Lat: ${settings.shopLocation.center.lat.toFixed(4)}, Lng: ${settings.shopLocation.center.lng.toFixed(4)}`}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-medium text-gray-500">Radius:</span>
                            <span className="font-mono text-gray-800">{settings.shopLocation.radius} meters</span>
                        </div>
                    </div>
                ) : (
                    <p className="text-gray-500">Shop location is not set.</p>
                )}
                <button 
                    onClick={() => setIsMapPickerOpen(true)} 
                    className="w-full mt-4 bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 transition duration-300">
                    {settings?.shopLocation ? 'Change Location on Map' : 'Set Location on Map'}
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Financials</h2>
                <div>
                    <label className="block text-sm font-medium text-gray-600">Hourly Rate (₹)</label>
                    <input 
                        type="number" 
                        value={hourlyRate} 
                        onChange={e => setHourlyRate(parseFloat(e.target.value))} 
                        className="mt-1 w-full p-2 border border-gray-300 rounded-md" 
                    />
                </div>
                 <button onClick={handleSaveRate} className="w-full mt-4 bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition duration-300 text-lg">
                    Save Rate
                </button>
            </div>
            
            <button onClick={handleLogout} className="w-full bg-red-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-600 transition duration-300">
                Logout
            </button>
            
            {isMapPickerOpen && (
                <MapPicker
                    initialLocation={settings?.shopLocation}
                    onSave={handleSaveLocation}
                    onCancel={() => setIsMapPickerOpen(false)}
                />
            )}
        </div>
    );
};

export default SettingsScreen;