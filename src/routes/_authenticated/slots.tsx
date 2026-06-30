import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Grid3x3, Download, Shield } from "lucide-react";
import { toPng } from "html-to-image";
import { THEMES, THEME_LIST, type ExportTheme, type ThemeKey } from "@/lib/standings-themes";

export const Route = createFileRoute("/_authenticated/slots")({
  head: () => ({ meta: [{ title: "Slot List — FireArena" }] }),
  component: SlotsPage,
});

const THEME_KEY_LS = "firearena.exportTheme";
const SLOT_LS = (tid: string) => `firearena.slots.${tid}`;
const SLOT_COUNT_LS = (tid: string) => `firearena.slots.${tid}.count`;

type Team = { id: string; name: string; logo_url: string | null };

function SlotsPage() {
  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [tournamentId, setTournamentId] = useState<string>("");
  const [slotCount, setSlotCount] = useState<12 | 18>(12);
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [themeKey, setThemeKey] = useState<ThemeKey>(() => {
    if (typeof window === "undefined") return "cyber-dark";
    const saved = window.localStorage.getItem(THEME_KEY_LS) as ThemeKey | null;
    return saved && THEMES[saved] ? saved : "cyber-dark";
  });
  const theme = THEMES[themeKey];

  function selectTheme(k: ThemeKey) {
    setThemeKey(k);
    try { window.localStorage.setItem(THEME_KEY_LS, k); } catch { /* ignore */ }
  }

  const tournaments = useQuery({
    queryKey: ["tournaments"],
    queryFn: async () => (await supabase.from("tournaments").select("id,name").order("created_at", { ascending: false })).data ?? [],
  });

  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await supabase.from("teams").select("id,name,logo_url").order("name")).data ?? [],
  });

  // Auto-select first tournament
  useEffect(() => {
    if (!tournamentId && tournaments.data && tournaments.data.length > 0) {
      setTournamentId(tournaments.data[0].id);
    }
  }, [tournaments.data, tournamentId]);

  // Load saved assignments when tournament changes
  useEffect(() => {
    if (!tournamentId || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SLOT_LS(tournamentId));
      setAssignments(raw ? JSON.parse(raw) : {});
      const c = window.localStorage.getItem(SLOT_COUNT_LS(tournamentId));
      setSlotCount(c === "18" ? 18 : 12);
    } catch {
      setAssignments({});
    }
  }, [tournamentId]);

  function persist(next: Record<number, string>) {
    setAssignments(next);
    if (tournamentId) {
      try { window.localStorage.setItem(SLOT_LS(tournamentId), JSON.stringify(next)); } catch { /* ignore */ }
    }
  }

  function setSlot(slot: number, teamId: string) {
    const next = { ...assignments };
    if (teamId) next[slot] = teamId;
    else delete next[slot];
    persist(next);
  }

  function changeSlotCount(n: 12 | 18) {
    setSlotCount(n);
    if (tournamentId) {
      try { window.localStorage.setItem(SLOT_COUNT_LS(tournamentId), String(n)); } catch { /* ignore */ }
    }
  }

  const teamsById = useMemo(() => {
    const m = new Map<string, Team>();
    for (const t of teams.data ?? []) m.set(t.id, t);
    return m;
  }, [teams.data]);

  const tournamentName = useMemo(
    () => tournaments.data?.find(t => t.id === tournamentId)?.name ?? "Tournament",
    [tournaments.data, tournamentId],
  );

  const handleExport = async () => {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(exportRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: themeKey === "minimal-pastel" ? "#fafaff" : "#0b0c10",
      });
      const link = document.createElement("a");
      link.download = `slot-list-${themeKey}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setExporting(false);
    }
  };

  const slots = Array.from({ length: slotCount }, (_, i) => {
    const idx = i + 1;
    const teamId = assignments[idx];
    return { slot: idx, team: teamId ? teamsById.get(teamId) ?? null : null };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-2">
            <Grid3x3 className="w-7 h-7 text-gold" /> Slot List
          </h1>
          <p className="text-muted-foreground">Assign registered teams to competitive slots and export a graphic.</p>
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-xl border border-border bg-card p-4 grid gap-4 md:grid-cols-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Tournament</div>
          <select
            value={tournamentId}
            onChange={e => setTournamentId(e.target.value)}
            className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm"
          >
            <option value="">Select tournament…</option>
            {tournaments.data?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Slot count</div>
          <div className="flex gap-2">
            {([12, 18] as const).map(n => (
              <button
                key={n}
                onClick={() => changeSlotCount(n)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                  slotCount === n ? "border-gold bg-gold/10 text-gold" : "border-border hover:border-gold/40"
                }`}
              >
                {n} slots
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-end">
          <Button onClick={handleExport} disabled={exporting || !tournamentId} className="w-full bg-gold text-black hover:bg-gold/90 font-display">
            <Download className="w-4 h-4 mr-2" />
            {exporting ? "Exporting…" : "Export Slot List Graphic"}
          </Button>
        </div>
      </div>

      {/* Theme selector (mirrors standings) */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Export template (shared with Standings)</div>
        <div className="grid sm:grid-cols-3 gap-2">
          {THEME_LIST.map(t => {
            const active = t.key === themeKey;
            return (
              <button
                key={t.key}
                onClick={() => selectTheme(t.key)}
                className={`text-left rounded-lg border p-3 transition ${active ? "border-gold ring-2 ring-gold/40" : "border-border hover:border-gold/40"}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md flex-shrink-0" style={{ background: t.swatch }} />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">{t.label}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{t.description}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Editable grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {slots.map(({ slot, team }) => (
          <div key={slot} className="rounded-lg border border-border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Slot</div>
              <div className="font-display font-bold text-gold">#{slot}</div>
            </div>
            <select
              value={assignments[slot] ?? ""}
              onChange={e => setSlot(slot, e.target.value)}
              className="w-full bg-input border border-border rounded-md px-2 py-1.5 text-xs"
            >
              <option value="">— Unassigned —</option>
              {teams.data?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <div className="text-xs font-medium truncate min-h-[1rem]">
              {team?.name ?? <span className="text-muted-foreground">Empty</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Off-screen export canvas */}
      <div style={{ position: "fixed", left: "-10000px", top: 0, pointerEvents: "none" }} aria-hidden>
        <SlotExportCard ref={exportRef} tournamentName={tournamentName} slots={slots} theme={theme} />
      </div>
    </div>
  );
}

type SlotEntry = { slot: number; team: Team | null };

const SlotExportCard = ({
  ref, tournamentName, slots, theme,
}: { ref: React.Ref<HTMLDivElement>; tournamentName: string; slots: SlotEntry[]; theme: ExportTheme }) => {
  const cols = slots.length > 12 ? 3 : 2;
  return (
    <div
      ref={ref}
      style={{
        width: 1080,
        height: 1920,
        background: theme.background,
        color: theme.bodyText,
        fontFamily: theme.fontFamily,
        padding: "72px 64px",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: theme.iconBg, display: "grid", placeItems: "center" }}>
            <Grid3x3 size={32} color={theme.iconColor} strokeWidth={2.5} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 4, color: theme.brandLabelColor, textTransform: "uppercase" }}>
            {theme.brandLabel}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 6 }}>
          <div style={{ height: 6, width: 80, background: theme.accentBar, borderRadius: 4 }} />
          <h1 style={{ fontSize: 64, lineHeight: 1.05, fontWeight: 900, letterSpacing: theme.titleLetterSpacing, textTransform: theme.titleTransform, margin: 0, color: theme.titleColor, textShadow: theme.titleShadow }}>
            {tournamentName} — Official Slot List
          </h1>
        </div>
        <div style={{ fontSize: 18, color: theme.mutedText, marginTop: 6, letterSpacing: 1 }}>
          {slots.length} competitive slots
        </div>
      </div>

      <div
        style={{
          marginTop: 48,
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 16,
          flex: 1,
        }}
      >
        {slots.map(({ slot, team }) => (
          <div
            key={slot}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "18px 22px",
              borderRadius: 12,
              background: theme.rowBg,
              border: `1px solid ${theme.rowBorder}`,
              borderLeft: `5px solid ${theme.brandLabelColor}`,
              minHeight: 90,
            }}
          >
            <div
              style={{
                fontSize: 42,
                fontWeight: 900,
                color: theme.totalColor,
                textShadow: theme.totalShadow,
                minWidth: 70,
              }}
            >
              {String(slot).padStart(2, "0")}
            </div>
            <div
              style={{
                width: 56, height: 56, borderRadius: 10,
                background: "linear-gradient(135deg,#1f2937,#111827)",
                border: `1px solid ${theme.rowBorder}`,
                display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden",
              }}
            >
              {team?.logo_url ? (
                <img src={team.logo_url} alt="" width={56} height={56} style={{ objectFit: "cover" }} crossOrigin="anonymous" />
              ) : (
                <Shield size={28} color="#6b7280" />
              )}
            </div>
            <div
              style={{
                fontSize: 24, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.2,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                color: team ? theme.bodyText : theme.mutedText,
                flex: 1, minWidth: 0,
              }}
            >
              {team?.name ?? "— Open Slot —"}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 32,
          padding: "20px 24px",
          borderRadius: 12,
          background: theme.footerBg,
          border: `1px solid ${theme.rowBorder}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 16,
          letterSpacing: 1,
        }}
      >
        <div style={{ textTransform: "uppercase", fontWeight: 700, color: theme.footerText }}>
          Generated automatically by FireArena AI
        </div>
        <div style={{ color: theme.footerMuted }}>firearena.app</div>
      </div>
    </div>
  );
};
