import { ECONOMY, ORES, STATS } from '../config';

// Money, fuel, hull and cargo, plus the surface services that change them.
export class PodStats {
  money = ECONOMY.startMoney;
  fuel = STATS.fuelCapacity;
  hull = STATS.maxHull;
  cargo: number[] = ORES.map(() => 0); // count per ore

  get fuelCapacity(): number {
    return STATS.fuelCapacity;
  }

  get maxHull(): number {
    return STATS.maxHull;
  }

  get cargoCapacity(): number {
    return STATS.cargoCapacity;
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

  sellAll(): number {
    const value = this.cargoValue;
    this.money += value;
    this.cargo.fill(0);
    return value;
  }

  clone(): PodStats {
    const copy = new PodStats();
    copy.money = this.money;
    copy.fuel = this.fuel;
    copy.hull = this.hull;
    copy.cargo = [...this.cargo];
    return copy;
  }
}
