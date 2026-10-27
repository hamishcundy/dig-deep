import { PodStats } from './PodStats';

// Progress lives in this browser's localStorage: the last surface stop, the
// same point a lost pod rolls back to. Any problem reading it means no save.

const KEY = 'digdeep-save';
const VERSION = 1;

export interface SaveData {
  seed: number;
  cells: Uint8Array;
  stats: PodStats;
  col: number;
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (o.v !== VERSION) return null;
    const stats = new PodStats();
    stats.money = o.stats.money;
    stats.fuel = o.stats.fuel;
    stats.hull = o.stats.hull;
    stats.cargo = o.stats.cargo;
    stats.levels = { ...stats.levels, ...o.stats.levels };
    return { seed: o.seed, cells: fromBase64(o.cells), stats, col: o.col };
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData): void {
  const { money, fuel, hull, cargo, levels } = data.stats;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: VERSION, seed: data.seed, cells: toBase64(data.cells), stats: { money, fuel, hull, cargo, levels }, col: data.col }),
    );
  } catch {
    // storage full or blocked (e.g. private browsing): play on without saving
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}
