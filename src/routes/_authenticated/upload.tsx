import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Sparkles, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { extractMatchFromScreenshots } from "@/lib/ocr.functions";
import { useServerFn } from "@tanstack/react-start";
import { calcPoints, DEFAULT_PLACEMENT, matchTeamByPlayers, mergePlayers, type PlacementMap } from "@/lib/scoring";
import { uploadTeamLogo } from "@/lib/teams";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({ meta: [{ title: "Upload Match — FireArena" }] }),
  component: UploadPage,
});

type ExtractedTeam = {
  position: number;
  team_name: string;
  players: string[];
  kills: number[];
  totalKills: number;
  matched_team_id: string | null;
  suggested_team_id?: string | null;
  suggested_team_name?: string;
  confidence?: number;        // 0..1, set when we have a suggestion
  matched_players?: number;   // how many IGNs overlapped
  needs_confirmation?: boolean; // 0.4..0.7
  new_team_name?: string;
  new_team_logo?: File | null;
};

function UploadPage() {
  const qc = useQueryClient();
  const runOcr = useServerFn(extractMatchFromScreenshots);
  const [files, setFiles] = useState<File[]>([]);
  const [matchName, setMatchName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedTeam[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? ""));
  }, []);

  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await supabase.from("teams").select("*").order("name")).data ?? [],
  });
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("user_settings").select("*").maybeSingle();
      return data;
    },
  });
  const placementMap = (settings.data?.placement_points as PlacementMap | null) ?? DEFAULT_PLACEMENT;
  const killValue = settings.data?.kill_point_value ?? 1;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list).slice(0, 4 - files.length);
    setFiles(prev => [...prev, ...arr]);
  }

  async function fileToDataUrl(f: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(f);
    });
  }

  async function handleProcess() {
    if (files.length < 1) { toast.error("Add at least one screenshot"); return; }
    if (!matchName.trim()) { toast.error("Enter a match name"); return; }
    setProcessing(true);
    try {
      const images = await Promise.all(files.map(async f => ({ data_url: await fileToDataUrl(f) })));
      const result = await runOcr({ data: { images } });
      if (!result.teams.length) {
        toast.error("Couldn't read any teams. Try clearer screenshots.");
        return;
      }
      const list = teams.data ?? [];
      const annotated: ExtractedTeam[] = result.teams
        .sort((a, b) => a.position - b.position)
        .map(t => {
          const label = t.team_name || t.players[0] || `Team #${t.position}`;
          const m = matchTeamByPlayers(label, t.players, list);
          const auto = m && m.confidence >= 0.7;
          const suggest = m && m.confidence >= 0.4 && m.confidence < 0.7;
          return {
            position: t.position,
            team_name: label,
            players: t.players,
            kills: t.kills,
            totalKills: t.totalKills,
            matched_team_id: auto ? m!.team.id ?? null : null,
            suggested_team_id: suggest ? m!.team.id ?? null : null,
            suggested_team_name: suggest ? m!.team.name : undefined,
            confidence: m?.confidence,
            matched_players: m?.matchedPlayers,
            needs_confirmation: !!suggest,
            new_team_name: auto || suggest ? undefined : label,
          };
        });
      setExtracted(annotated);
      const autoCount = annotated.filter(a => a.matched_team_id).length;
      toast.success(`Extracted ${annotated.length} teams · ${autoCount} auto-matched`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "OCR failed");
    } finally {
      setProcessing(false);
    }
  }

  async function handleSave() {
    if (!extracted) return;
    setSaving(true);
    try {
      const teamIdMap = new Map<number, string>();
      const list = teams.data ?? [];
      for (let i = 0; i < extracted.length; i++) {
        const t = extracted[i];
        if (t.needs_confirmation) {
          throw new Error(`Confirm or reject the suggested team for "${t.team_name}" first`);
        }
        if (t.matched_team_id) {
          teamIdMap.set(i, t.matched_team_id);
          // Merge any new players into the existing team roster + alias.
          const existing = list.find(x => x.id === t.matched_team_id);
          if (existing) {
            const mergedPlayers = mergePlayers(existing.players ?? [], t.players);
            const mergedAliases = mergePlayers(existing.aliases ?? [], [t.team_name]);
            if (
              mergedPlayers.length !== (existing.players?.length ?? 0) ||
              mergedAliases.length !== (existing.aliases?.length ?? 0)
            ) {
              await supabase.from("teams")
                .update({ players: mergedPlayers, aliases: mergedAliases })
                .eq("id", existing.id);
            }
          }
          continue;
        }
        if (!t.new_team_name?.trim()) throw new Error(`Provide a name for unrecognized team #${i + 1}`);
        let logoPath: string | null = null;
        if (t.new_team_logo) logoPath = await uploadTeamLogo(userId, t.new_team_logo);
        const { data: newTeam, error } = await supabase.from("teams").insert({
          user_id: userId,
          name: t.new_team_name.trim(),
          logo_url: logoPath,
          aliases: [t.team_name],
          players: t.players,
        }).select().single();
        if (error) throw error;
        teamIdMap.set(i, newTeam.id);
      }

      const screenshotPaths: string[] = [];
      for (const f of files) {
        const p = `${userId}/${crypto.randomUUID()}.${f.name.split(".").pop() || "png"}`;
        const { error } = await supabase.storage.from("match-screenshots").upload(p, f);
        if (error) throw error;
        screenshotPaths.push(p);
      }

      const { data: match, error: mErr } = await supabase.from("matches").insert({
        user_id: userId, name: matchName.trim(),
        screenshot_urls: screenshotPaths,
      }).select().single();
      if (mErr) throw mErr;

      const rows = extracted.map((t, i) => {
        const pts = calcPoints(t.position, t.totalKills, placementMap, killValue);
        const playersJson = t.players.map((name, idx) => ({ name, kills: t.kills[idx] ?? 0 }));
        return {
          user_id: userId,
          match_id: match.id,
          team_id: teamIdMap.get(i)!,
          team_name_raw: t.team_name,
          placement: t.position,
          kills: t.totalKills,
          placement_points: pts.placement_points,
          kill_points: pts.kill_points,
          total_points: pts.total_points,
          players: playersJson,
        };
      });
      const { error: rErr } = await supabase.from("match_results").insert(rows);
      if (rErr) throw rErr;

      toast.success("Match saved!");
      setFiles([]); setMatchName(""); setExtracted(null);
      qc.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Upload Match</h1>
        <p className="text-muted-foreground">Upload 1–2 screenshots. Gemini Vision will extract placements, kills, and players.</p>
      </div>

      {!extracted && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="mn">Match name</Label>
            <Input id="mn" value={matchName} onChange={e => setMatchName(e.target.value)} placeholder="e.g. Week 3 — Match 2 (Bermuda)" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {files.map((f, i) => (
              <div key={i} className="relative aspect-[9/16] rounded-lg border border-border overflow-hidden bg-muted">
                <img src={URL.createObjectURL(f)} alt={`Screenshot ${i+1}`} className="w-full h-full object-cover" />
                <button onClick={() => setFiles(prev => prev.filter((_,j)=>j!==i))} className="absolute top-1 right-1 bg-black/70 rounded-full p-1"><X className="w-3 h-3" /></button>
              </div>
            ))}
            {files.length < 4 && (
              <label className="aspect-[9/16] rounded-lg border-2 border-dashed border-border hover:border-gold flex flex-col items-center justify-center text-muted-foreground cursor-pointer">
                <Plus className="w-6 h-6 mb-1" />
                <span className="text-xs">Add screenshot</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={e => addFiles(e.target.files)} />
              </label>
            )}
          </div>

          <Button onClick={handleProcess} disabled={processing || files.length === 0} className="bg-gradient-gold text-gold-foreground font-semibold w-full md:w-auto">
            {processing ? <>Reading screenshots…</> : <><Sparkles className="w-4 h-4 mr-2" /> Extract with Gemini</>}
          </Button>
        </div>
      )}

      {extracted && (
        <ExtractedReview
          teams={extracted}
          setTeams={setExtracted}
          existing={teams.data ?? []}
          placementMap={placementMap}
          killValue={killValue}
          saving={saving}
          onSave={handleSave}
          onReset={() => setExtracted(null)}
        />
      )}
    </div>
  );
}

