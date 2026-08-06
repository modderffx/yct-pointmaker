import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Globe2, Plus, MessageCircle, ScrollText, ShieldCheck, Check, Trash2,
  CalendarDays, Coins, Users as UsersIcon, X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/community")({
  head: () => ({
    meta: [
      { title: "Community Tournament Hub — RankForge" },
      { name: "description", content: "Browse ongoing and upcoming community esports tournaments, view rules and slots, and contact organizers on WhatsApp." },
      { property: "og:title", content: "Community Tournament Hub — RankForge" },
      { property: "og:description", content: "Discover approved community tournaments, prize pools, slots and organizer contacts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CommunityPage,
});

type Listing = {
  id: string;
  user_id: string;
  name: string;
  game_title: string;
  start_at: string;
  prize_pool: string | null;
  entry_fee: string | null;
  rules: string | null;
  whatsapp: string;
  slots_total: number;
  slots_taken: number;
  slot_list: string[];
  status: string;
  created_at: string;
};

function waLink(number: string, name: string) {
  const digits = number.replace(/[^0-9]/g, "");
  const msg = `Hi! I'd like to register for "${name}" listed on RankForge. Could you share the details?`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
}

function CommunityPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"ongoing" | "upcoming">("ongoing");
  const [showForm, setShowForm] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [rulesOf, setRulesOf] = useState<Listing | null>(null);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? ""));
  }, []);

  const isAdmin = useQuery({
    queryKey: ["is-admin", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      return data === true;
    },
  });

  const approved = useQuery({
    queryKey: ["community-approved"],
    queryFn: async () => {
      const { data, error } = await supabase.from("community_tournaments")
        .select("*").eq("status", "approved").order("start_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Listing[];
    },
  });

  const pending = useQuery({
    queryKey: ["community-pending"],
    enabled: isAdmin.data === true,
    queryFn: async () => {
      const { data, error } = await supabase.from("community_tournaments")
        .select("*").eq("status", "pending").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Listing[];
    },
  });

  const now = Date.now();
  const filtered = useMemo(() => {
    const rows = approved.data ?? [];
    return rows.filter(r =>
      tab === "ongoing"
        ? new Date(r.start_at).getTime() <= now
        : new Date(r.start_at).getTime() > now
    );
  }, [approved.data, tab, now]);

  async function moderate(id: string, action: "approve" | "reject") {
    try {
      if (action === "approve") {
        const { error } = await supabase.from("community_tournaments")
          .update({ status: "approved" }).eq("id", id);
        if (error) throw error;
        toast.success("Tournament approved — now live on the feed");
      } else {
        const { error } = await supabase.from("community_tournaments").delete().eq("id", id);
        if (error) throw error;
        toast.success("Submission deleted");
      }
      qc.invalidateQueries({ queryKey: ["community-pending"] });
      qc.invalidateQueries({ queryKey: ["community-approved"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-2">
            <Globe2 className="w-7 h-7 text-gold" /> Community Tournament Hub
          </h1>
          <p className="text-muted-foreground">Verified community events — contact organizers directly to register.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin.data && (
            <Button variant="outline" onClick={() => setShowAdmin(true)} className="border-gold text-gold hover:bg-gold hover:text-gold-foreground">
              <ShieldCheck className="w-4 h-4 mr-1" /> Admin Moderation
              {(pending.data?.length ?? 0) > 0 && (
                <span className="ml-2 rounded-full bg-gold text-gold-foreground px-1.5 text-xs font-bold">{pending.data?.length}</span>
              )}
            </Button>
          )}
          <Button onClick={() => setShowForm(true)} className="bg-gradient-gold text-gold-foreground font-semibold">
            <Plus className="w-4 h-4 mr-1" /> List My Tournament
          </Button>
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-border bg-card p-1">
        {(["ongoing", "upcoming"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold capitalize transition ${tab === t ? "bg-gradient-gold text-gold-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t === "ongoing" ? "🔴 Ongoing" : "🟡 Upcoming"}
          </button>
        ))}
      </div>

      {approved.isLoading && <div className="text-sm text-muted-foreground">Loading events…</div>}
      {!approved.isLoading && filtered.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No {tab} tournaments listed right now.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map(t => (
          <article key={t.id} className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display font-bold text-lg truncate">{t.name}</h2>
                <div className="text-xs text-muted-foreground">{t.game_title}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${tab === "ongoing" ? "bg-destructive/15 text-destructive" : "bg-gold/15 text-gold"}`}>
                {tab === "ongoing" ? "🔴 On-going" : "🟡 Upcoming"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-1.5"><Coins className="w-4 h-4 text-gold" /> {t.prize_pool || "—"}</div>
              <div className="flex items-center gap-1.5"><UsersIcon className="w-4 h-4 text-gold" /> Slots: {t.slots_taken}/{t.slots_total}</div>
              <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground">
                <CalendarDays className="w-4 h-4 text-gold" /> {new Date(t.start_at).toLocaleString()}
              </div>
              {t.entry_fee && <div className="col-span-2 text-xs text-muted-foreground">Entry fee: {t.entry_fee}</div>}
            </div>
            <div className="flex gap-2 pt-1">
              <a
                href={waLink(t.whatsapp, t.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-gradient-gold text-gold-foreground px-3 py-2 text-sm font-semibold"
              >
                <MessageCircle className="w-4 h-4" /> Contact Organizer
              </a>
              <button
                onClick={() => setRulesOf(t)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:border-gold/60"
              >
                <ScrollText className="w-4 h-4 text-gold" /> View Rules
              </button>
            </div>
          </article>
        ))}
      </div>

      <Dialog open={!!rulesOf} onOpenChange={o => !o && setRulesOf(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{rulesOf?.name}</DialogTitle>
            <DialogDescription>{rulesOf?.game_title} · Slots {rulesOf?.slots_taken}/{rulesOf?.slots_total}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-1">Rules</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{rulesOf?.rules || "No rules provided."}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-1">Slot list</h3>
              {(rulesOf?.slot_list ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No teams registered yet.</p>
              ) : (
                <ol className="text-sm space-y-1 list-decimal list-inside">
                  {rulesOf?.slot_list.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SubmitDialog open={showForm} onOpenChange={setShowForm} userId={userId} />

      <Dialog open={showAdmin} onOpenChange={setShowAdmin}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-gold" /> Admin Moderation</DialogTitle>
            <DialogDescription>Pending submissions awaiting review.</DialogDescription>
          </DialogHeader>
          {(pending.data ?? []).length === 0 && (
            <div className="text-sm text-muted-foreground py-6 text-center">Nothing pending. All clear.</div>
          )}
          <div className="space-y-3">
            {pending.data?.map(p => (
              <div key={p.id} className="rounded-lg border border-border p-4 space-y-2">
                <div className="font-display font-bold">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.game_title} · {new Date(p.start_at).toLocaleString()}</div>
                <div className="text-sm">Prize: {p.prize_pool || "—"} · Entry: {p.entry_fee || "—"} · Slots: {p.slots_total}</div>
                <div className="text-sm">WhatsApp: <span className="font-medium">{p.whatsapp}</span></div>
                {p.rules && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{p.rules}</p>}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => moderate(p.id, "approve")} className="bg-gradient-gold text-gold-foreground">
                    <Check className="w-4 h-4 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => moderate(p.id, "reject")}>
                    <Trash2 className="w-4 h-4 mr-1" /> Reject / Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SubmitDialog({ open, onOpenChange, userId }: { open: boolean; onOpenChange: (o: boolean) => void; userId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "", game_title: "Free Fire", start_at: "", prize_pool: "", entry_fee: "",
    rules: "", whatsapp: "", slots_total: 12,
  });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function submit() {
    if (!form.name.trim() || !form.game_title.trim() || !form.start_at || !form.whatsapp.trim()) {
      toast.error("Name, game, start date and WhatsApp number are required");
      return;
    }
    if (form.whatsapp.replace(/[^0-9]/g, "").length < 8) {
      toast.error("Enter a valid WhatsApp number with country code");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("community_tournaments").insert({
        user_id: userId,
        name: form.name.trim().slice(0, 120),
        game_title: form.game_title.trim().slice(0, 60),
        start_at: new Date(form.start_at).toISOString(),
        prize_pool: form.prize_pool.trim().slice(0, 60) || null,
        entry_fee: form.entry_fee.trim().slice(0, 60) || null,
        rules: form.rules.trim().slice(0, 4000) || null,
        whatsapp: form.whatsapp.trim().slice(0, 25),
        slots_total: Math.max(2, Math.min(100, Number(form.slots_total) || 12)),
        status: "pending",
      });
      if (error) throw error;
      toast.success("Submitted for review! Your tournament will go live on the feed once verified by an admin.");
      qc.invalidateQueries({ queryKey: ["community-pending"] });
      onOpenChange(false);
      setForm({ name: "", game_title: "Free Fire", start_at: "", prize_pool: "", entry_fee: "", rules: "", whatsapp: "", slots_total: 12 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>List my tournament</DialogTitle>
          <DialogDescription>Submissions go live after an admin verifies them.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="ct-name">Tournament name</Label>
            <Input id="ct-name" maxLength={120} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. YCT Weekly Clash" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ct-game">Game title</Label>
              <Input id="ct-game" maxLength={60} value={form.game_title} onChange={e => set("game_title", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ct-slots">Total slots</Label>
              <Input id="ct-slots" type="number" min={2} max={100} value={form.slots_total} onChange={e => set("slots_total", Number(e.target.value))} />
            </div>
          </div>
          <div>
            <Label htmlFor="ct-date">Start date &amp; time</Label>
            <Input id="ct-date" type="datetime-local" value={form.start_at} onChange={e => set("start_at", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ct-prize">Prize pool</Label>
              <Input id="ct-prize" maxLength={60} value={form.prize_pool} onChange={e => set("prize_pool", e.target.value)} placeholder="LKR 10,000" />
            </div>
            <div>
              <Label htmlFor="ct-fee">Entry fee</Label>
              <Input id="ct-fee" maxLength={60} value={form.entry_fee} onChange={e => set("entry_fee", e.target.value)} placeholder="Free" />
            </div>
          </div>
          <div>
            <Label htmlFor="ct-wa">WhatsApp contact number</Label>
            <Input id="ct-wa" maxLength={25} value={form.whatsapp} onChange={e => set("whatsapp", e.target.value)} placeholder="+94771234567" />
          </div>
          <div>
            <Label htmlFor="ct-rules">Rules</Label>
            <Textarea id="ct-rules" maxLength={4000} rows={5} value={form.rules} onChange={e => set("rules", e.target.value)} placeholder="Format, device restrictions, point system, penalties…" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={submit} disabled={saving} className="bg-gradient-gold text-gold-foreground font-semibold flex-1">
              {saving ? "Submitting…" : "Submit for review"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
