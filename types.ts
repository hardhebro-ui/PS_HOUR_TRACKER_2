
export interface User {
    mobile: string;
    name: string;
}

export type PlusCode = string;

export interface ShopLocation {
    plusCode: PlusCode;
    radius: number;
}

export interface UserSettings {
    shopLocation: ShopLocation | null;
    hourlyRate: number;
}

export interface ShopSession {
    id: string;
    startTime: number;
    endTime?: number;
    durationMs?: number;
    date: string; // YYYY-MM-DD
}

export interface TripSession {
    id: string;
    startTime: number;
    endTime?: number;
    durationMs?: number;
    date: string; // YYYY-MM-DD
    path: PlusCode[];
    isPending?: boolean;
}

export enum TrackingStatus {
    IDLE = 'IDLE',
    IN_SHOP = 'IN_SHOP',
    ON_TRIP = 'ON_TRIP',
    DISABLED = 'DISABLED', // Shop location not set
    OFF_HOURS = 'OFF_HOURS'
}