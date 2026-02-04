
import OLC from 'open-location-code';

// Precision for Plus Codes (10 is standard, ~14x14m area)
const CODE_LENGTH = 10;

interface LatLng {
    lat: number;
    lng: number;
}

export function encode(lat: number, lng: number): string {
    return OLC.encode(lat, lng, CODE_LENGTH);
}

export function decode(plusCode: string): LatLng {
    const decoded = OLC.decode(plusCode);
    return { lat: decoded.latitudeCenter, lng: decoded.longitudeCenter };
}

// Calculates distance in meters between two plus codes.
export function getDistance(plusCode1: string, plusCode2: string): number {
    const point1 = decode(plusCode1);
    const point2 = decode(plusCode2);

    const R = 6371e3; // Earth's radius in metres
    const φ1 = point1.lat * Math.PI / 180;
    const φ2 = point2.lat * Math.PI / 180;
    const Δφ = (point2.lat - point1.lat) * Math.PI / 180;
    const Δλ = (point2.lng - point1.lng) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

export function isValid(plusCode: string): boolean {
    return OLC.isValid(plusCode);
}