import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Shield, Pencil, X, Users, GitMerge, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";
import { uploadTeamLogo, getLogoUrl } from "@/lib/teams";
import { mergePlayers } from "@/lib/scoring";

type Team = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  aliases: string[];
  players: string[];
};

export const Route = createFileRoute("/_authenticated/teams")({
  head: () => ({ meta: [{ title: "Teams — YCT PointMaker" }] }),
  component: TeamsPage,
});

function TeamsPage() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  useEffect(() => { supabase.auth.getUser().then(({data}) => setUserId(data.user?.id ?? "")); }, []);

  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await supabase.from("teams").select("*").order("name")).data ?? [],
  });

  async function handleDelete(id: string) {
    if (!confirm("Delete this team? Past match results will keep raw team names but unlink.")) return;
    const { error } = await supabase.from("teams").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Team deleted"); qc.invalidateQueries(); }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function exitSelect() { setSelectMode(false); setSelected(new Set()); }

  const selectedTeams = (teams.data ?? []).filter(t => selected.has(t.id)) as Team[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold">Teams</h1>
          <p className="text-muted-foreground">Registered squads. Future matches recognize them automatically.</p>
        </div>
        <div className="flex items-center gap-2">
          {selectMode ? (
            <>
              <span className="text-sm text-muted-foreground">{selected.size} selected</span>
              <Button
                variant="outline"
                onClick={() => {
                  if (selected.size < 2) { toast.error("Select at least 2 teams to merge"); return; }
                  setMergeOpen(true);
                }}
                className="border-gold/50 text-gold hover:bg-gold hover:text-gold-foreground"
              >
                <GitMerge className="w-4 h-4 mr-1" /> Merge…
              </Button>
              <Button variant="ghost" onClick={exitSelect}>Cancel</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setSelectMode(true)}>
                <GitMerge className="w-4 h-4 mr-1" /> Merge duplicates
              </Button>
              <CreateTeamDialog userId={userId} onCreated={() => qc.invalidateQueries({ queryKey: ["teams"] })} />
            </>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.data?.map(t => (
          <TeamCard
            key={t.id}
            team={t as Team}
            selectMode={selectMode}
            selected={selected.has(t.id)}
            onToggleSelect={() => toggleSelect(t.id)}
            onDelete={() => handleDelete(t.id)}
            onSaved={() => qc.invalidateQueries({ queryKey: ["teams"] })}
          />
        ))}
        {teams.data?.length === 0 && (
          <div className="col-span-full text-center text-sm text-muted-foreground py-12 border border-dashed border-border rounded-xl">
            No teams yet. Add one or upload a match and we'll register them as they appear.
          </div>
        )}
      </div>
      <MergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        teams={selectedTeams}
        onMerged={() => { exitSelect(); qc.invalidateQueries(); }}
      />
    </div>
  );
}

