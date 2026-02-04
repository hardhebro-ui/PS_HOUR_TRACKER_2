
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ShopLocation, LatLng } from '../types';
import L from 'leaflet';

// Leaflet's icons can have pathing issues when used with module systems. This is a standard fix.
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface NominatimResult {
    place_id: number;
    lat: string;
    lon: string;
    display_name: string;
}

interface MapPickerProps {
    initialLocation: ShopLocation | null;
    onSave: (location: ShopLocation) => void;
    onCancel: () => void;
}

const MapPicker: React.FC<MapPickerProps> = ({ initialLocation, onSave, onCancel }) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<L.Map | null>(null);
    const circleInstance = useRef<L.Circle | null>(null);
    const searchMarker = useRef<L.Marker | null>(null);

    const [currentCenter, setCurrentCenter] = useState<LatLng | null>(initialLocation?.center || null);
    const [radius, setRadius] = useState(initialLocation?.radius || 50);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    
    const panMapToCurrentLocation = useCallback(() => {
        if (!mapInstance.current) return;
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const center: LatLng = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                };
                mapInstance.current?.setView(center, 17);
            },
            () => {
                alert("Could not get your location. Please ensure location services are enabled.");
            }
        );
    }, []);
    
    // Effect for debounced search
    useEffect(() => {
        if (!searchQuery) {
            setSearchResults([]);
            return;
        }

        const handler = setTimeout(async () => {
            setIsSearching(true);
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=in`);
                const data: NominatimResult[] = await response.json();
                setSearchResults(data);
            } catch (error) {
                console.error("Search failed:", error);
                setSearchResults([]);
            } finally {
                setIsSearching(false);
            }
        }, 500); // 500ms debounce

        return () => clearTimeout(handler);
    }, [searchQuery]);

    const handleSearchResultClick = (result: NominatimResult) => {
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);
        
        if (mapInstance.current) {
            mapInstance.current.setView([lat, lng], 17);

            // Add or move the temporary marker
            if (searchMarker.current) {
                searchMarker.current.setLatLng([lat, lng]);
            } else {
                searchMarker.current = L.marker([lat, lng]).addTo(mapInstance.current);
            }
        }
        setSearchQuery('');
        setSearchResults([]);
    };

    // Effect to initialize the map instance
    useEffect(() => {
        if (!mapRef.current || mapInstance.current) return;

        let initialCenter: LatLng = { lat: 20.5937, lng: 78.9629 };
        let initialZoom = 5;
        if (initialLocation?.center) {
            initialCenter = initialLocation.center;
            setCurrentCenter(initialLocation.center);
            initialZoom = 17;
        }

        mapInstance.current = L.map(mapRef.current, { center: initialCenter, zoom: initialZoom, zoomControl: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(mapInstance.current);

        circleInstance.current = L.circle(initialCenter, { radius, color: '#1A73E8', weight: 2, fillOpacity: 0.25 }).addTo(mapInstance.current);

        mapInstance.current.on('move', () => {
            const newCenter = mapInstance.current?.getCenter();
            if(newCenter) {
                 setCurrentCenter({ lat: newCenter.lat, lng: newCenter.lng });
                 circleInstance.current?.setLatLng(newCenter);
            }
        });
        
        // When user manually drags the map, remove the search marker
        mapInstance.current.on('dragstart', () => {
            if (searchMarker.current && mapInstance.current) {
                mapInstance.current.removeLayer(searchMarker.current);
                searchMarker.current = null;
            }
        });

        if (!initialLocation) panMapToCurrentLocation();
        
        setTimeout(() => mapInstance.current?.invalidateSize(), 100);

        return () => {
            mapInstance.current?.remove();
            mapInstance.current = null;
        };

    }, [initialLocation, panMapToCurrentLocation]);

    useEffect(() => {
        if(circleInstance.current) circleInstance.current.setRadius(radius);
    }, [radius]);
    
    const handleSave = () => {
        if(currentCenter) onSave({ center: currentCenter, radius });
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-100 text-gray-800">
            <div ref={mapRef} className="flex-grow w-full" id="map" />
            
            <>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-[1000]">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-red-500 drop-shadow-lg">
                      <path fillRule="evenodd" d="M12 2.25c-2.485 0-4.5 2.015-4.5 4.5 0 2.485 4.5 9.75 4.5 9.75s4.5-7.265 4.5-9.75c0-2.485-2.015-4.5-4.5-4.5zm0 6.75c-.966 0-1.75-.784-1.75-1.75s.784-1.75 1.75-1.75 1.75.784 1.75 1.75-.784 1.75-1.75 1.75z" clipRule="evenodd" />
                    </svg>
                </div>
                
                <button onClick={panMapToCurrentLocation} className="absolute bottom-40 left-4 bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700 z-[1000]">
                    locate me
                </button>

                <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent z-[1000]">
                     <div className="bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-lg">
                        <p className="text-black text-center font-mono text-sm mb-2">
                            {currentCenter ? `Lat: ${currentCenter.lat.toFixed(5)}, Lng: ${currentCenter.lng.toFixed(5)}` : 'Move map to set location'}
                        </p>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search for a place..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-4 pr-10 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {isSearching && <div className="absolute top-1/2 right-3 -translate-y-1/2 w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>}
                            {searchResults.length > 0 && (
                                <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                    {searchResults.map(result => (
                                        <li key={result.place_id} onClick={() => handleSearchResultClick(result)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer">
                                            {result.display_name}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent z-[1000]">
                    <div className="bg-white/90 backdrop-blur-sm p-4 rounded-lg shadow-lg space-y-4">
                        <div className="flex items-center space-x-3">
                             <label htmlFor="radius" className="text-sm font-medium text-gray-700">Radius:</label>
                             <input id="radius" type="range" min="25" max="500" step="25" value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                            <span className="font-mono text-sm text-gray-800 w-20 text-center">{radius}m</span>
                        </div>
                         <div className="flex space-x-2">
                            <button onClick={onCancel} className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300">Cancel</button>
                            <button onClick={handleSave} className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700">Save Location</button>
                        </div>
                    </div>
                </div>
            </>
        </div>
    );
};

export default MapPicker;