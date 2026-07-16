import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TeamSchema = z.object({
  position: z.number().int().min(1).max(20),
  team_name: z.string().optional().default(""),
  players: z.array(z.string()).default([]),
  kills: z.array(z.number().int().min(0)).default([]),
  totalKills: z.number().int().min(0).default(0),
});

const ResultSchema = z.object({
  teams: z.array(TeamSchema),
});

export type OcrTeam = z.infer<typeof TeamSchema>;
export type OcrResult = z.infer<typeof ResultSchema>;

const SYSTEM_PROMPT = `You are a Gemini Vision OCR engine specialized in Free Fire tournament result screenshots.
Extract every team visible across the provided screenshots.

Return JSON ONLY (no prose, no markdown) matching this EXACT shape:
{
  "teams": [
    {
      "position": 1,
      "team_name": "SLC",
      "players": ["SLC PANDASR", "SLC RANIYASR", "SLC Mr.Sani", "SLC THARuuSR"],
      "kills": [5, 5, 5, 6],
      "totalKills": 21
    }
  ]
}

Rules:
- position = team finishing rank (1 = best / WWCD).
- players = array of in-game names (IGNs) in display order.
- kills = array of individual eliminations, SAME order and SAME length as players.
- totalKills = sum of the team's eliminations as shown on screen.
- team_name = the team tag/clan shown (e.g. "SLC"). Empty string if none visible.
- If the same team appears in multiple screenshots, merge into ONE entry (do not duplicate).
- Use the exact text from the screenshot. Do not invent players or teams.`;

export const extractMatchFromScreenshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    return z.object({
      images: z.array(z.object({
        data_url: z.string().startsWith("data:image/"),
      })).min(1).max(4),
      participants: z.array(z.object({
        name: z.string(),
        short_name: z.string().optional().default(""),
      })).optional().default([]),
    }).parse(input);
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const rosterHint = data.participants.length > 0
      ? `\n\nREGISTERED TEAMS in this tournament (map every visible squad to one of these — prefer the TAG when it appears in player IGNs like "SLC PANDASR"):\n${data.participants.map((p, i) => `${i + 1}. ${p.name}${p.short_name ? ` (tag: ${p.short_name})` : ""}`).join("\n")}\nWhen you output "team_name", use the exact TAG from this list whenever you can identify the squad.`
      : "";

    const content: Array<Record<string, unknown>> = [
      { type: "text", text: `Extract all Free Fire match results from these screenshots. Return JSON only matching the specified schema.${rosterHint}` },
      ...data.images.map(img => ({ type: "image_url", image_url: { url: img.data_url } })),
    ];

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      if (resp.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
      if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in Lovable workspace settings.");
      throw new Error(`Gemini OCR failed (${resp.status}): ${txt.slice(0, 200)}`);
    }

    const body = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { teams: [] };
    }

    // Normalize: pad/truncate kills array to match players length, recompute totalKills if missing
    const safe = ResultSchema.safeParse(parsed);
    if (!safe.success) return { teams: [] as OcrTeam[] };

    const teams = safe.data.teams.map(t => {
      const players = t.players;
      const kills = players.map((_, i) => t.kills[i] ?? 0);
      const totalKills = t.totalKills || kills.reduce((a, b) => a + b, 0);
      return { ...t, players, kills, totalKills };
    });

    // Dedupe: same team can appear in multiple screenshots. Merge by normalized
    // team_name (falling back to a player-overlap signature) so we never emit
    // two entries for one squad.
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const playerKey = (s: string) => {
      const parts = s.trim().split(/\s+/);
      if (parts.length > 1 && parts[0].length <= 5) parts.shift();
      return norm(parts.join(""));
    };
    const merged = new Map<string, typeof teams[number]>();
    for (const t of teams) {
      const nameKey = norm(t.team_name);
      let key = nameKey;
      if (!key) {
        // no team tag — try to find an existing group sharing 2+ players
        const incoming = new Set(t.players.map(playerKey).filter(Boolean));
        for (const [k, existing] of merged) {
          const roster = new Set(existing.players.map(playerKey).filter(Boolean));
          let overlap = 0;
          for (const p of incoming) if (roster.has(p)) overlap++;
          if (overlap >= 2) { key = k; break; }
        }
        if (!key) key = `pos:${t.position}:${t.players[0] ?? ""}`;
      }
      const prev = merged.get(key);
      if (!prev) { merged.set(key, t); continue; }
      // merge into prev: keep best (lowest) position, union players+kills, sum totalKills sensibly
      const seen = new Map<string, { name: string; kills: number }>();
      for (let i = 0; i < prev.players.length; i++) {
        const k = playerKey(prev.players[i]);
        if (k) seen.set(k, { name: prev.players[i], kills: prev.kills[i] ?? 0 });
      }
      for (let i = 0; i < t.players.length; i++) {
        const k = playerKey(t.players[i]);
        if (!k) continue;
        const existing = seen.get(k);
        const kills = t.kills[i] ?? 0;
        if (existing) existing.kills = Math.max(existing.kills, kills);
        else seen.set(k, { name: t.players[i], kills });
      }
      const mergedPlayers = Array.from(seen.values());
      merged.set(key, {
        position: Math.min(prev.position, t.position),
        team_name: prev.team_name || t.team_name,
        players: mergedPlayers.map(p => p.name),
        kills: mergedPlayers.map(p => p.kills),
        totalKills: Math.max(prev.totalKills, t.totalKills, mergedPlayers.reduce((a, b) => a + b.kills, 0)),
      });
    }

    const deduped = Array.from(merged.values()).sort((a, b) => a.position - b.position);
    return { teams: deduped };
  });
