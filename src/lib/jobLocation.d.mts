export type WorkMode = 'remote' | 'hybrid' | 'onsite';
export function locationWorkMode(raw?: string | null): WorkMode | null;
export function canonicalLocation(raw?: string | null): string;
export function normalizeLocationCounts(groups: Array<{ location: string; roles: number }>): Array<{ location: string; roles: number }>;
