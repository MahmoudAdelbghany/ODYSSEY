/** Shared clock for the landing "spawn" effect: sites light at 3 per second, hold, then restart. */
export function spawnCount(total: number) {
  const t = performance.now() / 1000;
  return Math.floor(t * 3) % (total + 9);
}