function MergeDialog({ open, onOpenChange, teams, onMerged }: {
  open: boolean; onOpenChange: (v: boolean) => void; teams: Team[]; onMerged: () => void;
}) {
  const [primaryId, setPrimaryId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open && teams[0]) setPrimaryId(teams[0].id); }, [open, teams]);

  async function doMerge() {
    if (!primaryId) return;
    const primary = teams.find(t => t.id === primaryId);
    if (!primary) return;
    const others = teams.filter(t => t.id !== primaryId);
    if (others.length === 0) return;
    setBusy(true);
    try {
      // Merge players + aliases (add each secondary's name as alias)
      let mergedPlayers = primary.players ?? [];
      let mergedAliases = primary.aliases ?? [];
      for (const o of others) {
        mergedPlayers = mergePlayers(mergedPlayers, o.players ?? []);
        mergedAliases = mergePlayers(mergedAliases, [...(o.aliases ?? []), o.name, o.short_name ?? ""].filter(Boolean));
      }
      // Repoint match_results
      const otherIds = others.map(o => o.id);
      const { error: rErr } = await supabase.from("match_results")
        .update({ team_id: primary.id })
        .in("team_id", otherIds);
      if (rErr) throw rErr;
      // Update primary
      const { error: uErr } = await supabase.from("teams")
        .update({ players: mergedPlayers, aliases: mergedAliases })
        .eq("id", primary.id);
      if (uErr) throw uErr;
      // Delete secondaries
      const { error: dErr } = await supabase.from("teams").delete().in("id", otherIds);
      if (dErr) throw dErr;
      toast.success(`Merged ${others.length} team${others.length > 1 ? "s" : ""} into ${primary.name}`);
      onOpenChange(false);
      onMerged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Merge failed");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Merge {teams.length} teams</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Choose the team to keep. Others will be deleted; their players, aliases, and match results move onto the primary.
          </p>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {teams.map(t => (
              <label key={t.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${primaryId === t.id ? "border-gold bg-gold/10" : "border-border hover:border-gold/50"}`}>
                <input
                  type="radio" name="primary" value={t.id}
                  checked={primaryId === t.id}
                  onChange={() => setPrimaryId(t.id)}
                  className="accent-gold"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {(t.players ?? []).length} players · {(t.aliases ?? []).length} aliases
                  </div>
                </div>
                {primaryId === t.id && <span className="text-xs text-gold font-semibold">KEEP</span>}
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={doMerge} disabled={busy || !primaryId} className="bg-gradient-gold text-gold-foreground font-semibold">
            {busy ? "Merging…" : <><GitMerge className="w-4 h-4 mr-1" /> Merge teams</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



function TeamCard({ team, onDelete, onSaved }: { team: Team; onDelete: () => void; onSaved: () => void }) {
  const [logo, setLogo] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  useEffect(() => { getLogoUrl(team.logo_url).then(setLogo); }, [team.logo_url]);
  const aliases = team.aliases ?? [];
  const players = team.players ?? [];
  return (
    <div className="rounded-xl border border-border bg-card p-5 hover:border-gold/40 transition">
      <div className="flex items-start gap-3">
        <div className="w-14 h-14 rounded-lg bg-muted border border-border overflow-hidden flex items-center justify-center shrink-0">
          {logo ? <img src={logo} alt={team.name} className="w-full h-full object-cover" /> : <Shield className="w-6 h-6 text-gold" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold truncate">{team.name}</div>
          {aliases.length > 0 && (
            <div className="text-xs text-muted-foreground truncate">a.k.a. {aliases.join(", ")}</div>
          )}
          <div className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
            <Users className="w-3 h-3 text-gold" /> {players.length} players
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditOpen(true)}
            title="Edit team"
            className="rounded-md border border-gold/40 bg-gold/10 text-gold hover:bg-gold hover:text-gold-foreground p-1.5 transition"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            title="Delete team"
            className="rounded-md border border-gold/40 bg-gold/10 text-gold hover:bg-destructive hover:border-destructive hover:text-destructive-foreground p-1.5 transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {players.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {players.slice(0, 6).map((p, i) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-muted border border-border text-foreground/80">
              {p}
            </span>
          ))}
          {players.length > 6 && (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-muted border border-border text-muted-foreground">
              +{players.length - 6}
            </span>
          )}
        </div>
      )}

      <EditTeamDialog open={editOpen} onOpenChange={setEditOpen} team={team} onSaved={onSaved} />
    </div>
  );
}

function EditTeamDialog({ open, onOpenChange, team, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; team: Team; onSaved: () => void }) {
  const [name, setName] = useState(team.name);
  const [players, setPlayers] = useState<string[]>(team.players ?? []);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(team.name);
      setPlayers(team.players ?? []);
    }
  }, [open, team]);

  function updatePlayer(i: number, val: string) {
    setPlayers(p => p.map((x, idx) => (idx === i ? val : x)));
  }
  function removePlayer(i: number) {
    setPlayers(p => p.filter((_, idx) => idx !== i));
  }
  function addPlayer() {
    setPlayers(p => [...p, ""]);
  }

  async function save() {
    if (!name.trim()) { toast.error("Team name required"); return; }
    setBusy(true);
    try {
      const cleaned = players.map(p => p.trim()).filter(Boolean);
      const { error } = await supabase.from("teams")
        .update({ name: name.trim(), players: cleaned })
        .eq("id", team.id);
      if (error) throw error;
      toast.success("Team updated");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update team");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit team</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="etn">Team name</Label>
            <Input id="etn" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Player in-game names</Label>
              <Button type="button" size="sm" variant="outline" onClick={addPlayer}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add player
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-2">Update IGNs whenever players change their names in-game.</p>
            <div className="space-y-2">
              {players.length === 0 && (
                <div className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-3 text-center">
                  No players yet. Add IGNs so future match uploads auto-match this team.
                </div>
              )}
              {players.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-muted border border-border text-[11px] font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                  <Input value={p} onChange={e => updatePlayer(i, e.target.value)} placeholder="Player IGN" />
                  <button
                    type="button"
                    onClick={() => removePlayer(i)}
                    className="text-muted-foreground hover:text-destructive p-1"
                    title="Remove player"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="bg-gradient-gold text-gold-foreground font-semibold">
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function CreateTeamDialog({ userId, onCreated }: { userId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      let logoPath: string | null = null;
      if (file) logoPath = await uploadTeamLogo(userId, file);
      const { error } = await supabase.from("teams").insert({ user_id: userId, name: name.trim(), logo_url: logoPath });
      if (error) throw error;
      toast.success("Team added");
      setName(""); setFile(null); setOpen(false); onCreated();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-gold text-gold-foreground font-semibold"><Plus className="w-4 h-4 mr-1" /> Add Team</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Register a team</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="tn">Full team name</Label>
            <Input id="tn" value={name} onChange={e => setName(e.target.value)} placeholder="Total Gaming Esports" />
          </div>
          <div>
            <Label>Team logo</Label>
            <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} className="block text-sm mt-1" />
          </div>
          <Button onClick={save} disabled={busy} className="w-full bg-gradient-gold text-gold-foreground font-semibold">
            {busy ? "Saving…" : "Save team"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
