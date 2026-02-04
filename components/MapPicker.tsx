
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ShopLocation, LatLng } from '../types';
import { loadGoogleMapsScript } from '../utils/mapsLoader';

interface MapPickerProps {
    initialLocation: ShopLocation | null;
    onSave: (location: ShopLocation) => void;
    onCancel: () => void;
}

const MapPicker: React.FC<MapPickerProps> = ({ initialLocation, onSave, onCancel }) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<any | null>(null);
    const circleInstance = useRef<any | null>(null);
    const placesService = useRef<any | null>(null);

    const [mapApiStatus, setMapApiStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [currentCenter, setCurrentCenter] = useState<LatLng | null>(initialLocation?.center || null);
    const [radius, setRadius] = useState(initialLocation?.radius || 50);
    const [nearbyPlaces, setNearbyPlaces] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [urlInput, setUrlInput] = useState('');
    const [urlError, setUrlError] = useState('');

    useEffect(() => {
        loadGoogleMapsScript()
            .then(() => setMapApiStatus('ready'))
            .catch((error) => {
                console.error("Map script loading failed:", error);
                setMapApiStatus('error');
            });
    }, []);

    const panMapToCurrentLocation = useCallback(() => {
        if (!mapInstance.current) return;
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const center = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                };
                mapInstance.current?.setCenter(center);
            },
            () => {
                console.error("Could not get user's location.");
            }
        );
    }, []);
    
    const searchNearby = useCallback(() => {
        if (!placesService.current || !mapInstance.current) return;
        
        setIsSearching(true);
        setNearbyPlaces([]); // Clear old results
        const request = {
            location: mapInstance.current.getCenter(),
            radius: 500, // Search within 500 meters of map center
        };

        placesService.current.nearbySearch(request, (results: any[], status: string) => {
            if (status === (window as any).google.maps.places.PlacesServiceStatus.OK && results) {
                setNearbyPlaces(results.slice(0, 5));
            } else {
                setNearbyPlaces([]);
            }
            setIsSearching(false);
        });
    }, []);

    // Effect to initialize the map instance once the API is loaded
    useEffect(() => {
        if (mapApiStatus !== 'ready' || !mapRef.current || mapInstance.current) return;

        try {
            let initialCenter = { lat: 20.5937, lng: 78.9629 }; // Default to India center
            if (initialLocation?.center) {
                initialCenter = initialLocation.center;
                setCurrentCenter(initialLocation.center);
            }

            mapInstance.current = new (window as any).google.maps.Map(mapRef.current, {
                center: initialCenter,
                zoom: 17,
                disableDefaultUI: true,
                gestureHandling: 'greedy',
            });
            
            placesService.current = new (window as any).google.maps.places.PlacesService(mapInstance.current);
            
            circleInstance.current = new (window as any).google.maps.Circle({
                strokeColor: '#1A73E8',
                strokeOpacity: 0.8,
                strokeWeight: 2,
                fillColor: '#1A73E8',
                fillOpacity: 0.25,
                map: mapInstance.current,
                center: initialCenter,
                radius: radius,
            });

            mapInstance.current.addListener('center_changed', () => {
                const newCenter = mapInstance.current?.getCenter();
                if(newCenter) {
                     const newCenterCoords = { lat: newCenter.lat(), lng: newCenter.lng() };
                     setCurrentCenter(newCenterCoords);
                     circleInstance.current?.setCenter(newCenter);
                }
            });
            
            // Perform an initial search once the map is ready.
            searchNearby();

            if (!initialLocation) {
                 panMapToCurrentLocation();
            }
        } catch(error) {
            console.error("Failed to initialize Google Map:", error);
            setMapApiStatus('error');
        }
    }, [mapApiStatus, initialLocation, panMapToCurrentLocation, searchNearby, radius]);

    useEffect(() => {
        if(circleInstance.current) {
            circleInstance.current.setRadius(radius);
        }
    }, [radius]);
    
    const handleSave = () => {
        if(currentCenter) {
            onSave({ center: currentCenter, radius });
        }
    };
    
    const handleUrlParse = () => {
        const regex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
        const match = urlInput.match(regex);

        if (match && match[1] && match[2]) {
            const lat = parseFloat(match[1]);
            const lng = parseFloat(match[2]);
            
            if (!isNaN(lat) && !isNaN(lng)) {
                const newCenter = { lat, lng };
                mapInstance.current?.setCenter(newCenter);
                setUrlInput('');
                setUrlError('');
                // Pan and search
                setTimeout(searchNearby, 500);
                return;
            }
        }
        
        setUrlError('Invalid or unsupported Google Maps URL.');
    };

    const handlePlaceSelect = (place: any) => {
        if (place.geometry && place.geometry.location) {
            mapInstance.current?.setCenter(place.geometry.location);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-100 text-gray-800">
            {mapApiStatus === 'loading' && (
                <div className="flex-grow w-full flex items-center justify-center">Loading Map...</div>
            )}
            {mapApiStatus === 'error' && (
                 <div className="flex-grow w-full flex flex-col items-center justify-center p-4 text-center">
                    <h3 className="text-xl font-semibold text-red-600">Oops! Map Error</h3>
                    <p className="mt-2 text-gray-600">The map could not be loaded. This might be due to an invalid API key or a network issue.</p>
                    <button onClick={onCancel} className="mt-4 bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">Close</button>
                 </div>
            )}

            <div ref={mapRef} className={`flex-grow w-full ${mapApiStatus !== 'ready' && 'hidden'}`} />
            
            {mapApiStatus === 'ready' && (
                <>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-red-500 drop-shadow-lg">
                          <path fillRule="evenodd" d="M12 2.25c-2.485 0-4.5 2.015-4.5 4.5 0 2.485 4.5 9.75 4.5 9.75s4.5-7.265 4.5-9.75c0-2.485-2.015-4.5-4.5-4.5zm0 6.75c-.966 0-1.75-.784-1.75-1.75s.784-1.75 1.75-1.75 1.75.784 1.75 1.75-.784 1.75-1.75 1.75z" clipRule="evenodd" />
                        </svg>
                    </div>

                    <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent">
                         <div className="bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-lg">
                            <p className="text-black text-center font-mono text-sm">
                                {currentCenter ? `Lat: ${currentCenter.lat.toFixed(5)}, Lng: ${currentCenter.lng.toFixed(5)}` : 'Move map to set location'}
                            </p>
                            <div className="mt-2 pt-2 border-t">
                                <div className="flex space-x-2">
                                    <input
                                        type="url"
                                        placeholder="Paste Google Maps URL"
                                        value={urlInput}
                                        onChange={(e) => { setUrlInput(e.target.value); setUrlError(''); }}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button onClick={handleUrlParse} className="px-4 py-2 bg-gray-600 text-white text-sm font-semibold rounded-md hover:bg-gray-700">Set</button>
                                </div>
                                {urlError && <p className="text-red-500 text-xs mt-1 px-1">{urlError}</p>}
                            </div>
                            <div className="mt-2 border-t pt-2 max-h-32 overflow-y-auto">
                                <div className="text-center mb-2">
                                    <button onClick={searchNearby} disabled={isSearching} className="w-full px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded-md hover:bg-blue-600 disabled:bg-blue-300">
                                        {isSearching ? 'Searching...' : 'Search This Area'}
                                    </button>
                                </div>
                                {isSearching && <p className="text-sm text-gray-500 text-center">Loading places...</p>}
                                {!isSearching && nearbyPlaces.length > 0 && (
                                    <ul className="space-y-1">
                                        {nearbyPlaces.map(place => (
                                            <li key={place.place_id} onClick={() => handlePlaceSelect(place)} className="p-2 rounded-md hover:bg-gray-200 cursor-pointer">
                                                <p className="font-semibold text-sm text-gray-800">{place.name}</p>
                                                <p className="text-xs text-gray-600">{place.vicinity}</p>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                 {!isSearching && nearbyPlaces.length === 0 && (
                                     <p className="text-sm text-gray-500 text-center">No places found. Try moving the map.</p>
                                 )}
                            </div>
                        </div>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
                        <div className="bg-white/90 backdrop-blur-sm p-4 rounded-lg shadow-lg space-y-4">
                            <div className="flex items-center space-x-3">
                                 <label htmlFor="radius" className="text-sm font-medium text-gray-700">Radius:</label>
                                 <input
                                    id="radius"
                                    type="range"
                                    min="25" max="500" step="25"
                                    value={radius}
                                    onChange={(e) => setRadius(Number(e.target.value))}
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                 />
                                <span className="font-mono text-sm text-gray-800 w-20 text-center">{radius}m</span>
                            </div>
                             <div className="flex space-x-2">
                                <button onClick={onCancel} className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300">Cancel</button>
                                <button onClick={handleSave} className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700">Save Location</button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default MapPicker;
