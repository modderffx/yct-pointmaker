import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Home, Swords, Users, Trophy, Settings as SettingsIcon, LogOut, Grid3x3, MoreVertical, Rocket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import freeFireLogo from "@/assets/free-fire-logo.png.asset.json";
import rankforgeLogo from "@/assets/rankforge-logo.png.asset.json";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const nav = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/tournaments", label: "Tournaments", icon: Swords },
  { to: "/teams", label: "Teams", icon: Users },
] as const;

const moreNav = [
  { to: "/slots", label: "Slots", icon: Grid3x3 },
  { to: "/standings", label: "Standings", icon: Trophy },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

type Workspace = "freefire" | "others";
const WORKSPACE_KEY = "yct.workspace";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: s => s.location.pathname });
  const [workspace, setWorkspace] = useState<Workspace>("freefire");

  useEffect(() => {
    const saved = localStorage.getItem(WORKSPACE_KEY);
    if (saved === "others" || saved === "freefire") setWorkspace(saved);
  }, []);

  function selectWorkspace(next: Workspace) {
    setWorkspace(next);
    localStorage.setItem(WORKSPACE_KEY, next);
    if (next === "freefire" && pathname === "/") navigate({ to: "/home" });
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function WorkspaceTabs({ className = "" }: { className?: string }) {
    const base = "flex items-center justify-center h-11 px-5 rounded-md text-xs font-semibold uppercase tracking-wider transition";
    const active = "bg-gradient-gold text-gold-foreground shadow-glow";
    const inactive = "text-muted-foreground hover:text-foreground";
    return (
      <div className={`inline-flex items-center gap-1 rounded-lg border border-border bg-card/60 p-1 ${className}`}>
        <button
          type="button"
          onClick={() => selectWorkspace("freefire")}
          aria-pressed={workspace === "freefire"}
          aria-label="Free Fire workspace"
          className={`${base} ${workspace === "freefire" ? active : inactive}`}
        >
          <img src={freeFireLogo.url} alt="Free Fire" className="h-7 w-[90px] object-contain" />
        </button>
        <button
          type="button"
          onClick={() => selectWorkspace("others")}
          aria-pressed={workspace === "others"}
          className={`${base} min-w-[90px] ${workspace === "others" ? active : inactive}`}
        >
          Others
        </button>
      </div>
    );
  }

  function MoreMenu({ className = "" }: { className?: string }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          className={`inline-flex items-center justify-center rounded-md border border-gold/40 bg-gold/10 text-gold hover:bg-gold hover:text-gold-foreground transition p-2 ${className}`}
          aria-label="More options"
        >
          <MoreVertical className="w-4 h-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>More</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {moreNav.map(item => {
            const Icon = item.icon;
            return (
              <DropdownMenuItem key={item.to} asChild>
                <Link to={item.to} className="flex items-center gap-2 cursor-pointer">
                  <Icon className="w-4 h-4 text-gold" /> {item.label}
                </Link>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive cursor-pointer">
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const showFreeFire = workspace === "freefire";

  return (
    <div className="min-h-screen bg-surface flex">
      <aside className="hidden md:flex w-60 flex-col border-r border-border bg-card/40 backdrop-blur p-4">
        <div className="flex items-center justify-between mb-6 px-2">
          <Link to="/home" className="flex items-center gap-2">
            <img src={rankforgeLogo.url} alt="RankForge" className="w-10 h-10 rounded-lg object-contain" />
            <div>
              <div className="font-display font-bold text-lg leading-none">RankForge</div>
              <div className="text-[10px] uppercase tracking-widest text-gold">Esports</div>
            </div>
          </Link>
          <MoreMenu />
        </div>
        <div className="px-2 mb-4">
          <WorkspaceTabs className="w-full justify-between" />
        </div>
        {showFreeFire && (
          <nav className="flex-1 space-y-1">
            {nav.map(item => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link key={item.to} to={item.to}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition ${active ? "bg-gold/15 text-gold border border-gold/30" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
      </aside>

      {/* mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-card/90 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <Link to="/home" className="flex items-center gap-2">
            <img src={rankforgeLogo.url} alt="RankForge" className="w-8 h-8 rounded-md object-contain" />
            <span className="font-display font-bold">RankForge</span>
          </Link>
          <MoreMenu />
        </div>
        <div className="px-4 pb-2 flex justify-center">
          <WorkspaceTabs />
        </div>
      </div>
      {showFreeFire && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur border-t border-border flex">
          {nav.map(item => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to} className={`flex-1 flex flex-col items-center justify-center py-2 text-[10px] ${active ? "text-gold" : "text-muted-foreground"}`}>
                <Icon className="w-5 h-5 mb-0.5" />
                {item.label.split(" ")[0]}
              </Link>
            );
          })}
        </nav>
      )}

      <main className="flex-1 min-w-0 pt-24 pb-20 md:pt-0 md:pb-0">
        <div className="max-w-6xl mx-auto p-4 md:p-8">
          {showFreeFire ? children : <ComingSoon />}
        </div>
      </main>
    </div>
  );
}

function ComingSoon() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-gold flex items-center justify-center mb-6 shadow-glow">
          <Rocket className="w-8 h-8 text-gold-foreground" />
        </div>
        <div className="text-xs uppercase tracking-widest text-gold mb-2">Other Games</div>
        <h1 className="text-3xl md:text-4xl font-display font-bold mb-3">Coming Soon</h1>
        <p className="text-muted-foreground">
          Support for games like <span className="text-foreground font-medium">Call of Duty</span> and{" "}
          <span className="text-foreground font-medium">PUBG</span> is on the way. Stay tuned — the arena is expanding.
        </p>
      </div>
    </div>
  );
}
