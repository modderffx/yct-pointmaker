export type PlacementMap = Record<string, number>;

export const DEFAULT_PLACEMENT: PlacementMap = {
  "1": 12, "2": 9, "3": 8, "4": 7, "5": 6, "6": 5,
  "7": 4, "8": 3, "9": 2, "10": 1, "11": 0, "12": 0,
};

export function calcPoints(placement: number, kills: number, map: PlacementMap, killValue = 1) {
  const placement_points = map[String(placement)] ?? 0;
  const kill_points = Math.max(0, kills) * killValue;
  return { placement_points, kill_points, total_points: placement_points + kill_points };
}

export function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

export function matchTeam<T extends { name: string; aliases?: string[] | null }>(rawName: string, teams: T[]): T | null {
  const n = normalize(rawName);
  if (!n) return null;
  for (const t of teams) {
    if (normalize(t.name) === n) return t;
    if (t.aliases?.some(a => normalize(a) === n)) return t;
  }
  // partial contains
  for (const t of teams) {
    const tn = normalize(t.name);
    if (tn.length >= 3 && (n.includes(tn) || tn.includes(n))) return t;
  }
  return null;
}
