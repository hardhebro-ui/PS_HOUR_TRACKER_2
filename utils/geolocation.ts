
import { LatLng } from '../types';

/**
 * Calculates the distance between two geographic coordinates using the Haversine formula.
 * @param point1 - The first point, with latitude and longitude.
 * @param point2 - The second point, with latitude and longitude.
 * @returns The distance in meters.
 */
export function getDistance(point1: LatLng, point2: LatLng): number {
    if (!point1 || !point2) return Infinity;

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
