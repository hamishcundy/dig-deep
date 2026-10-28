import { ECONOMY, ITEM_REFILL_MARKUP, ITEMS, ORES, UPGRADE_PRICES, UPGRADES, type ItemKey, type UpgradeKey } from '../config';

// Money, fuel, hull, cargo, items and upgrade levels, plus the surface services that change them.
export class PodStats {
  levels: Record<UpgradeKey, number> = { drill: 0, hull: 0, engine: 0, fuel: 0, cargo: 0, slots: 0 };
  money = ECONOMY.startMoney;
  earned = 0; // lifetime sales; earthquakes start once this is high enough
  fuel = this.value('fuel');
  hull = this.value('hull');
  cargo: number[] = ORES.map(() => 0); // count per ore
  items: ItemKey[] = []; // one per slot, in the order bought

  value(key: UpgradeKey, level = this.levels[key]): number {
    return UPGRADES[key].values[level];
  }

  get fuelCapacity(): number {
    return this.value('fuel');
  }

  get maxHull(): number {
    return this.value('hull');
  }

  get cargoCapacity(): number {
    return this.value('cargo');
  }

  get drillSpeed(): number {
    return this.value('drill');
  }

  get enginePower(): number {
    return this.value('engine');
  }

  // Price of the next level, or null when maxed.
  upgradePrice(key: UpgradeKey): number | null {
    return UPGRADE_PRICES[this.levels[key]] ?? null;
  }

  buyUpgrade(key: UpgradeKey): boolean {
    const price = this.upgradePrice(key);
    if (price === null || price > this.money) return false;
    this.money -= price;
    this.levels[key]++;
    // A new hull or tank comes repaired or full.
    if (key === 'hull') this.hull = this.maxHull;
    if (key === 'fuel') this.fuel = this.fuelCapacity;
    return true;
  }

  get cargoCount(): number {
    return this.cargo.reduce((a, b) => a + b, 0);
  }

  get cargoValue(): number {
    return this.cargo.reduce((sum, n, i) => sum + n * ORES[i].price, 0);
  }

  get cargoFull(): boolean {
    return this.cargoCount >= this.cargoCapacity;
  }

  // Cost to fill the tank, and what the player can actually afford.
  fuelQuote(): { litres: number; cost: number } {
    const litres = Math.min(this.fuelCapacity - this.fuel, this.money / ECONOMY.fuelPrice);
    return { litres, cost: Math.ceil(litres * ECONOMY.fuelPrice) };
  }

  buyFuel(): void {
    const { litres, cost } = this.fuelQuote();
    this.fuel += litres;
    this.money -= Math.min(cost, this.money);
  }

  repairQuote(): { points: number; cost: number } {
    const points = Math.min(this.maxHull - this.hull, this.money / ECONOMY.repairPrice);
    return { points, cost: Math.ceil(points * ECONOMY.repairPrice) };
  }

  repair(): void {
    const { points, cost } = this.repairQuote();
    this.hull += points;
    this.money -= Math.min(cost, this.money);
  }

  itemPrice(key: ItemKey): number {
    if (key === 'fuel') return Math.ceil(this.fuelCapacity * ECONOMY.fuelPrice * ITEM_REFILL_MARKUP);
    if (key === 'repair') return Math.ceil(this.maxHull * ECONOMY.repairPrice * ITEM_REFILL_MARKUP);
    return ITEMS[key].price!;
  }

  get itemSlots(): number {
    return this.value('slots');
  }

  // An older save can hold more items than slots; they stay until used.
  get itemSlotsFull(): boolean {
    return this.items.length >= this.itemSlots;
  }

  buyItem(key: ItemKey): boolean {
    const price = this.itemPrice(key);
    if (this.itemSlotsFull || price > this.money) return false;
    this.money -= price;
    this.items.push(key);
    return true;
  }

  sellAll(): number {
    const value = this.cargoValue;
    this.money += value;
    this.earned += value;
    this.cargo.fill(0);
    return value;
  }

  clone(): PodStats {
    const copy = new PodStats();
    copy.levels = { ...this.levels };
    copy.money = this.money;
    copy.earned = this.earned;
    copy.fuel = this.fuel;
    copy.hull = this.hull;
    copy.cargo = [...this.cargo];
    copy.items = [...this.items];
    return copy;
  }
}
