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

/** Strip common clan tag prefixes from a player IGN: "SLC PANDASR" -> "pandasr". */
export function normalizePlayer(s: string) {
  const cleaned = s.replace(/[\[\]【】()<>|•·]/g, " ").trim();
  // remove leading short tag like "SLC " / "TG " / "[SLC]"
  const parts = cleaned.split(/\s+/);
  if (parts.length > 1 && parts[0].length <= 5) parts.shift();
  return normalize(parts.join(""));
}

export type TeamLike = {
  id?: string;
  name: string;
  aliases?: string[] | null;
  players?: string[] | null;
};

/** Legacy name-only matcher (kept for places that don't have a player list). */
export function matchTeam<T extends TeamLike>(rawName: string, teams: T[]): T | null {
  const n = normalize(rawName);
  if (!n) return null;
  for (const t of teams) {
    if (normalize(t.name) === n) return t;
    if (t.aliases?.some(a => normalize(a) === n)) return t;
  }
  for (const t of teams) {
    const tn = normalize(t.name);
    if (tn.length >= 3 && (n.includes(tn) || tn.includes(n))) return t;
  }
  return null;
}

export type MatchResult<T> = {
  team: T;
  confidence: number;   // 0..1
  matchedPlayers: number;
  reason: "name" | "players" | "mixed";
} | null;

/**
 * Match a team using BOTH the extracted team name/tag and the extracted players.
 * Confidence rules:
 *  - exact name / alias match → 1.0
 *  - ≥2 player matches → matchedPlayers / max(extracted, roster) (capped at 0.95)
 *  - name partial match adds +0.15 bonus
 */
export function matchTeamByPlayers<T extends TeamLike>(
  rawName: string,
  players: string[],
  teams: T[],
): MatchResult<T> {
  if (teams.length === 0) return null;
  const nName = normalize(rawName);
  const extractedKeys = new Set(players.map(normalizePlayer).filter(Boolean));

  let best: MatchResult<T> = null;

  for (const t of teams) {
    const tn = normalize(t.name);
    const nameExact = nName && (tn === nName || t.aliases?.some(a => normalize(a) === nName));
    const namePartial = !nameExact && nName && tn.length >= 3 && (nName.includes(tn) || tn.includes(nName));

    const roster = new Set((t.players ?? []).map(normalizePlayer).filter(Boolean));
    let matched = 0;
    for (const k of extractedKeys) if (roster.has(k)) matched++;

    let confidence = 0;
    let reason: "name" | "players" | "mixed" = "players";

    if (nameExact) {
      confidence = 1;
      reason = matched > 0 ? "mixed" : "name";
    } else if (matched >= 2) {
      const denom = Math.max(extractedKeys.size, roster.size, 1);
      confidence = Math.min(0.95, matched / denom);
      if (namePartial) confidence = Math.min(0.97, confidence + 0.15);
      reason = namePartial ? "mixed" : "players";
    } else if (namePartial && matched >= 1) {
      confidence = 0.6;
      reason = "mixed";
    } else if (namePartial) {
      confidence = 0.45;
      reason = "name";
    } else {
      continue;
    }

    if (!best || confidence > best.confidence) {
      best = { team: t, confidence, matchedPlayers: matched, reason };
    }
  }

  return best;
}

/** Merge new player IGNs into an existing roster, deduping case-insensitively. */
export function mergePlayers(existing: string[] | null | undefined, incoming: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of [...(existing ?? []), ...incoming]) {
    const k = normalizePlayer(p);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}
