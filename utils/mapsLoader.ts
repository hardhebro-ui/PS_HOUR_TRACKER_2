
import { googleMapsApiKey } from "../config";

const GOOGLE_MAPS_CALLBACK_NAME = 'initMapCallback';
let scriptPromise: Promise<void> | null = null;

export const loadGoogleMapsScript = (): Promise<void> => {
    if ((window as any).google && (window as any).google.maps) {
        return Promise.resolve();
    }

    if (scriptPromise) {
        return scriptPromise;
    }
    
    const apiKey = googleMapsApiKey;
    if (!apiKey) {
        console.error("Google Maps API key is not available.");
        return Promise.reject(new Error("Missing Google Maps API Key"));
    }

    scriptPromise = new Promise((resolve, reject) => {
        (window as any)[GOOGLE_MAPS_CALLBACK_NAME] = () => {
            scriptPromise = null;
            delete (window as any)[GOOGLE_MAPS_CALLBACK_NAME];
            resolve();
        };

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=${GOOGLE_MAPS_CALLBACK_NAME}`;
        script.async = true;
        script.defer = true;
        
        script.onerror = (error) => {
            scriptPromise = null;
            delete (window as any)[GOOGLE_MAPS_CALLBACK_NAME];
            reject(error);
        };

        document.head.appendChild(script);
    });

    return scriptPromise;
};
