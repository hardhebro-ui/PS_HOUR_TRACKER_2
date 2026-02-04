
import { WORK_START_HOUR, WORK_END_HOUR } from '../constants';

export function formatDuration(milliseconds: number): string {
    if (milliseconds < 0) milliseconds = 0;
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function isWithinWorkingHours(date: Date): boolean {
    const hour = date.getHours();
    return hour >= WORK_START_HOUR && hour < WORK_END_HOUR;
}

export function getTodaysDateString(): string {
    return new Date().toISOString().split('T')[0];
}
