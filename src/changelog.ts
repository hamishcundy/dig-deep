// Notes for the What's New panel, newest first. Every update players would
// notice gets an entry here, with the next id, as part of shipping it.

export interface Release {
  id: number;
  title: string;
  notes: string[];
}

export const RELEASES: Release[] = [
  {
    id: 3,
    title: 'Gorlab',
    notes: ['Something sleeps at the bottom of the world, 600 m down. Bring dynamite and a repair kit.'],
  },
  {
    id: 2,
    title: 'October 2026, update 2',
    notes: ['Earthquakes now start once you have been 100 m down.'],
  },
  {
    id: 1,
    title: 'October 2026',
    notes: [
      'Items: reserve fuel, repair kit, dynamite, teleport and landing thrusters. Buy them at the repair shop.',
      'Item slots: start with 1, buy more in the shop.',
      'Earthquakes: once you have been 100 m down, leaving a building can shift the tunnels.',
      'Fuel gauge: the tick shows the fuel you need to get home.',
      'New ore and rock art, and sound.',
      'Install it to your home screen from the title screen.',
    ],
  },
];

const SEEN_KEY = 'digdeep-seen'; // id of the newest release this browser has shown

// Releases this player hasn't seen yet. A new player sees none, since the whole
// game is new to them. A player from before the panel existed sees the latest.
export function unseenReleases(returning: boolean): Release[] {
  let seen: number | null = null;
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    seen = raw === null ? null : Number(raw);
  } catch {
    return []; // no storage: don't nag every load
  }
  if (seen === null || Number.isNaN(seen)) return returning ? RELEASES.slice(0, 1) : [];
  return RELEASES.filter((r) => r.id > seen);
}

export function markReleasesSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, String(RELEASES[0].id));
  } catch {
    // shown again next time; harmless
  }
}
