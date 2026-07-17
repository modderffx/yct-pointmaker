import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Download, Shield } from "lucide-react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLogoUrl } from "@/lib/teams";
import { compareTiebreak } from "@/lib/scoring";
import { THEMES, THEME_LIST, type ExportTheme, type ThemeKey } from "@/lib/standings-themes";

export const Route = createFileRoute("/_authenticated/standings")({
  head: () => ({ meta: [{ title: "Standings — RankForge" }] }),
  component: StandingsPage,
});

type Row = {
  team_id: string | null; team_name: string; logo_url: string | null;
  matches: number; placement_points: number; kill_points: number; kills: number; total: number;
  wins: number;
  lastPlacement?: number;
};

const THEME_KEY_LS = "rankforge.exportTheme";
const SHEET_CONFIG_LS = "rankforge.sheetConfig";

type SheetConfig = { bg: string; title: string; subtitle: string };
const DEFAULT_SHEET_CONFIG: SheetConfig = {
  bg: "#ffffff",
  title: "OVERALL STANDINGS",
  subtitle: "RANKFORGE TOURNAMENT",
};

function StandingsPage() {
  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [tournamentId, setTournamentId] = useState<string>("");
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

  const data = useQuery({
    queryKey: ["standings", tournamentId],
    queryFn: async () => {
      let q = supabase
        .from("match_results")
        .select("team_id,team_name_raw,placement,kills,placement_points,kill_points,total_points,team:teams(name,logo_url),match:matches!inner(tournament_id)");
      if (tournamentId) q = q.eq("match.tournament_id", tournamentId);
      const { data: results } = await q;
      return results ?? [];
    },
  });

  const rows: Row[] = useMemo(() => {
    const map = new Map<string, Row>();
    for (const r of data.data ?? []) {
      const key = r.team_id ?? `raw:${r.team_name_raw}`;
      const team = r.team as { name: string; logo_url: string | null } | null;
      const existing = map.get(key) ?? {
        team_id: r.team_id, team_name: team?.name ?? r.team_name_raw, logo_url: team?.logo_url ?? null,
        matches: 0, placement_points: 0, kill_points: 0, kills: 0, total: 0, wins: 0,
      };
      existing.matches += 1;
      existing.placement_points += r.placement_points;
      existing.kill_points += r.kill_points;
      existing.kills += r.kills;
      existing.total += r.total_points;
      if (r.placement === 1) existing.wins += 1;
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total || b.wins - a.wins || b.kills - a.kills);
  }, [data.data]);

  const [logoDataUrls, setLogoDataUrls] = useState<Record<string, string>>({});

  // Preload team logos as data URLs so the html-to-image export doesn't hit CORS
  // and fail silently.
  async function preloadLogos(rows: Row[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    await Promise.all(rows.map(async r => {
      if (!r.logo_url) return;
      try {
        const signed = /^https?:/.test(r.logo_url) ? r.logo_url : await getLogoUrl(r.logo_url);
        if (!signed) return;
        const res = await fetch(signed);
        if (!res.ok) return;
        const blob = await res.blob();
        const data = await new Promise<string>((res2, rej) => {
          const fr = new FileReader();
          fr.onload = () => res2(fr.result as string);
          fr.onerror = rej;
          fr.readAsDataURL(blob);
        });
        out[r.logo_url] = data;
      } catch { /* ignore individual logo errors */ }
    }));
    return out;
  }

  const handleExport = async () => {
    if (!exportRef.current) { toast.error("Export card not ready"); return; }
    if (rows.length === 0) { toast.error("No results to export yet"); return; }
    setExporting(true);
    try {
      const loaded = await preloadLogos(rows.slice(0, 12));
      setLogoDataUrls(loaded);
      // Wait a tick so the ExportCard re-renders with the inlined logos.
      await new Promise(r => setTimeout(r, 100));
      const dataUrl = await toPng(exportRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: themeKey === "minimal-pastel" ? "#fafaff" : "#0b0c10",
        skipFonts: true,
        filter: (node) => {
          // Skip any <img> that hasn't been converted to a data URL, to avoid
          // canvas tainting from cross-origin storage responses.
          if (node instanceof HTMLImageElement) {
            return node.src.startsWith("data:");
          }
          return true;
        },
      });
      const link = document.createElement("a");
      link.download = `tournament-standings-${themeKey}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Standings exported");
    } catch (err) {
      console.error("Export failed", err);
      toast.error(err instanceof Error ? `Export failed: ${err.message}` : "Export failed");
    } finally {
      setExporting(false);
    }
  };
  // silence unused warnings for the setter that might change independently
  useEffect(() => { void logoDataUrls; }, [logoDataUrls]);

  const top12 = rows.slice(0, 12);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-2"><Trophy className="w-7 h-7 text-gold" /> Standings</h1>
          <p className="text-muted-foreground">Aggregated across all saved matches.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={tournamentId}
            onChange={e => setTournamentId(e.target.value)}
            className="bg-input border border-border rounded-md px-3 py-2 text-sm"
          >
            <option value="">All tournaments</option>
            {tournaments.data?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      {/* Theme selector */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Export template</div>
            <div className="font-display font-semibold">Select Template Theme</div>
          </div>
          <Button onClick={handleExport} disabled={exporting || rows.length === 0} className="bg-gold text-black hover:bg-gold/90 font-display">
            <Download className="w-4 h-4 mr-2" />
            {exporting ? "Exporting…" : "Export Standings"}
          </Button>
        </div>
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

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
          <div className="col-span-1">#</div>
          <div className="col-span-4">Team</div>
          <div className="col-span-1 text-right">M</div>
          <div className="col-span-1 text-right">W</div>
          <div className="col-span-1 text-right">K</div>
          <div className="col-span-2 text-right">Place</div>
          <div className="col-span-2 text-right">Total</div>
        </div>
        {rows.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">No matches scored yet.</div>
        )}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b border-border/50 last:border-0 hover:bg-muted/30">
            <div className={`col-span-1 font-display font-bold ${i===0?"text-gold text-xl":i<3?"text-gold/80":""}`}>{i + 1}</div>
            <div className="col-span-4 font-medium truncate">{r.team_name}</div>
            <div className="col-span-1 text-right text-sm text-muted-foreground">{r.matches}</div>
            <div className="col-span-1 text-right text-sm text-muted-foreground">{r.wins}</div>
            <div className="col-span-1 text-right text-sm">{r.kills}</div>
            <div className="col-span-2 text-right text-sm">{r.placement_points}</div>
            <div className="col-span-2 text-right font-display font-bold text-gold">{r.total}</div>
          </div>
        ))}
      </div>

      {/* Off-screen export canvas */}
      <div style={{ position: "fixed", left: "-10000px", top: 0, pointerEvents: "none" }} aria-hidden>
        <ExportCard ref={exportRef} rows={top12} theme={theme} logoDataUrls={logoDataUrls} />
      </div>
    </div>
  );
}

const ExportCard = ({ ref, rows, theme, logoDataUrls }: { ref: React.Ref<HTMLDivElement>; rows: Row[]; theme: ExportTheme; logoDataUrls: Record<string, string> }) => {
  const slots: (Row | null)[] = Array.from({ length: 12 }, (_, i) => rows[i] ?? null);

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
          <div style={{ width: 56, height: 56, borderRadius: 12, background: theme.iconBg, display: "grid", placeItems: "center", boxShadow: "0 0 30px rgba(0,0,0,0.25)" }}>
            <Trophy size={32} color={theme.iconColor} strokeWidth={2.5} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 4, color: theme.brandLabelColor, textTransform: "uppercase" }}>
            {theme.brandLabel}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 6 }}>
          <div style={{ height: 6, width: 80, background: theme.accentBar, borderRadius: 4 }} />
          <h1 style={{ fontSize: 80, lineHeight: 1, fontWeight: 900, letterSpacing: theme.titleLetterSpacing, textTransform: theme.titleTransform, margin: 0, color: theme.titleColor, textShadow: theme.titleShadow }}>
            Overall Standings
          </h1>
        </div>
        <div style={{ fontSize: 18, color: theme.mutedText, marginTop: 6, letterSpacing: 1 }}>
          Top 12 squads · Ranked by total points
        </div>
      </div>

      <div
        style={{
          marginTop: 48,
          display: "grid",
          gridTemplateColumns: "80px 1fr 110px 110px 140px 160px",
          alignItems: "center",
          padding: "16px 24px",
          fontSize: 16,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 2,
          color: theme.headerText,
          borderBottom: `2px solid ${theme.rowBorder}`,
        }}
      >
        <div>Rank</div>
        <div>Squad</div>
        <div style={{ textAlign: "right" }}>Match</div>
        <div style={{ textAlign: "right" }}>Kills</div>
        <div style={{ textAlign: "right" }}>Placement</div>
        <div style={{ textAlign: "right" }}>Total</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12, flex: 1 }}>
        {slots.map((r, i) => {
          const podium = i < 3 ? theme.podium[i] : null;
          return (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 110px 110px 140px 160px",
                alignItems: "center",
                padding: "14px 24px",
                background: podium ? podium.bg : theme.rowBg,
                borderLeft: podium ? `4px solid ${podium.border}` : `4px solid ${theme.rowBorder}`,
                borderRadius: 10,
                boxShadow: podium ? podium.glow : "none",
                minHeight: 72,
              }}
            >
              <div style={{ fontSize: 36, fontWeight: 900, color: podium ? podium.border : theme.bodyText }}>
                {String(i + 1).padStart(2, "0")}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
                <div
                  style={{
                    width: 48, height: 48, borderRadius: 10,
                    background: "linear-gradient(135deg, #1f2937, #111827)",
                    border: `1px solid ${theme.rowBorder}`,
                    display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden",
                  }}
                >
                  {r?.logo_url && logoDataUrls[r.logo_url] ? (
                    <img src={logoDataUrls[r.logo_url]} alt="" width={48} height={48} style={{ objectFit: "cover" }} />
                  ) : (
                    <Shield size={26} color="#6b7280" />
                  )}
                </div>
                <div
                  style={{
                    fontSize: 26, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    color: r ? theme.bodyText : theme.mutedText,
                  }}
                >
                  {r?.team_name ?? "—"}
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 22, fontWeight: 700, color: theme.mutedText }}>{r?.matches ?? 0}</div>
              <div style={{ textAlign: "right", fontSize: 22, fontWeight: 700, color: theme.killsColor }}>{r?.kills ?? 0}</div>
              <div style={{ textAlign: "right", fontSize: 22, fontWeight: 700, color: theme.placementColor }}>{r?.placement_points ?? 0}</div>
              <div style={{ textAlign: "right", fontSize: 30, fontWeight: 900, color: theme.totalColor, textShadow: theme.totalShadow }}>
                {r?.total ?? 0}
              </div>
            </div>
          );
        })}
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
          Generated automatically by YCT PointMaker AI
        </div>
        <div style={{ color: theme.footerMuted }}>yct-pointmaker.app</div>
      </div>
    </div>
  );
};
