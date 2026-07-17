export type ThemeKey = "rankforge-default" | "cyber-dark" | "esports-fire" | "minimal-pastel";

export type PodiumStyle = { bg: string; border: string; glow: string };

export type ExportTheme = {
  key: ThemeKey;
  label: string;
  description: string;
  background: string;
  rowBg: string;
  rowBorder: string;
  headerText: string;
  bodyText: string;
  mutedText: string;
  brandLabel: string;
  brandLabelColor: string;
  titleColor: string;
  titleShadow: string;
  accentBar: string;
  iconBg: string;
  iconColor: string;
  killsColor: string;
  placementColor: string;
  totalColor: string;
  totalShadow: string;
  footerBg: string;
  footerText: string;
  footerMuted: string;
  fontFamily: string;
  titleLetterSpacing: number;
  titleTransform: "uppercase" | "none";
  podium: PodiumStyle[];
  // UI control swatch
  swatch: string;
};

export const THEMES: Record<ThemeKey, ExportTheme> = {
  "rankforge-default": {
    key: "rankforge-default",
    label: "RankForge Default Sheet",
    description: "Black & white striped point sheet — matches the RankForge broadcast template",
    background: "#ffffff",
    rowBg: "#ffffff",
    rowBorder: "#000000",
    headerText: "#000000",
    bodyText: "#000000",
    mutedText: "#555555",
    brandLabel: "BY RANKFORGE",
    brandLabelColor: "#000000",
    titleColor: "#000000",
    titleShadow: "none",
    accentBar: "#000000",
    iconBg: "#000000",
    iconColor: "#ffffff",
    killsColor: "#000000",
    placementColor: "#000000",
    totalColor: "#000000",
    totalShadow: "none",
    footerBg: "#ffffff",
    footerText: "#000000",
    footerMuted: "#555555",
    fontFamily: "'Inter', system-ui, sans-serif",
    titleLetterSpacing: 4,
    titleTransform: "uppercase",
    podium: [
      { bg: "#ffffff", border: "#000000", glow: "none" },
      { bg: "#ffffff", border: "#000000", glow: "none" },
      { bg: "#ffffff", border: "#000000", glow: "none" },
    ],
    swatch: "linear-gradient(135deg,#ffffff 50%,#000000 50%)",
  },
  "cyber-dark": {
    key: "cyber-dark",
    label: "Cyber Dark",
    description: "Default #0b0c10 with neon accents",
    background:
      "radial-gradient(900px 600px at 0% 0%, rgba(168,85,247,0.22), transparent 60%), radial-gradient(900px 600px at 100% 0%, rgba(236,72,153,0.18), transparent 60%), radial-gradient(900px 700px at 50% 100%, rgba(20,184,166,0.14), transparent 60%), #0b0c10",
    rowBg: "rgba(255,255,255,0.025)",
    rowBorder: "rgba(255,255,255,0.06)",
    headerText: "#9ca3af",
    bodyText: "#ffffff",
    mutedText: "#9ca3af",
    brandLabel: "RankForge Tournament",
    brandLabelColor: "#2dd4bf",
    titleColor: "#ffffff",
    titleShadow: "none",
    accentBar: "linear-gradient(90deg,#ef4444,#f59e0b)",
    iconBg: "linear-gradient(135deg,#ef4444,#f59e0b)",
    iconColor: "#0b0c10",
    killsColor: "#fca5a5",
    placementColor: "#2dd4bf",
    totalColor: "#f4c542",
    totalShadow: "0 0 12px rgba(244,197,66,0.45)",
    footerBg: "linear-gradient(90deg, rgba(168,85,247,0.15), rgba(236,72,153,0.1))",
    footerText: "#e5e7eb",
    footerMuted: "#9ca3af",
    fontFamily: "'Inter', system-ui, sans-serif",
    titleLetterSpacing: 2,
    titleTransform: "uppercase",
    podium: [
      { bg: "linear-gradient(90deg, rgba(255,196,0,0.28), rgba(255,196,0,0.04))", border: "#f4c542", glow: "0 0 24px rgba(244,197,66,0.35)" },
      { bg: "linear-gradient(90deg, rgba(210,210,220,0.22), rgba(210,210,220,0.03))", border: "#c8cdd6", glow: "0 0 18px rgba(200,205,214,0.25)" },
      { bg: "linear-gradient(90deg, rgba(205,127,50,0.24), rgba(205,127,50,0.03))", border: "#cd7f32", glow: "0 0 18px rgba(205,127,50,0.28)" },
    ],
    swatch: "linear-gradient(135deg,#0b0c10,#2dd4bf)",
  },
  "esports-fire": {
    key: "esports-fire",
    label: "Esports Fire",
    description: "Charcoal with bold fire-orange highlights",
    background:
      "radial-gradient(1000px 700px at 50% -10%, rgba(249,115,22,0.35), transparent 60%), radial-gradient(700px 500px at 100% 100%, rgba(239,68,68,0.25), transparent 60%), linear-gradient(180deg, #1a0a04 0%, #0a0606 100%)",
    rowBg: "rgba(255,120,40,0.05)",
    rowBorder: "rgba(249,115,22,0.2)",
    headerText: "#f97316",
    bodyText: "#ffffff",
    mutedText: "#fed7aa",
    brandLabel: "★ Battle Royale Championship ★",
    brandLabelColor: "#f97316",
    titleColor: "#ffedd5",
    titleShadow: "0 0 30px rgba(249,115,22,0.6), 0 4px 0 #7c2d12",
    accentBar: "linear-gradient(90deg,#f97316,#dc2626,#7c2d12)",
    iconBg: "linear-gradient(135deg,#f97316,#dc2626)",
    iconColor: "#0a0606",
    killsColor: "#fbbf24",
    placementColor: "#f97316",
    totalColor: "#fb923c",
    totalShadow: "0 0 18px rgba(251,146,60,0.7)",
    footerBg: "linear-gradient(90deg, rgba(249,115,22,0.25), rgba(220,38,38,0.15))",
    footerText: "#ffedd5",
    footerMuted: "#fed7aa",
    fontFamily: "'Orbitron', 'Inter', system-ui, sans-serif",
    titleLetterSpacing: 6,
    titleTransform: "uppercase",
    podium: [
      { bg: "linear-gradient(90deg, rgba(249,115,22,0.5), rgba(249,115,22,0.05))", border: "#f97316", glow: "0 0 30px rgba(249,115,22,0.6)" },
      { bg: "linear-gradient(90deg, rgba(220,38,38,0.4), rgba(220,38,38,0.05))", border: "#dc2626", glow: "0 0 22px rgba(220,38,38,0.5)" },
      { bg: "linear-gradient(90deg, rgba(180,83,9,0.4), rgba(180,83,9,0.05))", border: "#b45309", glow: "0 0 20px rgba(180,83,9,0.45)" },
    ],
    swatch: "linear-gradient(135deg,#0a0606,#f97316)",
  },
  "minimal-pastel": {
    key: "minimal-pastel",
    label: "Minimal Pastel",
    description: "Light layout, soft lavender/blue tones",
    background:
      "radial-gradient(900px 600px at 0% 0%, rgba(196,181,253,0.45), transparent 60%), radial-gradient(900px 600px at 100% 0%, rgba(147,197,253,0.4), transparent 60%), linear-gradient(180deg, #fafaff 0%, #eef2ff 100%)",
    rowBg: "rgba(255,255,255,0.7)",
    rowBorder: "rgba(99,102,241,0.15)",
    headerText: "#6366f1",
    bodyText: "#1e1b4b",
    mutedText: "#6b7280",
    brandLabel: "RankForge Tournament",
    brandLabelColor: "#6366f1",
    titleColor: "#1e1b4b",
    titleShadow: "none",
    accentBar: "linear-gradient(90deg,#a78bfa,#60a5fa)",
    iconBg: "linear-gradient(135deg,#a78bfa,#60a5fa)",
    iconColor: "#ffffff",
    killsColor: "#e11d48",
    placementColor: "#0891b2",
    totalColor: "#6d28d9",
    totalShadow: "none",
    footerBg: "linear-gradient(90deg, rgba(196,181,253,0.35), rgba(147,197,253,0.3))",
    footerText: "#1e1b4b",
    footerMuted: "#6b7280",
    fontFamily: "'Inter', system-ui, sans-serif",
    titleLetterSpacing: 1,
    titleTransform: "uppercase",
    podium: [
      { bg: "linear-gradient(90deg, rgba(253,224,71,0.35), rgba(253,224,71,0.05))", border: "#eab308", glow: "0 4px 16px rgba(234,179,8,0.2)" },
      { bg: "linear-gradient(90deg, rgba(186,230,253,0.5), rgba(186,230,253,0.05))", border: "#38bdf8", glow: "0 4px 16px rgba(56,189,248,0.2)" },
      { bg: "linear-gradient(90deg, rgba(254,205,211,0.5), rgba(254,205,211,0.05))", border: "#fb7185", glow: "0 4px 16px rgba(251,113,133,0.2)" },
    ],
    swatch: "linear-gradient(135deg,#eef2ff,#a78bfa)",
  },
};

export const THEME_LIST = Object.values(THEMES);
