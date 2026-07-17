import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Sparkles, X, Plus, Check, Trophy, Map as MapIcon, ArrowLeft, Users, ChevronDown, ChevronUp, RotateCcw, Crosshair } from "lucide-react";
import { toast } from "sonner";
import { extractMatchFromScreenshots } from "@/lib/ocr.functions";
import { useServerFn } from "@tanstack/react-start";
import { calcPoints, compareTiebreak, DEFAULT_PLACEMENT, matchTeamByPlayers, mergePlayers, type PlacementMap } from "@/lib/scoring";
import { uploadTeamLogo } from "@/lib/teams";

export const Route = createFileRoute("/_authenticated/tournaments/$id")({
  head: () => ({ meta: [{ title: "Tournament — RankForge" }] }),
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
        .select("id,name,series_type,total_matches,maps,participants")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data as (typeof data & { participants?: Array<{ team_id?: string; name: string; short_name?: string }> | null }) | null;
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
  const [entryMode, setEntryMode] = useState<"auto" | "manual" | null>(null);
  const [manualSaving, setManualSaving] = useState(false);

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
      const participants = ((tournament.data?.participants ?? []) as Array<{ name: string; short_name?: string }>)
        .map(p => ({ name: p.name, short_name: p.short_name ?? "" }));
      const result = await runOcr({ data: { images, participants } });
      if (!result.teams.length) {
        toast.error("Couldn't read any teams. Try clearer screenshots.");
        return;
      }
      const allTeams = teams.data ?? [];
      const participantEntries = (tournament.data?.participants ?? []) as Array<{ team_id?: string }>;
      const participantIds = new Set(participantEntries.map(p => p.team_id).filter(Boolean) as string[]);
      const list = participantIds.size > 0
        ? allTeams.filter(x => participantIds.has(x.id))
        : allTeams;
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

  async function handleManualSave(rows: Array<{ team_id: string; team_name: string; placement: number; kills: number }>) {
    if (!tournament.data) return;
    const stepNum = currentStep;
    const mapName = tournament.data.maps[stepNum - 1] ?? `Match ${stepNum}`;

    // Validation
    const placements = rows.map(r => r.placement);
    const seen = new Set<number>();
    for (const p of placements) {
      if (!Number.isInteger(p) || p < 1) throw new Error("Every team needs a valid placement");
      if (seen.has(p)) { toast.error(`Placement #${p} is used twice — each team gets a unique rank.`); return; }
      seen.add(p);
    }

    setManualSaving(true);
    try {
      const { data: match, error: mErr } = await supabase.from("matches").insert({
        user_id: userId,
        name: `${tournament.data.name} · Match ${stepNum} (${mapName})`,
        screenshot_urls: [],
        tournament_id: id,
        match_number: stepNum,
        map_name: mapName,
      }).select().single();
      if (mErr) throw mErr;

      const teamById = new Map((teams.data ?? []).map(t => [t.id, t]));
      const dbRows = rows.map(r => {
        const pts = calcPoints(r.placement, r.kills, placementMap, killValue);
        const team = teamById.get(r.team_id);
        const roster = team?.players ?? [];
        return {
          user_id: userId,
          match_id: match.id,
          team_id: r.team_id,
          team_name_raw: r.team_name,
          placement: r.placement,
          kills: r.kills,
          placement_points: pts.placement_points,
          kill_points: pts.kill_points,
          total_points: pts.total_points,
          players: roster.map(name => ({ name, kills: 0 })),
        };
      });
      const { error: rErr } = await supabase.from("match_results").insert(dbRows);
      if (rErr) throw rErr;

      const isFinal = stepNum >= tournament.data.total_matches;
      toast.success(isFinal ? "Tournament finalized!" : `Match ${stepNum} saved`);
      setEntryMode(null);
      resetStep();
      qc.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setManualSaving(false);
    }
  }

  async function handleRedo(matchNumber: number) {
    const m = (matches.data ?? []).find(x => x.match_number === matchNumber);
    if (!m) return;
    if (!confirm(`Re-open Match ${matchNumber} (${m.map_name ?? ""})? This deletes its saved results so you can re-upload.`)) return;
    try {
      const { error: rErr } = await supabase.from("match_results").delete().eq("match_id", m.id);
      if (rErr) throw rErr;
      const { error: mErr } = await supabase.from("matches").delete().eq("id", m.id);
      if (mErr) throw mErr;
      toast.success(`Match ${matchNumber} reopened — upload again to fix mistakes.`);
      resetStep();
      qc.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reopen match");
    }
  }

  // Aggregate standings for this tournament (Free Fire official tie-breaker)
  const standings = useMemo(() => {
    type Row = { team_id: string | null; team_name: string; matches: number; kills: number; placement_points: number; total: number; wins: number; lastPlacement?: number };
    const matchNoById = new Map<string, number>();
    for (const m of matches.data ?? []) matchNoById.set(m.id, m.match_number ?? 0);
    const map = new Map<string, Row & { _lastMatchNo: number }>();
    for (const r of results.data ?? []) {
      const key = r.team_id ?? `raw:${r.team_name_raw}`;
      const team = r.team as { name: string; logo_url: string | null } | null;
      const matchNo = matchNoById.get(r.match_id) ?? 0;
      const existing = map.get(key) ?? {
        team_id: r.team_id, team_name: team?.name ?? r.team_name_raw,
        matches: 0, kills: 0, placement_points: 0, total: 0, wins: 0,
        lastPlacement: undefined, _lastMatchNo: -1,
      };
      existing.matches += 1;
      existing.kills += r.kills;
      existing.placement_points += r.placement_points;
      existing.total += r.total_points;
      if (r.placement === 1) existing.wins += 1;
      if (matchNo >= existing._lastMatchNo) {
        existing._lastMatchNo = matchNo;
        existing.lastPlacement = r.placement;
      }
      map.set(key, existing);
    }
    return Array.from(map.values())
      .map(({ _lastMatchNo, ...rest }) => { void _lastMatchNo; return rest as Row; })
      .sort(compareTiebreak);
  }, [results.data, matches.data]);

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
                {s.done && (
                  <button
                    onClick={() => handleRedo(s.number)}
                    title={`Re-open Match ${s.number} to fix mistakes`}
                    className="ml-1 rounded-md border border-border/60 bg-background/60 hover:bg-background hover:border-gold/60 hover:text-gold px-1.5 py-1 text-[10px] font-medium inline-flex items-center gap-1 transition"
                  >
                    <RotateCcw className="w-3 h-3" /> Redo
                  </button>
                )}
              </div>
              {i < steps.length - 1 && <div className="w-6 h-px bg-border" />}
            </div>
          ))}
        </div>
      </div>

      {/* Active step — choose entry mode */}
      {!allDone && entryMode === null && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-gold">Match {currentStep} · {t.maps[currentStep - 1]}</div>
            <h2 className="text-xl font-display font-bold">How do you want to enter results?</h2>
            <p className="text-sm text-muted-foreground">Pick a mode for this match. You can switch on the next match.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              onClick={() => setEntryMode("auto")}
              className="text-left rounded-lg border border-border hover:border-gold hover:bg-gold/5 p-5 transition"
            >
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-5 h-5 text-gold" />
                <div className="font-display font-bold">Automatic</div>
              </div>
              <div className="text-xs text-muted-foreground">Upload result screenshots — Gemini AI reads placements, kills and maps them to your registered teams.</div>
            </button>
            <button
              onClick={() => setEntryMode("manual")}
              className="text-left rounded-lg border border-border hover:border-gold hover:bg-gold/5 p-5 transition"
            >
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-5 h-5 text-gold" />
                <div className="font-display font-bold">Manual</div>
              </div>
              <div className="text-xs text-muted-foreground">Type each team's kills and placement. Points calculate automatically from your scoring rules.</div>
            </button>
          </div>
        </div>
      )}

      {/* Active step uploader — Automatic */}
      {!allDone && entryMode === "auto" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-widest text-gold">Automatic · Active step</div>
              <h2 className="text-xl font-display font-bold">
                Upload screenshots for Match {currentStep} ({t.maps[currentStep - 1]})
              </h2>
            </div>
            <button onClick={() => { setEntryMode(null); resetStep(); }} className="text-xs text-muted-foreground hover:text-foreground underline">
              Switch mode
            </button>
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

      {/* Active step — Manual */}
      {!allDone && entryMode === "manual" && (
        <ManualMatchForm
          matchNumber={currentStep}
          mapName={t.maps[currentStep - 1] ?? `Match ${currentStep}`}
          isFinal={currentStep >= t.total_matches}
          participants={(t.participants ?? []) as Array<{ team_id?: string; name: string; short_name?: string }>}
          allTeams={teams.data ?? []}
          placementMap={placementMap}
          killValue={killValue}
          saving={manualSaving}
          onCancel={() => setEntryMode(null)}
          onSave={handleManualSave}
        />
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
  const [openPlayers, setOpenPlayers] = useState<Record<number, boolean>>({});
  const togglePlayers = (i: number) => setOpenPlayers(p => ({ ...p, [i]: !p[i] }));
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
          const isOpen = openPlayers[i] ?? false;
          return (
            <div key={i} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-gradient-gold text-gold-foreground flex items-center justify-center font-display font-bold text-xl">
                  #{t.position}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <div className="font-display font-bold text-lg truncate">{t.team_name}</div>
                    <button
                      type="button"
                      onClick={() => togglePlayers(i)}
                      className="text-xs text-muted-foreground hover:text-gold inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-0.5 bg-muted/40 transition"
                      title="Show players"
                    >
                      <Users className="w-3.5 h-3.5 text-gold" />
                      {t.players.length} players · {t.totalKills} kills
                      {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
                      {t.players.length === 0 && <div className="text-xs text-muted-foreground">No player names read.</div>}
                      {t.players.map((name, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-md bg-background border border-border text-[10px] font-semibold flex items-center justify-center shrink-0">{idx + 1}</span>
                            <span className="truncate">{name || <span className="text-muted-foreground italic">unknown</span>}</span>
                          </div>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-gold">
                            <Crosshair className="w-3 h-3" /> {t.kills[idx] ?? 0}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
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

type Team = { id: string; name: string; short_name: string | null };

function ManualMatchForm({
  matchNumber, mapName, isFinal, participants, allTeams, placementMap, killValue, saving, onCancel, onSave,
}: {
  matchNumber: number;
  mapName: string;
  isFinal: boolean;
  participants: Array<{ team_id?: string; name: string; short_name?: string }>;
  allTeams: Array<{ id: string; name: string; short_name: string | null }>;
  placementMap: PlacementMap;
  killValue: number;
  saving: boolean;
  onCancel: () => void;
  onSave: (rows: Array<{ team_id: string; team_name: string; placement: number; kills: number }>) => void | Promise<void>;
}) {
  const roster: Team[] = useMemo(() => {
    const byId = new Map(allTeams.map(t => [t.id, t]));
    if (participants.length > 0) {
      return participants.map(p => {
        if (p.team_id && byId.has(p.team_id)) return byId.get(p.team_id)!;
        return { id: p.team_id ?? p.name, name: p.name, short_name: p.short_name ?? null };
      });
    }
    return allTeams;
  }, [participants, allTeams]);

  type Entry = { team_id: string; team_name: string; short_name: string | null; placement: number | null; kills: number | null };

  const [entries, setEntries] = useState<Entry[]>(() =>
    roster.map(t => ({ team_id: t.id, team_name: t.name, short_name: t.short_name, placement: null, kills: null }))
  );

  useEffect(() => {
    setEntries(prev => {
      const prevById = new Map(prev.map(e => [e.team_id, e]));
      return roster.map(t => {
        const p = prevById.get(t.id);
        return p
          ? { ...p, team_name: t.name, short_name: t.short_name }
          : { team_id: t.id, team_name: t.name, short_name: t.short_name, placement: null, kills: null };
      });
    });
  }, [roster]);

  // Selected team the user is entering right now (null = dashboard view)
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ placement: number | null; kills: number | null }>({ placement: null, kills: null });

  function openTeam(i: number) {
    const e = entries[i];
    setDraft({ placement: e.placement, kills: e.kills });
    setActiveIdx(i);
  }
  function closeTeam() {
    setActiveIdx(null);
  }
  function saveDraft(next: "close" | "next") {
    if (activeIdx == null) return;
    setEntries(prev => {
      const arr = [...prev];
      arr[activeIdx] = { ...arr[activeIdx], placement: draft.placement, kills: draft.kills };
      return arr;
    });
    if (next === "close") { closeTeam(); return; }
    // Move to next un-filled team, otherwise the next index, otherwise close
    const nextUnfilled = entries.findIndex((e, i) => i !== activeIdx && (e.placement == null || e.kills == null));
    if (nextUnfilled >= 0) openTeam(nextUnfilled);
    else if (activeIdx + 1 < entries.length) openTeam(activeIdx + 1);
    else closeTeam();
  }

  const filledCount = entries.filter(e => e.placement != null && e.kills != null).length;
  const usedPlacements = new Map<number, number>();
  for (const e of entries) if (e.placement != null) usedPlacements.set(e.placement, (usedPlacements.get(e.placement) ?? 0) + 1);
  const duplicates = Array.from(usedPlacements.entries()).filter(([, c]) => c > 1).map(([p]) => p);
  const allFilled = filledCount === entries.length;
  const ready = allFilled && duplicates.length === 0;

  const activeEntry = activeIdx != null ? entries[activeIdx] : null;
  const activePreview = activeEntry
    ? calcPoints(draft.placement ?? 0, draft.kills ?? 0, placementMap, killValue)
    : null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-gold">Manual · Team-by-Team</div>
          <h2 className="text-xl font-display font-bold">
            Enter results for Match {matchNumber} ({mapName})
          </h2>
          <p className="text-xs text-muted-foreground">
            Click a team card to enter its placement and kills, then move to the next team. {filledCount}/{entries.length} teams entered.
          </p>
        </div>
        <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground underline">
          Switch mode
        </button>
      </div>

      {duplicates.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs px-3 py-2">
          Placement{duplicates.length > 1 ? "s" : ""} #{duplicates.join(", #")} used more than once — each team needs a unique rank.
        </div>
      )}

      {/* Dashboard view */}
      {activeIdx === null && (
        <>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {entries.map((e, i) => {
              const filled = e.placement != null && e.kills != null;
              const pts = filled ? calcPoints(e.placement!, e.kills!, placementMap, killValue) : null;
              const dup = e.placement != null && duplicates.includes(e.placement);
              return (
                <button
                  key={e.team_id}
                  onClick={() => openTeam(i)}
                  className={`text-left rounded-xl border p-4 transition ${
                    filled
                      ? dup
                        ? "border-amber-500/60 bg-amber-500/5 hover:border-amber-500"
                        : "border-gold/50 bg-gold/5 hover:border-gold"
                      : "border-border bg-background hover:border-gold/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-display font-bold truncate">{e.team_name}</div>
                      {e.short_name && <div className="text-[10px] text-gold uppercase tracking-wider">{e.short_name}</div>}
                    </div>
                    {filled ? (
                      <span className="text-[10px] uppercase tracking-wider text-gold font-semibold shrink-0">Done</span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Tap to enter</span>
                    )}
                  </div>
                  {filled && pts ? (
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-md bg-muted px-2 py-1">
                        <div className="text-[9px] uppercase text-muted-foreground">Place</div>
                        <div className="font-bold">#{e.placement}</div>
                      </div>
                      <div className="rounded-md bg-muted px-2 py-1">
                        <div className="text-[9px] uppercase text-muted-foreground">Kills</div>
                        <div className="font-bold">{e.kills}</div>
                      </div>
                      <div className="rounded-md bg-gold/10 border border-gold/30 px-2 py-1">
                        <div className="text-[9px] uppercase text-gold">Total</div>
                        <div className="font-bold text-gold">{pts.total_points}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-muted-foreground">No result entered.</div>
                  )}
                </button>
              );
            })}
          </div>

          <Button
            onClick={() => onSave(entries.map(e => ({
              team_id: e.team_id, team_name: e.team_name,
              placement: e.placement ?? 0, kills: e.kills ?? 0,
            })))}
            disabled={saving || !ready}
            className="w-full bg-gradient-gold text-gold-foreground font-semibold"
          >
            {saving
              ? "Saving…"
              : !allFilled
                ? `Enter ${entries.length - filledCount} more team${entries.length - filledCount === 1 ? "" : "s"} to continue`
                : isFinal
                  ? "Finalize Tournament Standings"
                  : `Save Match ${matchNumber} & Continue`}
          </Button>
        </>
      )}

      {/* Single-team entry panel */}
      {activeEntry && (
        <div className="rounded-xl border border-gold/40 bg-background p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-widest text-gold">
                Team {activeIdx! + 1} of {entries.length}
              </div>
              <div className="font-display font-bold text-2xl truncate">{activeEntry.team_name}</div>
              {activeEntry.short_name && (
                <div className="text-xs text-gold uppercase tracking-wider">{activeEntry.short_name}</div>
              )}
            </div>
            <button onClick={closeTeam} className="text-xs text-muted-foreground hover:text-foreground underline">
              ← Back to teams
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1 block">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Placement</span>
              <Input
                type="number" min={1} max={roster.length} autoFocus
                value={draft.placement ?? ""}
                onChange={ev => setDraft(d => ({
                  ...d,
                  placement: ev.target.value === "" ? null : Math.max(1, Number(ev.target.value) || 1),
                }))}
                placeholder="e.g. 1"
                className="h-11 text-lg text-center font-display font-bold"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Kills</span>
              <Input
                type="number" min={0}
                value={draft.kills ?? ""}
                onChange={ev => setDraft(d => ({
                  ...d,
                  kills: ev.target.value === "" ? null : Math.max(0, Number(ev.target.value) || 0),
                }))}
                placeholder="e.g. 7"
                className="h-11 text-lg text-center font-display font-bold"
              />
            </label>
          </div>

          {activePreview && (
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-muted rounded-md px-3 py-2">
                <div className="text-[10px] uppercase text-muted-foreground">Placement pts</div>
                <div className="font-semibold">{activePreview.placement_points}</div>
              </div>
              <div className="bg-muted rounded-md px-3 py-2">
                <div className="text-[10px] uppercase text-muted-foreground">Kill pts</div>
                <div className="font-semibold">{activePreview.kill_points}</div>
              </div>
              <div className="bg-gold/10 border border-gold/30 rounded-md px-3 py-2">
                <div className="text-[10px] uppercase text-gold">Total</div>
                <div className="font-semibold text-gold">{activePreview.total_points}</div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => saveDraft("next")}
              disabled={draft.placement == null || draft.kills == null}
              className="flex-1 bg-gradient-gold text-gold-foreground font-semibold"
            >
              Save & Next Team →
            </Button>
            <Button
              onClick={() => saveDraft("close")}
              disabled={draft.placement == null || draft.kills == null}
              variant="outline"
              className="flex-1"
            >
              Save & Back to Dashboard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

