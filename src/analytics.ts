// Anonymous play stats, sent to PostHog (US). No names, emails or fingerprinting:
// just a random player id kept in this browser. Players can turn it off from the
// pause menu. Only the live site sends; dev builds log to the console instead.
// Events wait in localStorage and go in batches, so offline play loses nothing.
import { RELEASES } from './changelog';
import { METRES_PER_TILE, SKY } from './config';
import type { PodStats } from './game/PodStats';
import type { Progress } from './game/progress';

// PostHog project key: public by design (it can only send events), so it is safe in this repo.
// Empty sends nothing.
const KEY = '';
const HOST = 'https://us.i.posthog.com';
const LIVE_HOST = 'hamishcundy.github.io';

const ID_KEY = 'digdeep-player';
const OFF_KEY = 'digdeep-stats-off'; // '1' off, '0' turned back on
const TESTER_KEY = 'digdeep-tester'; // set with ?tester, cleared with ?tester=0: tags the owner's and testers' play
const FORCE_KEY = 'digdeep-stats-force'; // '1' sends from any host (as a tester), for checking a local build
const QUEUE_KEY = 'digdeep-events';
const MARKS_KEY = 'digdeep-stats-marks'; // depth and height milestones already sent, per world

const MAX_QUEUE = 300; // oldest dropped first
const BATCH = 50;
const FLUSH_MS = 30_000;
const NEW_SESSION_MS = 30 * 60_000; // away this long and coming back starts a new session
const STEP_M = 50; // depth and height milestones

// Sent with these events: the player's current save state, kept on their PostHog person.
const SNAPSHOT_EVENTS = new Set(['session_start', 'trip_end', 'session_end', 'new_game']);
// The page is about to go away: send straight away.
const LEAVING_EVENTS = new Set(['session_end', 'new_game']);

interface QueuedEvent {
  event: string;
  uuid: string;
  timestamp: string;
  properties: Record<string, unknown>;
}

type Props = Record<string, unknown>;

// What the game hands over for the snapshot.
export interface GameState {
  stats: PodStats;
  progress: Progress;
  screen: string; // title, play, menu or dead
}

let queue: QueuedEvent[] = [];
let playerId = '';
let sessionId = '';
let tester = false;
let sending = false;
let hiddenAt = 0;
let stateSource: (() => GameState) | null = null;
let marks = { seed: -1, depth: 0, height: 0 };
let tripDeepest = 0;
let tripHighest = 0;
let sessionStart = Date.now();

const live = import.meta.env.PROD && (location.hostname === LIVE_HOST || read(FORCE_KEY) === '1');

export function initAnalytics(): void {
  playerId = read(ID_KEY) ?? '';
  if (!playerId) {
    playerId = uuid();
    write(ID_KEY, playerId);
  }
  const t = new URLSearchParams(location.search).get('tester');
  if (t !== null) write(TESTER_KEY, t === '0' ? null : '1');
  tester = read(TESTER_KEY) === '1' || read(FORCE_KEY) === '1';
  sessionId = uuid();
  try {
    queue = JSON.parse(read(QUEUE_KEY) ?? '[]');
    marks = { ...marks, ...JSON.parse(read(MARKS_KEY) ?? '{}') };
  } catch {
    queue = [];
  }

  // Registered before Phaser's own listener, so the snapshot still shows the screen the player left on.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      track('session_end', { seconds: Math.round((hiddenAt - sessionStart) / 1000) });
    } else if (hiddenAt && Date.now() - hiddenAt > NEW_SESSION_MS) {
      sessionId = uuid();
      sessionStart = Date.now();
      track('session_start', { resumed: true, returned: true });
    }
  });
  window.addEventListener('online', () => flush());
  setInterval(() => flush(), FLUSH_MS);
  flush();
}

export function statsOn(): boolean {
  const off = read(OFF_KEY);
  if (off !== null) return off !== '1';
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl !== true;
}

export function setStatsOn(on: boolean): void {
  write(OFF_KEY, on ? '0' : '1');
  if (!on) {
    queue = [];
    write(QUEUE_KEY, null);
  }
}

