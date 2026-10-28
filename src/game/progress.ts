// Progress for one world that survives losing the pod (unlike the surface save,
// which rolls back): Gorlab's wounds, and totals for the ending screen.

const KEY = 'digdeep-progress';

export interface Progress {
  seed: number;
  gorlabHits: number;
  gorlabDefeated: boolean;
  playTime: number; // seconds
  trips: number; // returns to the surface from underground
  deaths: number;
}

export function loadProgress(seed: number): Progress {
  const fresh: Progress = { seed, gorlabHits: 0, gorlabDefeated: false, playTime: 0, trips: 0, deaths: 0 };
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return o && o.seed === seed ? { ...fresh, ...o } : fresh;
  } catch {
    return fresh;
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage full or blocked: carry on without it
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
