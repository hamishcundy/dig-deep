// All tuning numbers live here. Distances are in tiles, times in seconds,
// unless the name says otherwise.

export const TILE = 32; // px per tile

export const WORLD = {
  width: 36, // tiles across
  depth: 300, // diggable rows below the surface
  skyRows: 8, // open rows above the surface
};

export const VIEW = {
  minTilesAcross: 11, // tiles visible across the shorter screen side
};

export const METRES_PER_TILE = 2;

export const POD = {
  width: 0.8,
  height: 0.75,
};

export const PHYSICS = {
  gravity: 14, // tiles/s²
  thrust: 28, // tiles/s², upward, applied against gravity
  maxRise: 8, // tiles/s
  maxFall: 16, // tiles/s
  accel: 28, // tiles/s², horizontal
  maxSpeedX: 6, // tiles/s
  groundFriction: 24, // tiles/s², slowdown with no input on the ground
  airDrag: 3, // tiles/s², slowdown with no input in the air
  cornerNudge: 0.5, // tiles; how far the pod slides to line up with a shaft above
  cornerNudgeSpeed: 6, // tiles/s
  fullCargoThrustPenalty: 0.3, // thrust lost with a full cargo bay (0.3 = 30%), scaled by how full it is
};

export type UpgradeKey = 'drill' | 'hull' | 'engine' | 'fuel' | 'cargo';

export interface UpgradeDef {
  name: string;
  values: number[]; // [stock, level 1, level 2, ...]
  format: (v: number) => string;
}

// Price of each level, shared by every upgrade.
export const UPGRADE_PRICES = [500, 2500, 10000, 40000];

export const UPGRADES: Record<UpgradeKey, UpgradeDef> = {
  drill: { name: 'Drill', values: [1, 1.4, 1.9, 2.6, 3.5], format: (v) => `x${v}` }, // drill speed multiplier
  hull: { name: 'Hull', values: [10, 15, 22, 32, 45], format: (v) => `${v}` }, // max hull
  engine: { name: 'Engine', values: [1, 1.12, 1.25, 1.4, 1.55], format: (v) => `${Math.round(v * 100)}%` }, // thrust and top speed
  fuel: { name: 'Fuel', values: [10, 15, 22, 32, 45], format: (v) => `${v}L` }, // tank litres
  cargo: { name: 'Cargo', values: [10, 15, 22, 32, 45], format: (v) => `${v}` }, // items
};

export const FUEL = {
  idle: 0.06, // litres/s, always while the engine runs
  thrust: 0.12, // extra litres/s while thrusting
  drill: 0.15, // extra litres/s while drilling
  lowWarning: 0.25, // share of the tank where the gauge turns red
};

export const FALL = {
  safeSpeed: 8, // tiles/s; landing slower than this does no damage
  damagePerSpeed: 0.8, // hull lost per tile/s above safeSpeed
};

export const ECONOMY = {
  startMoney: 20,
  fuelPrice: 2, // $ per litre
  repairPrice: 10, // $ per hull point
};

export type BuildingKind = 'fuel' | 'sell' | 'repair' | 'shop';

export interface BuildingDef {
  kind: BuildingKind;
  label: string;
  col: number; // leftmost column
  width: number; // columns
  color: number;
}

// Buildings sit on concrete pads on the surface; drive onto a pad to use one.
export const BUILDINGS: BuildingDef[] = [
  { kind: 'fuel', label: 'FUEL', col: 3, width: 4, color: 0xc0392b },
  { kind: 'sell', label: 'SELL', col: 10, width: 4, color: 0x2e86c1 },
  { kind: 'repair', label: 'REPAIR', col: 24, width: 4, color: 0x27ae60 },
  { kind: 'shop', label: 'SHOP', col: 30, width: 4, color: 0x8e44ad },
];

export const SPAWN_COL = 18;

export const DRILL = {
  baseTime: 0.35, // seconds to drill one dirt tile at the surface
  depthHardness: 1 / 150, // +100% drill time every 150 rows
  oreTimeFactor: 1.2,
};

export interface OreDef {
  name: string;
  price: number;
  minDepth: number; // rows below the surface
  weight: number; // relative spawn weight once unlocked
  color: number;
}

export const ORES: OreDef[] = [
  { name: 'Copper', price: 30, minDepth: 1, weight: 10, color: 0xc87533 },
  { name: 'Iron', price: 60, minDepth: 10, weight: 8, color: 0xa9a29a },
  { name: 'Silver', price: 100, minDepth: 30, weight: 6, color: 0xe8eef2 },
  { name: 'Gold', price: 250, minDepth: 60, weight: 5, color: 0xffcf33 },
  { name: 'Platinum', price: 750, minDepth: 100, weight: 4, color: 0xa8e6ff },
  { name: 'Emerald', price: 2000, minDepth: 150, weight: 3, color: 0x2ecc71 },
  { name: 'Ruby', price: 5000, minDepth: 200, weight: 2, color: 0xe0115f },
  { name: 'Diamond', price: 20000, minDepth: 250, weight: 1, color: 0xf4fdff },
];

export const GEN = {
  oreChance: 0.09, // chance a dirt tile holds ore
  boulderStartDepth: 15,
  boulderChanceMax: 0.06,
  boulderRampDepth: 200, // depth where boulder chance reaches its max
};