// The game hands over a way to read the player's current state.
export function setStateSource(fn: () => GameState): void {
  stateSource = fn;
}

// Flat, so each value is its own column on the player's PostHog page.
function snapshot({ stats, progress }: GameState): Props {
  const levels = Object.fromEntries(Object.entries(stats.levels).map(([k, v]) => [`up_${k}`, v]));
  return {
    money: Math.round(stats.money),
    ...levels,
    items: stats.items.join(' '),
    deepest_m: stats.deepest * METRES_PER_TILE,
    gorlab_hits: progress.gorlabHits,
    gorlab_defeated: progress.gorlabDefeated,
    play_minutes: Math.round(progress.playTime / 60),
    trips: progress.trips,
    deaths: progress.deaths,
    seed: progress.seed,
    release: RELEASES[0].id,
  };
}

export function track(event: string, props: Props = {}): void {
  if (event === 'death') tripDeepest = tripHighest = 0; // the pod restarts from the surface: that trip is over
  if (!statsOn()) return;
  const properties: Props = {
    distinct_id: playerId,
    session: sessionId,
    release: RELEASES[0].id,
    touch: navigator.maxTouchPoints > 0,
    installed: matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches,
    ...(tester ? { tester: true } : {}),
    ...props,
  };
  if (SNAPSHOT_EVENTS.has(event) && stateSource) {
    const state = stateSource();
    properties.screen = state.screen;
    properties.$set = snapshot(state);
  }
  if (!live) {
    if (import.meta.env.DEV) console.debug('[stats]', event, properties);
    return;
  }
  queue.push({ event, uuid: uuid(), timestamp: new Date().toISOString(), properties });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  write(QUEUE_KEY, JSON.stringify(queue));
  if (event === 'trip_end') flush();
  if (LEAVING_EVENTS.has(event)) flush(true);
}

// Called every frame with the pod's depth in metres (negative is above the surface).
// Sends a milestone the first time each world passes every STEP_M down or up.
export function position(seed: number, metres: number): void {
  tripDeepest = Math.max(tripDeepest, metres);
  tripHighest = Math.max(tripHighest, -metres);
  if (marks.seed !== seed) marks = { seed, depth: 0, height: 0 };
  const down = Math.floor(metres / STEP_M) * STEP_M;
  const up = Math.floor(-metres / STEP_M) * STEP_M;
  if (down > marks.depth) {
    marks.depth = down;
    track('depth_reached', { metres: down });
  } else if (up > marks.height) {
    marks.height = up;
    track('height_reached', { metres: up });
  } else return;
  write(MARKS_KEY, JSON.stringify(marks));
}

// The pod is back on the surface. Counts as a trip if it went underground or up into the sky.
export function surfaceStop(props: Props): void {
  if (tripDeepest > 0 || tripHighest > SKY.lockedRows * METRES_PER_TILE) {
    track('trip_end', { ...props, trip_deepest_m: Math.round(tripDeepest), trip_highest_m: Math.round(tripHighest) });
  }
  tripDeepest = 0;
  tripHighest = 0;
}

function flush(leaving = false): void {
  if (!live || !KEY || sending || !queue.length || !navigator.onLine) return;
  const batch = queue.slice(0, BATCH);
  sending = true;
  // text/plain keeps it a simple request (no CORS preflight), which keepalive needs on the way out.
  fetch(`${HOST}/batch/`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ api_key: KEY, sent_at: new Date().toISOString(), batch }),
    keepalive: leaving,
  })
    .then((res) => {
      // Sent, or refused for good (a retry won't fix a 4xx): either way, done with these.
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        const sent = new Set(batch.map((e) => e.uuid));
        queue = queue.filter((e) => !sent.has(e.uuid));
        write(QUEUE_KEY, JSON.stringify(queue));
      }
    })
    .catch(() => {
      // offline or blocked: try again later (PostHog drops repeats by uuid)
    })
    .finally(() => {
      sending = false;
    });
}

function uuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage full or blocked: stats are optional
  }
}
