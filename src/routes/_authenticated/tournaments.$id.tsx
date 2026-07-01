import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Sparkles, X, Plus, Check, Trophy, Map as MapIcon, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { extractMatchFromScreenshots } from "@/lib/ocr.functions";
import { useServerFn } from "@tanstack/react-start";
import { calcPoints, DEFAULT_PLACEMENT, matchTeamByPlayers, mergePlayers, type PlacementMap } from "@/lib/scoring";
import { uploadTeamLogo } from "@/lib/teams";

export const Route = createFileRoute("/_authenticated/tournaments/$id")({
  head: () => ({ meta: [{ title: "Tournament — YCT PointMaker" }] }),
  component: TournamentDetailPage,
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
  confidence?: number;
  matched_players?: number;
  needs_confirmation?: boolean;
  new_team_name?: string;
  new_team_logo?: File | null;
};

function TournamentDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const runOcr = useServerFn(extractMatchFromScreenshots);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? ""));
  }, []);

  const tournament = useQuery({
    queryKey: ["tournament", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tournaments")
        .select("id,name,series_type,total_matches,maps")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const matches = useQuery({
    queryKey: ["tournament-matches", id],
    queryFn: async () => {
      const { data } = await supabase.from("matches")
        .select("id,name,match_number,map_name,played_at")
        .eq("tournament_id", id)
        .order("match_number", { ascending: true });
      return data ?? [];
    },
  });

  const results = useQuery({
    queryKey: ["tournament-results", id],
    queryFn: async () => {
      const { data } = await supabase.from("match_results")
        .select("team_id,team_name_raw,placement,kills,placement_points,kill_points,total_points,match_id,team:teams(name,logo_url),match:matches!inner(tournament_id)")
        .eq("match.tournament_id", id);
      return data ?? [];
    },
  });

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

  const completedNumbers = useMemo(() => new Set((matches.data ?? []).map(m => m.match_number).filter((n): n is number => n != null)), [matches.data]);
  const currentStep = useMemo(() => {
    if (!tournament.data) return 1;
    for (let i = 1; i <= tournament.data.total_matches; i++) {
      if (!completedNumbers.has(i)) return i;
    }
    return tournament.data.total_matches + 1; // done
  }, [tournament.data, completedNumbers]);

  const allDone = tournament.data && currentStep > tournament.data.total_matches;

  // Wizard upload state for the active step
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedTeam[] | null>(null);
  const [saving, setSaving] = useState(false);

  function resetStep() {
    setFiles([]); setExtracted(null);
  }

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
    if (!extracted || !tournament.data) return;
    const stepNum = currentStep;
    const mapName = tournament.data.maps[stepNum - 1] ?? `Match ${stepNum}`;
    setSaving(true);
    try {
      const teamIdMap = new Map<number, string>();
      const list = teams.data ?? [];
      for (let i = 0; i < extracted.length; i++) {
        const t = extracted[i];
        if (t.needs_confirmation) throw new Error(`Confirm or reject the suggestion for "${t.team_name}" first`);
        if (t.matched_team_id) {
          teamIdMap.set(i, t.matched_team_id);
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
        user_id: userId,
        name: `${tournament.data.name} · Match ${stepNum} (${mapName})`,
        screenshot_urls: screenshotPaths,
        tournament_id: id,
        match_number: stepNum,
        map_name: mapName,
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

      const isFinal = stepNum >= tournament.data.total_matches;
      toast.success(isFinal ? "Tournament finalized!" : `Match ${stepNum} saved`);
      resetStep();
      qc.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Aggregate standings for this tournament
  const standings = useMemo(() => {
    type Row = { team_id: string | null; team_name: string; matches: number; kills: number; placement_points: number; total: number; wins: number };
    const map = new Map<string, Row>();
    for (const r of results.data ?? []) {
      const key = r.team_id ?? `raw:${r.team_name_raw}`;
      const team = r.team as { name: string; logo_url: string | null } | null;
      const existing = map.get(key) ?? {
        team_id: r.team_id, team_name: team?.name ?? r.team_name_raw,
        matches: 0, kills: 0, placement_points: 0, total: 0, wins: 0,
      };
      existing.matches += 1;
      existing.kills += r.kills;
      existing.placement_points += r.placement_points;
      existing.total += r.total_points;
      if (r.placement === 1) existing.wins += 1;
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total || b.wins - a.wins || b.kills - a.kills);
  }, [results.data]);

  if (tournament.isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!tournament.data) return <div className="text-sm text-muted-foreground">Tournament not found.</div>;

  const t = tournament.data;
  const steps = Array.from({ length: t.total_matches }, (_, i) => ({
    number: i + 1,
    map: t.maps[i] ?? `Match ${i + 1}`,
    done: completedNumbers.has(i + 1),
    active: !allDone && currentStep === i + 1,
  }));

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/tournaments"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:border-gold/50 hover:text-gold transition"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Tournaments
        </Link>
        <h1 className="text-3xl font-display font-bold flex items-center gap-2 mt-2">
          <Trophy className="w-7 h-7 text-gold" /> {t.name}
        </h1>
        <p className="text-muted-foreground">{t.series_type}-match series · {completedNumbers.size}/{t.total_matches} matches uploaded</p>
      </div>

      {/* Step indicator */}
      <div className="overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          {steps.map((s, i) => (
            <div key={s.number} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                s.done ? "border-emerald-500/50 bg-emerald-500/10" :
                s.active ? "border-gold bg-gold/10" :
                "border-border bg-card"
              }`}>
                <div className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold ${
                  s.done ? "bg-emerald-500 text-black" :
                  s.active ? "bg-gold text-black" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {s.done ? <Check className="w-4 h-4" /> : s.number}
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground leading-none">Match {s.number}</div>
                  <div className="text-sm font-medium leading-tight flex items-center gap-1">
                    <MapIcon className="w-3 h-3" /> {s.map}
                  </div>
                </div>
              </div>
              {i < steps.length - 1 && <div className="w-6 h-px bg-border" />}
            </div>
          ))}
        </div>
      </div>

      {/* Active step uploader */}
      {!allDone && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-gold">Active step</div>
            <h2 className="text-xl font-display font-bold">
              Upload 2 Screenshots for Match {currentStep} ({t.maps[currentStep - 1]})
            </h2>
          </div>

          {!extracted && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {files.map((f, i) => (
                  <div key={i} className="relative aspect-[9/16] rounded-lg border border-border overflow-hidden bg-muted">
                    <img src={URL.createObjectURL(f)} alt={`Screenshot ${i + 1}`} className="w-full h-full object-cover" />
                    <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="absolute top-1 right-1 bg-black/70 rounded-full p-1">
                      <X className="w-3 h-3" />
                    </button>
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
                {processing ? "Reading screenshots…" : <><Sparkles className="w-4 h-4 mr-2" /> Extract with Gemini</>}
              </Button>
            </>
          )}

          {extracted && (
            <ExtractedReview
              teams={extracted}
              setTeams={setExtracted}
              existing={teams.data ?? []}
              placementMap={placementMap}
              killValue={killValue}
              saving={saving}
              isFinal={currentStep >= t.total_matches}
              nextNumber={currentStep + 1}
              onSave={handleSave}
              onReset={resetStep}
            />
          )}
        </div>
      )}

      {allDone && (
        <div className="rounded-xl border border-gold/40 bg-gold/10 p-6 text-center">
          <Trophy className="w-10 h-10 text-gold mx-auto mb-2" />
          <h2 className="text-xl font-display font-bold">All {t.total_matches} matches submitted</h2>
          <p className="text-sm text-muted-foreground mt-1">Final standings are aggregated below.</p>
          <Button onClick={() => navigate({ to: "/standings", search: { tournament: id } as never })} className="mt-4 bg-gradient-gold text-gold-foreground font-semibold">
            View full standings
          </Button>
        </div>
      )}

      {/* Live leaderboard */}
      <div>
        <h2 className="text-lg font-display font-semibold mb-3">Live Leaderboard</h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
            <div className="col-span-1">#</div>
            <div className="col-span-5">Team</div>
            <div className="col-span-1 text-right">M</div>
            <div className="col-span-1 text-right">W</div>
            <div className="col-span-1 text-right">K</div>
            <div className="col-span-1 text-right">Plc</div>
            <div className="col-span-2 text-right">Total</div>
          </div>
          {standings.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">No results yet — upload Match 1 to start.</div>
          )}
          {standings.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b border-border/50 last:border-0 hover:bg-muted/30">
              <div className={`col-span-1 font-display font-bold ${i === 0 ? "text-gold text-xl" : i < 3 ? "text-gold/80" : ""}`}>{i + 1}</div>
              <div className="col-span-5 font-medium truncate">{r.team_name}</div>
              <div className="col-span-1 text-right text-sm text-muted-foreground">{r.matches}</div>
              <div className="col-span-1 text-right text-sm text-muted-foreground">{r.wins}</div>
              <div className="col-span-1 text-right text-sm">{r.kills}</div>
              <div className="col-span-1 text-right text-sm">{r.placement_points}</div>
              <div className="col-span-2 text-right font-display font-bold text-gold">{r.total}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExtractedReview({
  teams, setTeams, existing, placementMap, killValue, saving, isFinal, nextNumber, onSave, onReset,
}: {
  teams: ExtractedTeam[];
  setTeams: (t: ExtractedTeam[]) => void;
  existing: { id: string; name: string }[];
  placementMap: PlacementMap;
  killValue: number;
  saving: boolean;
  isFinal: boolean;
  nextNumber: number;
  onSave: () => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold">Review extracted results</h3>
        <button onClick={onReset} className="text-xs text-muted-foreground hover:text-foreground">← Re-upload screenshots</button>
      </div>
      <div className="space-y-3">
        {teams.map((t, i) => {
          const pts = calcPoints(t.position, t.totalKills, placementMap, killValue);
          const update = (patch: Partial<ExtractedTeam>) => {
            const next = [...teams]; next[i] = { ...next[i], ...patch }; setTeams(next);
          };
          return (
            <div key={i} className="rounded-xl border border-border bg-background p-4">
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
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Button onClick={onSave} disabled={saving} className="w-full bg-gradient-gold text-gold-foreground font-semibold">
        {saving
          ? "Saving…"
          : isFinal
            ? "Finalize Tournament Standings"
            : `Proceed to Match ${nextNumber} Results Upload`}
      </Button>
    </div>
  );
}
