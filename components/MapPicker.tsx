import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ShopLocation } from '../types';
import { encode, decode, isValid } from '../utils/plusCode';

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
    const idleTimeout = useRef<number | null>(null);

    const [currentPlusCode, setCurrentPlusCode] = useState(initialLocation?.plusCode || '');
    const [radius, setRadius] = useState(initialLocation?.radius || 50);
    const [nearbyPlaces, setNearbyPlaces] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);


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
        const request = {
            location: mapInstance.current.getCenter(),
            radius: 500, // Search within 500 meters of map center
        };

        placesService.current.nearbySearch(request, (results: any[], status: string) => {
            if (status === (window as any).google.maps.places.PlacesServiceStatus.OK && results) {
                setNearbyPlaces(results.slice(0, 5)); // Show top 5 results
            } else {
                setNearbyPlaces([]);
            }
            setIsSearching(false);
        });
    }, []);

    useEffect(() => {
        const initMap = () => {
            let initialCenter = { lat: 20.5937, lng: 78.9629 }; // Default to India center
            if (initialLocation && isValid(initialLocation.plusCode)) {
                const decoded = decode(initialLocation.plusCode);
                initialCenter = { lat: decoded.lat, lng: decoded.lng };
            }

            if (mapRef.current && !mapInstance.current) {
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
                         const newPlusCode = encode(newCenter.lat(), newCenter.lng());
                         setCurrentPlusCode(newPlusCode);
                         circleInstance.current?.setCenter(newCenter);
                    }
                });
                
                mapInstance.current.addListener('idle', () => {
                    if (idleTimeout.current) clearTimeout(idleTimeout.current);
                    idleTimeout.current = window.setTimeout(() => {
                         searchNearby();
                    }, 500); // Debounce search
                });

                searchNearby();
            }

            if (!initialLocation) {
                 panMapToCurrentLocation();
            }
        };

        if ((window as any).google && (window as any).google.maps.places) {
            initMap();
        } else {
            const interval = setInterval(() => {
                if ((window as any).google && (window as any).google.maps.places) {
                    clearInterval(interval);
                    initMap();
                }
            }, 100);
        }
        
        return () => {
            if (idleTimeout.current) clearTimeout(idleTimeout.current);
        }
    }, [initialLocation, panMapToCurrentLocation, searchNearby, radius]);

    useEffect(() => {
        circleInstance.current?.setRadius(radius);
    }, [radius]);
    
    const handleSave = () => {
        if(isValid(currentPlusCode)) {
            onSave({ plusCode: currentPlusCode, radius });
        }
    };

    const handlePlaceSelect = (place: any) => {
        if (place.geometry && place.geometry.location) {
            mapInstance.current?.setCenter(place.geometry.location);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-800">
            <div ref={mapRef} className="flex-grow w-full h-full" />
            
            {/* Center Marker */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-red-500 drop-shadow-lg">
                    <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75 0 5.385 4.365 9.75 9.75 9.75s9.75-4.365 9.75-9.75C21.75 6.615 17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
                </svg>
            </div>

            {/* Controls */}
            <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent">
                 <div className="bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-lg">
                    <p className="text-black text-center font-mono">{currentPlusCode || 'Move map to set location'}</p>
                    <div className="mt-2 border-t pt-2">
                        {isSearching && <p className="text-sm text-gray-500 text-center">Searching...</p>}
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
                             <p className="text-sm text-gray-500 text-center">No places found nearby.</p>
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
        </div>
    );
};

export default MapPicker;