function ExtractedReview({
  teams, setTeams, existing, placementMap, killValue, saving, onSave, onReset,
}: {
  teams: ExtractedTeam[];
  setTeams: (t: ExtractedTeam[]) => void;
  existing: { id: string; name: string }[];
  placementMap: PlacementMap;
  killValue: number;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-semibold">Review extracted results</h2>
        <button onClick={onReset} className="text-sm text-muted-foreground hover:text-foreground">← Start over</button>
      </div>
      <div className="space-y-3">
        {teams.map((t, i) => {
          const pts = calcPoints(t.position, t.totalKills, placementMap, killValue);
          const update = (patch: Partial<ExtractedTeam>) => {
            const next = [...teams]; next[i] = { ...next[i], ...patch }; setTeams(next);
          };
          return (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-gradient-gold text-gold-foreground flex items-center justify-center font-display font-bold text-xl">
                  #{t.position}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <div className="font-display font-bold text-lg truncate">{t.team_name}</div>
                    <div className="text-xs text-muted-foreground">{t.players.length} players · {t.totalKills} kills</div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                    <div className="bg-muted rounded-md px-3 py-2">
                      <div className="text-[10px] uppercase text-muted-foreground">Placement</div>
                      <div className="font-semibold">{pts.placement_points}</div>
                    </div>
                    <div className="bg-muted rounded-md px-3 py-2">
                      <div className="text-[10px] uppercase text-muted-foreground">Kills</div>
                      <div className="font-semibold">{pts.kill_points}</div>
                    </div>
                    <div className="bg-gold/10 border border-gold/30 rounded-md px-3 py-2">
                      <div className="text-[10px] uppercase text-gold">Total</div>
                      <div className="font-semibold text-gold">{pts.total_points}</div>
                    </div>
                  </div>

                  <div className="mt-3">
                    {t.matched_team_id ? (
                      <div className="text-xs text-emerald-400">
                        ✓ Auto-matched to registered team
                        {typeof t.confidence === "number" && (
                          <span className="text-muted-foreground"> · {Math.round(t.confidence * 100)}% confidence · {t.matched_players ?? 0} players matched</span>
                        )}
                      </div>
                    ) : t.needs_confirmation && t.suggested_team_id ? (
                      <div className="space-y-2 border-t border-border pt-3">
                        <div className="text-xs text-amber-400">
                          ? Possibly <span className="font-semibold text-foreground">{t.suggested_team_name}</span>
                          {typeof t.confidence === "number" && (
                            <span className="text-muted-foreground"> · {Math.round(t.confidence * 100)}% confidence · {t.matched_players ?? 0} players matched</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => update({
                            matched_team_id: t.suggested_team_id!,
                            needs_confirmation: false,
                            new_team_name: undefined,
                          })} className="bg-gradient-gold text-gold-foreground font-semibold">
                            Confirm match
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => update({
                            suggested_team_id: null,
                            suggested_team_name: undefined,
                            needs_confirmation: false,
                            new_team_name: t.team_name,
                          })}>
                            Reject — register new
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 border-t border-border pt-3">
                        <div className="text-xs text-amber-400">⚠ Team not recognized — register it</div>
                        <div className="flex flex-wrap gap-2">
                          <Input
                            value={t.new_team_name ?? ""}
                            onChange={e => update({ new_team_name: e.target.value })}
                            placeholder="Full team name"
                            className="flex-1 min-w-[180px]"
                          />
                          <select
                            value={t.matched_team_id ?? ""}
                            onChange={e => update({ matched_team_id: e.target.value || null })}
                            className="bg-input border border-border rounded-md px-3 text-sm"
                          >
                            <option value="">Or link to existing…</option>
                            {existing.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                          </select>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          {t.new_team_logo ? t.new_team_logo.name : "Upload team logo (optional)"}
                          <input type="file" accept="image/*" className="hidden"
                            onChange={e => update({ new_team_logo: e.target.files?.[0] ?? null })} />
                        </label>
                      </div>
                    )}
                  </div>


                  {t.players.length > 0 && (
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Players</summary>
                      <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
                        {t.players.map((name, pi) => (
                          <li key={pi} className="flex justify-between bg-muted rounded px-2 py-1">
                            <span className="truncate">{name}</span>
                            <span className="text-gold">{t.kills[pi] ?? 0} K</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Button onClick={onSave} disabled={saving} className="w-full bg-gradient-gold text-gold-foreground font-semibold">
        {saving ? "Saving…" : "Save Match"}
      </Button>
    </div>
  );
}
