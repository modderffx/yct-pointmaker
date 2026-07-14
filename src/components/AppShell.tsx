import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Flame, Home, Swords, Users, Trophy, Settings as SettingsIcon, LogOut, Grid3x3, MoreVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
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

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: s => s.location.pathname });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
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

  return (
    <div className="min-h-screen bg-surface flex">
      <aside className="hidden md:flex w-60 flex-col border-r border-border bg-card/40 backdrop-blur p-4">
        <div className="flex items-center justify-between mb-8 px-2">
          <Link to="/home" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-gold flex items-center justify-center">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <div className="font-display font-bold text-lg leading-none">YCT PointMaker</div>
              <div className="text-[10px] uppercase tracking-widest text-gold">Esports</div>
            </div>
          </Link>
          <MoreMenu />
        </div>
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
      </aside>

      {/* mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-card/90 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <Link to="/home" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-gradient-gold flex items-center justify-center"><Flame className="w-4 h-4" /></div>
            <span className="font-display font-bold">YCT PointMaker</span>
          </Link>
          <MoreMenu />
        </div>
      </div>
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

      <main className="flex-1 min-w-0 pt-14 pb-20 md:pt-0 md:pb-0">
        <div className="max-w-6xl mx-auto p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
