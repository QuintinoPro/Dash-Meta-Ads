"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import rawData from "../data.json";

ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement,
  Title, Tooltip, Legend, Filler
);
ChartJS.defaults.color = "#94a3b8";
ChartJS.defaults.borderColor = "rgba(51,65,85,0.5)";

/* ──────────── types ──────────── */
interface Action { action_type: string; value: string; }
interface CostPerAction { action_type: string; value: string; }
interface Insight {
  campaign_id: string; campaign_name: string; impressions: string; clicks: string;
  spend: string; cpc?: string; cpm?: string; ctr: string; reach: string;
  frequency: string; actions?: Action[]; cost_per_action_type?: CostPerAction[];
  objective?: string; date_start: string; date_stop: string;
  account_id: string; account_name: string;
}
interface Campaign {
  id: string; name: string; status: string; objective: string;
  daily_budget?: string; lifetime_budget?: string; start_time?: string;
  stop_time?: string; account_id: string; account_name: string;
}

const data = rawData as {
  accounts: { id: string; name: string; total_campaigns: number; campaigns_with_data: number }[];
  campaigns: Campaign[];
  insights: Insight[];
  monthly_insights: Insight[];
  daily_insights: Insight[];
};

/* ──────────── helpers ──────────── */
const safeFloat = (v: string | undefined | null): number => { const n = parseFloat(v || "0"); return isNaN(n) ? 0 : n; };
const safeInt = (v: string | undefined | null): number => { const n = parseInt(v || "0", 10); return isNaN(n) ? 0 : n; };
const fmt = (n: number) => (isNaN(n) ? "0,00" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtInt = (n: number) => (isNaN(n) ? "0" : n.toLocaleString("pt-BR"));
const pct = (n: number) => (isNaN(n) ? "0.00%" : n.toFixed(2) + "%");

/* ──── Result type detection ──── */
// Priority order: we check for the most meaningful conversion action
const RESULT_TYPE_PRIORITY: { type: string; label: string }[] = [
  { type: "purchase", label: "Compras" },
  { type: "offsite_conversion.fb_pixel_purchase", label: "Compras" },
  { type: "lead", label: "Leads" },
  { type: "onsite_conversion.lead_grouped", label: "Leads" },
  { type: "offsite_complete_registration_add_meta_leads", label: "Leads (Meta)" },
  { type: "onsite_conversion.messaging_conversation_started_7d", label: "Mensagens" },
  { type: "onsite_conversion.total_messaging_connection", label: "Mensagens" },
  { type: "landing_page_view", label: "Visualizacoes da pagina" },
  { type: "link_click", label: "Cliques no link" },
  { type: "video_view", label: "Visualizacoes de video" },
  { type: "post_engagement", label: "Engajamento" },
  { type: "page_engagement", label: "Engajamento na pagina" },
];

// Objective-to-preferred-result mapping
const OBJECTIVE_RESULT_MAP: Record<string, string[]> = {
  OUTCOME_SALES: ["purchase", "offsite_conversion.fb_pixel_purchase", "onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.total_messaging_connection", "add_to_cart"],
  OUTCOME_LEADS: ["lead", "onsite_conversion.lead_grouped", "offsite_complete_registration_add_meta_leads", "onsite_conversion.messaging_conversation_started_7d"],
  OUTCOME_ENGAGEMENT: ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.total_messaging_connection", "video_view", "post_engagement"],
  OUTCOME_TRAFFIC: ["link_click", "landing_page_view"],
  LINK_CLICKS: ["link_click", "landing_page_view"],
  OUTCOME_AWARENESS: ["video_view", "post_engagement", "page_engagement"],
};

interface ResultInfo { value: number; label: string; actionType: string; }

function detectResult(actions: Action[] | undefined, objective?: string): ResultInfo {
  if (!actions || actions.length === 0) return { value: 0, label: "Resultados", actionType: "" };

  // First: try objective-specific mapping
  if (objective && OBJECTIVE_RESULT_MAP[objective]) {
    for (const type of OBJECTIVE_RESULT_MAP[objective]) {
      const a = actions.find((x) => x.action_type === type);
      if (a && safeFloat(a.value) > 0) {
        const meta = RESULT_TYPE_PRIORITY.find((r) => r.type === type);
        return { value: safeFloat(a.value), label: meta?.label || type, actionType: type };
      }
    }
  }

  // Fallback: use priority list
  for (const rt of RESULT_TYPE_PRIORITY) {
    const a = actions.find((x) => x.action_type === rt.type);
    if (a && safeFloat(a.value) > 0) {
      return { value: safeFloat(a.value), label: rt.label, actionType: rt.type };
    }
  }

  return { value: 0, label: "Resultados", actionType: "" };
}

// For aggregating across multiple campaigns, detect the dominant result type
function detectAggregateResult(insights: Insight[]): { total: number; label: string; actionType: string } {
  // Count which result type appears most across campaigns
  const typeCounts = new Map<string, { count: number; total: number; label: string }>();
  for (const i of insights) {
    const r = detectResult(i.actions, i.objective);
    if (r.value > 0) {
      const cur = typeCounts.get(r.actionType) || { count: 0, total: 0, label: r.label };
      cur.count++;
      cur.total += r.value;
      cur.label = r.label;
      typeCounts.set(r.actionType, cur);
    }
  }
  if (typeCounts.size === 0) return { total: 0, label: "Resultados", actionType: "" };

  // If all same type, use that label; otherwise use generic with breakdown
  if (typeCounts.size === 1) {
    const [actionType, data] = [...typeCounts.entries()][0];
    return { total: data.total, label: data.label, actionType };
  }

  // Mixed types: sum all and use "Resultados (misto)"
  let total = 0;
  typeCounts.forEach((v) => total += v.total);
  return { total, label: "Resultados (misto)", actionType: "mixed" };
}

function getActionValue(actions: Action[] | undefined, type: string): number {
  const a = actions?.find((x) => x.action_type === type);
  return a ? safeFloat(a.value) : 0;
}
const objectiveLabels: Record<string, string> = {
  OUTCOME_TRAFFIC: "Trafego", OUTCOME_ENGAGEMENT: "Engajamento", OUTCOME_SALES: "Vendas",
  OUTCOME_LEADS: "Leads", OUTCOME_AWARENESS: "Reconhecimento", OUTCOME_APP_PROMOTION: "App",
  LINK_CLICKS: "Cliques no Link", POST_ENGAGEMENT: "Engajamento Post", REACH: "Alcance",
  CONVERSIONS: "Conversoes", MESSAGES: "Mensagens", VIDEO_VIEWS: "Visualizacoes",
};

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().substring(0, 10);
}

/* ──────────── recommendations engine ──────────── */
function generateRecommendations(insight: Insight, campaign?: Campaign): string[] {
  const recs: string[] = [];
  const ctr = safeFloat(insight.ctr);
  const cpc = safeFloat(insight.cpc);
  const spend = safeFloat(insight.spend);
  const impressions = safeInt(insight.impressions);
  const clicks = safeInt(insight.clicks);
  const freq = safeFloat(insight.frequency);
  const linkClicks = getActionValue(insight.actions, "link_click");
  const resultInfo = detectResult(insight.actions, insight.objective);
  const results = resultInfo.value;
  const costPerResult = results > 0 ? spend / results : 0;

  if (ctr < 0.8) recs.push("CTR muito baixo (<0.8%). Teste novos criativos com hooks mais fortes nos primeiros 3 segundos.");
  else if (ctr < 1.5) recs.push("CTR mediano. Teste variacoes de headline e imagem para melhorar.");
  else if (ctr > 3) recs.push("CTR excelente! Considere escalar o orcamento gradualmente (20-30% por vez).");

  if (cpc > 5) recs.push("CPC alto (>R$5). Revise a segmentacao - publico pode estar muito restrito ou competitivo.");
  else if (cpc > 0 && cpc < 0.5) recs.push("CPC muito baixo. Excelente eficiencia - candidate a escalar.");

  if (freq > 3) recs.push(`Frequencia alta (${freq.toFixed(1)}x). Risco de fadiga. Troque os criativos ou expanda o publico.`);
  if (impressions > 10000 && clicks < 50) recs.push("Muitas impressoes, poucos cliques. Teste UGC ou formato carrossel.");

  if (results > 0 && costPerResult > 20) recs.push(`Custo por resultado alto (R$${fmt(costPerResult)}). Otimize o CTA, teste publicos lookalike e novos criativos.`);
  else if (results > 0 && costPerResult < 5) recs.push(`Custo por resultado excelente (R$${fmt(costPerResult)}). Escale o orcamento com cuidado.`);

  if (spend > 50 && results === 0 && linkClicks < 5) recs.push("Gastando sem resultados. Verifique pixel/eventos e revise a estrategia.");

  if (campaign?.status === "PAUSED") {
    if (results > 0 && costPerResult < 10) recs.push("Campanha pausada com bom custo por resultado. Considere reativar.");
    else recs.push("Campanha pausada. Metricas nao justificam reativacao sem mudancas.");
  }

  if (recs.length === 0) recs.push("Metricas dentro da media. Monitore e faca testes A/B incrementais.");
  return recs;
}

/* ──────────── aggregate helper ──────────── */
function aggregateInsights(items: Insight[]) {
  const spend = items.reduce((s, i) => s + safeFloat(i.spend), 0);
  const impressions = items.reduce((s, i) => s + safeInt(i.impressions), 0);
  const clicks = items.reduce((s, i) => s + safeInt(i.clicks), 0);
  const reach = items.reduce((s, i) => s + safeInt(i.reach), 0);
  const linkClicks = items.reduce((s, i) => s + getActionValue(i.actions, "link_click"), 0);
  const aggResult = detectAggregateResult(items);
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  const cplc = linkClicks > 0 ? spend / linkClicks : 0;
  const costPerResult = aggResult.total > 0 ? spend / aggResult.total : 0;
  return { spend, impressions, clicks, reach, linkClicks, results: aggResult.total, resultLabel: aggResult.label, ctr, cpc, cpm, cplc, costPerResult };
}

/* ══════════════════════════════════════════════ */
export default function Dashboard() {
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  const [datePeriod, setDatePeriod] = useState<string>("all");
  const [tab, setTab] = useState<"overview" | "campaigns" | "recommendations">("overview");
  const [showSettings, setShowSettings] = useState(false);
  const [pendingSettings, setPendingSettings] = useState<typeof defaultSettings | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const defaultSettings = {
    userName: "",
    apiToken: "",
    apiVersion: "v21.0",
    appId: "",
    appSecret: "",
  };
  const [settings, setSettings] = useState(defaultSettings);

  // ── Crypto helpers: encrypt/decrypt sensitive fields with AES-GCM ──
  const STORAGE_KEY = "meta-ads-settings";
  const CRYPTO_KEY_NAME = "meta-ads-ck";

  const getCryptoKey = async (): Promise<CryptoKey> => {
    const stored = sessionStorage.getItem(CRYPTO_KEY_NAME);
    if (stored) {
      const raw = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
      return crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt", "decrypt"]);
    }
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const exported = await crypto.subtle.exportKey("raw", key);
    sessionStorage.setItem(CRYPTO_KEY_NAME, btoa(String.fromCharCode(...new Uint8Array(exported))));
    return key;
  };

  const encryptValue = async (value: string): Promise<string> => {
    if (!value) return "";
    const key = await getCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
    const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  };

  const decryptValue = async (encoded: string): Promise<string> => {
    if (!encoded) return "";
    try {
      const key = await getCryptoKey();
      const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);
      const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
      return new TextDecoder().decode(decrypted);
    } catch { return ""; }
  };

  // Load settings from localStorage (decrypt sensitive fields)
  useEffect(() => {
    (async () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;
        const parsed = JSON.parse(saved);
        // Validate shape
        if (typeof parsed !== "object" || parsed === null) return;
        const validated = {
          userName: typeof parsed.userName === "string" ? parsed.userName : "",
          apiToken: typeof parsed.apiToken === "string" ? await decryptValue(parsed.apiToken) : "",
          apiVersion: typeof parsed.apiVersion === "string" ? parsed.apiVersion : "v21.0",
          appId: typeof parsed.appId === "string" ? parsed.appId : "",
          appSecret: typeof parsed.appSecret === "string" ? await decryptValue(parsed.appSecret) : "",
        };
        setSettings(validated);
      } catch { /* corrupted data, start fresh */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSettings = async () => {
    const toStore = {
      userName: settings.userName,
      apiToken: await encryptValue(settings.apiToken),
      apiVersion: settings.apiVersion,
      appId: settings.appId,
      appSecret: await encryptValue(settings.appSecret),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    setSettingsSaved(true);
    setPendingSettings(null);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  const openSettings = () => {
    setPendingSettings({ ...settings });
    setShowSettings(true);
  };

  const cancelSettings = () => {
    if (pendingSettings) setSettings(pendingSettings);
    setPendingSettings(null);
    setShowSettings(false);
  };

  const dateCutoff = useMemo(() => {
    if (datePeriod === "today") return daysAgo(0);
    if (datePeriod === "yesterday") return daysAgo(1);
    if (datePeriod === "7") return daysAgo(7);
    if (datePeriod === "15") return daysAgo(15);
    if (datePeriod === "30") return daysAgo(30);
    if (datePeriod === "90") return daysAgo(90);
    return "";
  }, [datePeriod]);

  const availableCampaigns = useMemo(() => {
    let ins = data.insights;
    if (selectedAccount !== "all") ins = ins.filter((i) => i.account_id === selectedAccount);
    const seen = new Map<string, string>();
    ins.forEach((i) => seen.set(i.campaign_id, i.campaign_name));
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [selectedAccount]);

  const handleAccountChange = (val: string) => {
    setSelectedAccount(val);
    setSelectedCampaign("all");
  };

  const filteredDaily = useMemo(() => {
    let items = data.daily_insights;
    if (selectedAccount !== "all") items = items.filter((i) => i.account_id === selectedAccount);
    if (selectedCampaign !== "all") items = items.filter((i) => i.campaign_id === selectedCampaign);
    if (dateCutoff) items = items.filter((i) => i.date_start >= dateCutoff);
    return items;
  }, [selectedAccount, selectedCampaign, dateCutoff]);

  // Lookup map: campaign_id → objective (for daily records that lack it)
  const campaignObjectiveMap = useMemo(() => {
    const m = new Map<string, string>();
    data.campaigns.forEach((c) => m.set(c.id, c.objective));
    return m;
  }, []);

  const filteredInsights = useMemo(() => {
    if (datePeriod !== "all") {
      // Aggregate daily records per campaign with deep copies to avoid mutating source data
      const map = new Map<string, { base: Insight; actionMap: Map<string, number> }>();
      filteredDaily.forEach((d) => {
        const key = d.campaign_id;
        if (!map.has(key)) {
          const actionMap = new Map<string, number>();
          d.actions?.forEach((a) => actionMap.set(a.action_type, safeFloat(a.value)));
          map.set(key, {
            base: { ...d, spend: d.spend, impressions: d.impressions, clicks: d.clicks, reach: d.reach },
            actionMap,
          });
        } else {
          const entry = map.get(key)!;
          entry.base.spend = String(parseFloat(entry.base.spend) + safeFloat(d.spend));
          entry.base.impressions = String(safeInt(entry.base.impressions) + safeInt(d.impressions));
          entry.base.clicks = String(safeInt(entry.base.clicks) + safeInt(d.clicks));
          entry.base.reach = String(safeInt(entry.base.reach) + safeInt(d.reach));
          d.actions?.forEach((a) => {
            entry.actionMap.set(a.action_type, (entry.actionMap.get(a.action_type) || 0) + safeFloat(a.value));
          });
        }
      });
      return [...map.values()].map(({ base, actionMap }) => {
        const imp = safeInt(base.impressions);
        const clk = safeInt(base.clicks);
        const sp = safeFloat(base.spend);
        const actions: Action[] = [...actionMap.entries()].map(([action_type, value]) => ({ action_type, value: String(value) }));
        // Look up objective from campaigns data (daily records don't have it)
        return {
          ...base,
          actions,
          objective: base.objective || campaignObjectiveMap.get(base.campaign_id),
          cost_per_action_type: undefined,
          ctr: String(imp > 0 ? (clk / imp) * 100 : 0),
          cpc: clk > 0 ? String(sp / clk) : undefined,
          cpm: imp > 0 ? String((sp / imp) * 1000) : undefined,
        } as Insight;
      });
    }
    let ins = data.insights;
    if (selectedAccount !== "all") ins = ins.filter((i) => i.account_id === selectedAccount);
    if (selectedCampaign !== "all") ins = ins.filter((i) => i.campaign_id === selectedCampaign);
    return ins;
  }, [selectedAccount, selectedCampaign, datePeriod, filteredDaily]);

  const filteredCampaigns = useMemo(() => {
    let camps = data.campaigns;
    if (selectedAccount !== "all") camps = camps.filter((c) => c.account_id === selectedAccount);
    if (selectedCampaign !== "all") camps = camps.filter((c) => c.id === selectedCampaign);
    return camps;
  }, [selectedAccount, selectedCampaign]);

  const totals = useMemo(() => aggregateInsights(filteredInsights), [filteredInsights]);

  /* ──── Gasto diario & Resultados trend ──── */
  const trendData = useMemo(() => {
    const items = filteredDaily;
    if (items.length === 0) return null;
    const useDaily = datePeriod !== "all";
    const map = new Map<string, { spend: number; results: number }>();
    items.forEach((i) => {
      const key = useDaily ? i.date_start : i.date_start.substring(0, 7);
      const cur = map.get(key) || { spend: 0, results: 0 };
      cur.spend += safeFloat(i.spend);
      cur.results += detectResult(i.actions, i.objective || campaignObjectiveMap.get(i.campaign_id)).value;
      map.set(key, cur);
    });
    const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return {
      labels: entries.map((e) => e[0]),
      datasets: [
        { label: "Gasto (R$)", data: entries.map((e) => e[1].spend), borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.15)", fill: true, tension: 0.3, yAxisID: "y" },
        { label: "Resultados", data: entries.map((e) => e[1].results), borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.15)", fill: false, tension: 0.3, yAxisID: "y1" },
      ],
    };
  }, [filteredDaily, datePeriod]);

  /* ──── Custo por resultado ao longo do tempo (Opção 1) ──── */
  const cprTrendData = useMemo(() => {
    const items = filteredDaily;
    if (items.length === 0) return null;
    const useDaily = datePeriod !== "all";
    const map = new Map<string, { spend: number; results: number }>();
    items.forEach((i) => {
      const key = useDaily ? i.date_start : i.date_start.substring(0, 7);
      const cur = map.get(key) || { spend: 0, results: 0 };
      cur.spend += safeFloat(i.spend);
      cur.results += detectResult(i.actions, i.objective || campaignObjectiveMap.get(i.campaign_id)).value;
      map.set(key, cur);
    });
    const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const cprValues = entries.map((e) => e[1].results > 0 ? e[1].spend / e[1].results : null);
    // Filter out null entries for a cleaner chart
    if (cprValues.every((v) => v === null)) return null;
    return {
      labels: entries.map((e) => e[0]),
      datasets: [{
        label: "Custo por Resultado (R$)",
        data: cprValues,
        borderColor: "#f97316",
        backgroundColor: "rgba(249,115,22,0.15)",
        fill: true,
        tension: 0.3,
        spanGaps: true,
        pointBackgroundColor: cprValues.map((v) => v === null ? "transparent" : v < 5 ? "#22c55e" : v < 15 ? "#eab308" : "#ef4444"),
        pointRadius: 4,
      }],
    };
  }, [filteredDaily, datePeriod]);

  /* ──── Funil de conversão (Opção 2) ──── */
  const funnelData = useMemo(() => {
    const impressions = filteredInsights.reduce((s, i) => s + safeInt(i.impressions), 0);
    const clicks = filteredInsights.reduce((s, i) => s + safeInt(i.clicks), 0);
    const linkClicks = filteredInsights.reduce((s, i) => s + getActionValue(i.actions, "link_click"), 0);
    const aggResult = detectAggregateResult(filteredInsights);
    return { impressions, clicks, linkClicks, results: aggResult.total, resultLabel: aggResult.label };
  }, [filteredInsights]);

  /* ──── Resultados por campanha (Opção 3 - só múltiplas campanhas) ──── */
  const resultsByCampaignChart = useMemo(() => {
    const items = filteredInsights
      .map((i) => {
        const r = detectResult(i.actions, i.objective);
        const spend = safeFloat(i.spend);
        return { name: i.campaign_name, results: r.value, resultLabel: r.label, spend, cpr: r.value > 0 ? spend / r.value : 0 };
      })
      .filter((i) => i.results > 0)
      .sort((a, b) => b.results - a.results)
      .slice(0, 12);
    if (items.length === 0) return null;
    return {
      labels: items.map((i) => i.name.length > 35 ? i.name.substring(0, 35) + "..." : i.name),
      datasets: [
        {
          label: "Resultados",
          data: items.map((i) => i.results),
          backgroundColor: "#3b82f6",
          borderRadius: 6,
          xAxisID: "x",
        },
        {
          label: "Custo/Resultado (R$)",
          data: items.map((i) => i.cpr),
          backgroundColor: items.map((i) => i.cpr < 5 ? "#22c55e" : i.cpr < 15 ? "#eab308" : "#ef4444"),
          borderRadius: 6,
          xAxisID: "x1",
        },
      ],
    };
  }, [filteredInsights]);

  /* ──── Frequência & CTR ao longo do tempo (fadiga criativa) ──── */
  const fatigueTrendData = useMemo(() => {
    const items = filteredDaily;
    if (items.length === 0) return null;
    const useDaily = datePeriod !== "all";
    const map = new Map<string, { impressions: number; clicks: number; reach: number }>();
    items.forEach((i) => {
      const key = useDaily ? i.date_start : i.date_start.substring(0, 7);
      const cur = map.get(key) || { impressions: 0, clicks: 0, reach: 0 };
      cur.impressions += safeInt(i.impressions);
      cur.clicks += safeInt(i.clicks);
      cur.reach += safeInt(i.reach);
      map.set(key, cur);
    });
    const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const freqData = entries.map((e) => e[1].reach > 0 ? e[1].impressions / e[1].reach : 0);
    const ctrData = entries.map((e) => e[1].impressions > 0 ? (e[1].clicks / e[1].impressions) * 100 : 0);
    if (freqData.every((v) => v === 0)) return null;
    return {
      labels: entries.map((e) => e[0]),
      datasets: [
        { label: "Frequencia", data: freqData, borderColor: "#f97316", backgroundColor: "rgba(249,115,22,0.1)", fill: false, tension: 0.3, yAxisID: "y", pointBackgroundColor: freqData.map((v) => v > 3 ? "#ef4444" : v > 2 ? "#eab308" : "#22c55e"), pointRadius: 4 },
        { label: "CTR (%)", data: ctrData, borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.1)", fill: true, tension: 0.3, yAxisID: "y1" },
      ],
    };
  }, [filteredDaily, datePeriod]);

  const topCampaigns = useMemo(() =>
    [...filteredInsights].sort((a, b) => parseFloat(b.spend) - parseFloat(a.spend)),
  [filteredInsights]);

  const isSingleCampaign = selectedCampaign !== "all";
  const periodLabel = ({ today: "Hoje", yesterday: "Ontem e hoje", "7": "7 dias", "15": "15 dias", "30": "30 dias", "90": "90 dias", all: "" } as Record<string, string>)[datePeriod] || "";

  const hasActiveFilters = selectedAccount !== "all" || selectedCampaign !== "all" || datePeriod !== "all";

  const navItems = [
    { key: "overview" as const, label: "Visao Geral", icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" /></svg> },
    { key: "campaigns" as const, label: "Campanhas", icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h12v2H3v-2z" /></svg> },
    { key: "recommendations" as const, label: "Recomendacoes", icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
  ];

  return (
    <div className="min-h-screen flex">
      {/* ══════════ SIDEBAR ══════════ */}
      <aside className="sidebar">
        {/* Logo / Brand */}
        <div className="px-5 py-5 border-b border-slate-700/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">Meta Ads</h1>
              <p className="text-[10px] text-slate-500 leading-tight">Dashboard</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="px-3 py-4">
          <p className="sidebar-section-label">Navegacao</p>
          <div className="flex flex-col gap-0.5">
            {navItems.map((item) => (
              <button key={item.key} onClick={() => setTab(item.key)}
                className={`sidebar-nav-item ${tab === item.key ? "sidebar-nav-active" : ""}`}>
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Filters */}
        <div className="px-3 py-2 flex-1">
          <p className="sidebar-section-label">Filtros</p>

          <div className="space-y-3 mt-2">
            <div>
              <label className="text-[11px] text-slate-500 font-medium mb-1 block px-1">Conta</label>
              <select value={selectedAccount} onChange={(e) => handleAccountChange(e.target.value)}
                className="sidebar-select">
                <option value="all">Todas as contas</option>
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.campaigns_with_data})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-500 font-medium mb-1 block px-1">Campanha</label>
              <select value={selectedCampaign} onChange={(e) => setSelectedCampaign(e.target.value)}
                className="sidebar-select">
                <option value="all">Todas ({availableCampaigns.length})</option>
                {availableCampaigns.map(([id, name]) => (
                  <option key={id} value={id}>{name.length > 30 ? name.substring(0, 30) + "..." : name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-500 font-medium mb-1 block px-1">Periodo</label>
              <div className="flex flex-col gap-0.5">
                {[
                  { v: "today", l: "Hoje" },
                  { v: "yesterday", l: "Ontem e hoje" },
                  { v: "7", l: "Ultimos 7 dias" },
                  { v: "15", l: "Ultimos 15 dias" },
                  { v: "30", l: "Ultimos 30 dias" },
                  { v: "90", l: "Ultimos 90 dias" },
                  { v: "all", l: "Maximo" },
                ].map((p) => (
                  <button key={p.v} onClick={() => setDatePeriod(p.v)}
                    className="sidebar-date-item">
                    <span className={`sidebar-date-radio ${datePeriod === p.v ? "sidebar-date-radio-active" : ""}`}>
                      {datePeriod === p.v && <span className="sidebar-date-radio-dot" />}
                    </span>
                    <span className={datePeriod === p.v ? "text-blue-400 font-medium" : ""}>{p.l}</span>
                  </button>
                ))}
              </div>
            </div>

            {hasActiveFilters && (
              <button onClick={() => { setSelectedAccount("all"); setSelectedCampaign("all"); setDatePeriod("all"); }}
                className="w-full px-3 py-1.5 rounded-lg text-xs font-medium bg-red-900/30 text-red-400 hover:bg-red-900/50 border border-red-900/40 transition-colors mt-1">
                Limpar filtros
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-slate-700/60 mt-auto space-y-2">
          <button onClick={openSettings}
            className="sidebar-nav-item w-full">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.38.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.38-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span>Configuracoes</span>
          </button>
          <div className="flex items-center gap-2 text-[10px] text-slate-600 px-2">
            <div className={`w-1.5 h-1.5 rounded-full ${settings.apiToken ? "bg-green-500" : "bg-slate-600"}`}></div>
            <span>{settings.apiToken ? "API conectada" : "API nao configurada"} &middot; {data.accounts.length} contas</span>
          </div>
        </div>
      </aside>

      {/* ══════════ MAIN CONTENT ══════════ */}
      <main className="flex-1 min-h-screen overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-[var(--background)]/80 backdrop-blur-md border-b border-slate-800 px-6 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {tab === "overview" ? "Visao Geral" : tab === "campaigns" ? "Campanhas" : "Recomendacoes"}
            </h2>
            {hasActiveFilters && (
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedAccount !== "all" && <span className="text-blue-400">{data.accounts.find(a => a.id === selectedAccount)?.name}</span>}
                {selectedCampaign !== "all" && <span className="text-blue-400">{selectedAccount !== "all" ? " > " : ""}{filteredInsights[0]?.campaign_name}</span>}
                {selectedCampaign !== "all" && (() => { const c = data.campaigns.find(c => c.id === selectedCampaign); return c?.start_time ? <span className="text-slate-600"> · Criada em {new Date(c.start_time).toLocaleDateString("pt-BR")}</span> : null; })()}
                {datePeriod !== "all" && <span className="text-slate-400">{(selectedAccount !== "all" || selectedCampaign !== "all") ? " · " : ""}{periodLabel}</span>}
              </p>
            )}
          </div>
          <p className="text-xs text-slate-600">Graph API v21.0 &middot; {new Date().toLocaleDateString("pt-BR")}</p>
        </div>

        <div className="p-6">

      {/* ══════════ OVERVIEW ══════════ */}
      {tab === "overview" && (
        <>
          {filteredInsights.length === 0 ? (
            <div className="card text-center py-12 text-slate-400">
              Nenhum dado encontrado para os filtros selecionados.
            </div>
          ) : (
            <>
              {/* KPI Cards - focused on what matters */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
                {/* Volume metrics — neutral colors, no good/bad signal */}
                <KPICard label="Gasto Total" value={`R$ ${fmt(totals.spend)}`} color="blue" />
                <KPICard label="Impressoes" value={fmtInt(totals.impressions)} color="blue" />
                <KPICard label="Alcance" value={fmtInt(totals.reach)} color="blue" sub={datePeriod !== "all" ? "Estimado" : undefined} />
                <KPICard label="Cliques" value={fmtInt(totals.clicks)} color="blue" />
                <KPICard label="Cliques no Link" value={fmtInt(totals.linkClicks)} color="blue" />
                {/* Performance metrics — colored by benchmark thresholds */}
                {/* CTR: >2% excelente, 1-2% ok, <1% ruim (Meta benchmark ~1.5%) */}
                <KPICard label="CTR" value={pct(totals.ctr)} color={totals.ctr >= 2 ? "green" : totals.ctr >= 1 ? "yellow" : "red"} />
                {/* CPC: <R$1 otimo, R$1-3 ok, >R$3 caro */}
                <KPICard label="CPC" value={`R$ ${fmt(totals.cpc)}`} color={totals.cpc > 0 && totals.cpc < 1 ? "green" : totals.cpc <= 3 ? "yellow" : "red"} />
                {/* CPM: <R$15 barato, R$15-35 normal, >R$35 caro */}
                <KPICard label="CPM" value={`R$ ${fmt(totals.cpm)}`} color={totals.cpm < 15 ? "green" : totals.cpm <= 35 ? "yellow" : "red"} />
                {/* Resultados — sempre verde (mais = melhor) */}
                <KPICard label="Resultados" value={fmtInt(totals.results)} color={totals.results > 0 ? "green" : "red"} sub={totals.resultLabel} />
                {/* Custo por Resultado: <R$5 otimo, R$5-15 ok, >R$15 caro */}
                <KPICard label="Custo por Resultado" value={totals.costPerResult > 0 ? `R$ ${fmt(totals.costPerResult)}` : "N/A"} color={totals.costPerResult > 0 && totals.costPerResult < 5 ? "green" : totals.costPerResult > 0 && totals.costPerResult <= 15 ? "yellow" : "red"} />
              </div>

              {/* Chart Row 1: Gasto & Resultados + Custo por Resultado (trend) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="card">
                  <h3 className="text-lg font-semibold text-white mb-4">
                    {datePeriod !== "all" ? `Gasto & Resultados (${periodLabel})` : "Gasto & Resultados ao Longo do Tempo"}
                  </h3>
                  {trendData ? (
                    <Line data={trendData} options={{
                      responsive: true, interaction: { mode: "index" as const, intersect: false },
                      scales: {
                        y: { type: "linear" as const, position: "left" as const, title: { display: true, text: "Gasto (R$)" } },
                        y1: { type: "linear" as const, position: "right" as const, grid: { drawOnChartArea: false }, title: { display: true, text: "Resultados" } },
                      },
                    }} />
                  ) : <p className="text-slate-500 text-center py-8">Sem dados de tendencia</p>}
                </div>
                <div className="card">
                  <h3 className="text-lg font-semibold text-white mb-4">
                    {datePeriod !== "all" ? `Custo por Resultado (${periodLabel})` : "Custo por Resultado ao Longo do Tempo"}
                  </h3>
                  {cprTrendData ? (
                    <Line data={cprTrendData} options={{
                      responsive: true, interaction: { mode: "index" as const, intersect: false },
                      plugins: { legend: { display: false } },
                      scales: {
                        y: { type: "linear" as const, title: { display: true, text: "R$ por Resultado" }, beginAtZero: true },
                      },
                    }} />
                  ) : <p className="text-slate-500 text-center py-8">Sem dados de custo por resultado</p>}
                </div>
              </div>

              {/* Chart Row 2: Funil + Frequência & CTR */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Funil de Conversão */}
                <div className="card">
                  <h3 className="text-lg font-semibold text-white mb-4">Funil de Conversao</h3>
                  <FunnelChart data={funnelData} />
                </div>

                {/* Frequência & CTR (fadiga criativa) */}
                <div className="card">
                  <h3 className="text-lg font-semibold text-white mb-1">
                    {datePeriod !== "all" ? `Frequencia & CTR (${periodLabel})` : "Frequencia & CTR"}
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">Freq. subindo + CTR caindo = fadiga criativa</p>
                  {fatigueTrendData ? (
                    <Line data={fatigueTrendData} options={{
                      responsive: true, interaction: { mode: "index" as const, intersect: false },
                      scales: {
                        y: { type: "linear" as const, position: "left" as const, title: { display: true, text: "Frequencia" }, beginAtZero: true },
                        y1: { type: "linear" as const, position: "right" as const, grid: { drawOnChartArea: false }, title: { display: true, text: "CTR (%)" }, beginAtZero: true },
                      },
                      plugins: {
                        tooltip: {
                          callbacks: {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            label: (ctx: any) => {
                              const label = ctx.dataset?.label || "";
                              const val = ctx.parsed?.y;
                              if (val == null) return "";
                              return label.includes("CTR") ? `${label}: ${val.toFixed(2)}%` : `${label}: ${val.toFixed(2)}x`;
                            },
                          },
                        },
                      },
                    }} />
                  ) : <p className="text-slate-500 text-center py-8">Sem dados de tendencia</p>}
                </div>
              </div>

              {/* Chart Row 3: Resultados por Campanha (se múltiplas) */}
              <div className={`grid gap-6 mb-6 ${!isSingleCampaign && resultsByCampaignChart ? "grid-cols-1" : "hidden"}`}>

                {/* Resultados por Campanha - só aparece com múltiplas campanhas */}
                {!isSingleCampaign && resultsByCampaignChart && (
                  <div className="card">
                    <h3 className="text-lg font-semibold text-white mb-4">Resultados por Campanha</h3>
                    <Bar data={resultsByCampaignChart} options={{
                      responsive: true, indexAxis: "y" as const,
                      interaction: { mode: "index" as const, intersect: false },
                      scales: {
                        y: { ticks: { font: { size: 11 } } },
                        x: { type: "linear" as const, position: "bottom" as const, title: { display: true, text: "Resultados" }, grid: { drawOnChartArea: true } },
                        x1: { type: "linear" as const, position: "top" as const, grid: { drawOnChartArea: false }, title: { display: true, text: "Custo/Resultado (R$)" }, display: true },
                      },
                      plugins: {
                        tooltip: {
                          callbacks: {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            label: (ctx: any) => {
                              const label = ctx.dataset?.label || "";
                              const val = ctx.parsed?.x;
                              if (val == null) return "";
                              return label.includes("Custo") ? `${label}: R$ ${val.toFixed(2)}` : `${label}: ${val}`;
                            },
                          },
                        },
                      },
                    }} />
                  </div>
                )}
              </div>

              {/* Campaigns Table */}
              <div className="card">
                <h3 className="text-lg font-semibold text-white mb-4">
                  {isSingleCampaign ? "Detalhes da Campanha" : "Campanhas por Gasto"}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-700">
                        <th className="text-left py-3 px-2">Campanha</th>
                        <th className="text-left py-3 px-2">Conta</th>
                        <th className="text-right py-3 px-2">Orç. Diário</th>
                        <th className="text-right py-3 px-2">Gasto</th>
                        <th className="text-right py-3 px-2">Impressoes</th>
                        <th className="text-right py-3 px-2">Cliques Link</th>
                        <th className="text-right py-3 px-2">CTR</th>
                        <th className="text-right py-3 px-2">CPC</th>
                        <th className="text-right py-3 px-2">Resultados</th>
                        <th className="text-right py-3 px-2">Custo/Result.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topCampaigns.map((i) => {
                        const campaign = data.campaigns.find((c) => c.id === i.campaign_id);
                        const ri = detectResult(i.actions, i.objective);
                        const results = ri.value;
                        const spend = safeFloat(i.spend);
                        const cpr = results > 0 ? spend / results : 0;
                        return (
                          <tr key={i.campaign_id}
                            className="border-b border-slate-700/50 table-row cursor-pointer"
                            onClick={() => { if (!isSingleCampaign) setSelectedCampaign(i.campaign_id); }}
                            title={isSingleCampaign ? undefined : "Clique para filtrar"}>
                            <td className="py-3 px-2 text-white font-medium max-w-[250px] truncate">
                              {!isSingleCampaign && <span className="text-blue-400 mr-1">&#9654;</span>}
                              {i.campaign_name}
                            </td>
                            <td className="py-3 px-2 text-slate-400 text-xs">{i.account_name}</td>
                            <td className="py-3 px-2 text-right">{campaign?.daily_budget ? `R$ ${fmt(safeInt(campaign.daily_budget) / 100)}` : "-"}</td>
                            <td className="py-3 px-2 text-right">R$ {fmt(spend)}</td>
                            <td className="py-3 px-2 text-right">{fmtInt(safeInt(i.impressions))}</td>
                            <td className="py-3 px-2 text-right">{fmtInt(getActionValue(i.actions, "link_click"))}</td>
                            <td className="py-3 px-2 text-right">
                              <span className={safeFloat(i.ctr) > 2 ? "text-green-400" : safeFloat(i.ctr) > 1 ? "text-yellow-400" : "text-red-400"}>
                                {pct(safeFloat(i.ctr))}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right">
                              {safeFloat(i.cpc) > 0 ? (
                                <span className={safeFloat(i.cpc) < 1 ? "text-green-400" : safeFloat(i.cpc) < 3 ? "text-yellow-400" : "text-red-400"}>
                                  R$ {fmt(safeFloat(i.cpc))}
                                </span>
                              ) : "-"}
                            </td>
                            <td className="py-3 px-2 text-right">
                              {results > 0 ? (
                                <div><span className="font-semibold text-white">{fmtInt(results)}</span><br/><span className="text-xs text-slate-500">{ri.label}</span></div>
                              ) : "-"}
                            </td>
                            <td className="py-3 px-2 text-right">
                              {cpr > 0 ? (
                                <span className={cpr < 5 ? "text-green-400 font-semibold" : cpr < 15 ? "text-yellow-400 font-semibold" : "text-red-400 font-semibold"}>
                                  R$ {fmt(cpr)}
                                </span>
                              ) : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ══════════ CAMPAIGNS TAB ══════════ */}
      {tab === "campaigns" && (
        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4">
            Todas as Campanhas ({filteredCampaigns.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700">
                  <th className="text-left py-3 px-2">Campanha</th>
                  <th className="text-left py-3 px-2">Conta</th>
                  <th className="text-left py-3 px-2">Status</th>
                  <th className="text-left py-3 px-2">Objetivo</th>
                  <th className="text-right py-3 px-2">Orc./dia</th>
                  <th className="text-right py-3 px-2">Gasto</th>
                  <th className="text-right py-3 px-2">Impressoes</th>
                  <th className="text-right py-3 px-2">CTR</th>
                  <th className="text-right py-3 px-2">CPC</th>
                  <th className="text-right py-3 px-2">Resultados</th>
                  <th className="text-right py-3 px-2">Custo/Result.</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map((c) => {
                  const insight = filteredInsights.find((i) => i.campaign_id === c.id);
                  const ri = insight ? detectResult(insight.actions, insight.objective) : { value: 0, label: "Resultados", actionType: "" };
                  const results = ri.value;
                  const spend = insight ? safeFloat(insight.spend) : 0;
                  const cpr = results > 0 ? spend / results : 0;
                  return (
                    <tr key={c.id}
                      className="border-b border-slate-700/50 table-row cursor-pointer"
                      onClick={() => { setSelectedCampaign(c.id); setTab("overview"); }}
                      title="Clique para ver detalhes">
                      <td className="py-3 px-2 text-white font-medium max-w-[220px] truncate">
                        <span className="text-blue-400 mr-1">&#9654;</span>{c.name}
                      </td>
                      <td className="py-3 px-2 text-slate-400 text-xs">{c.account_name}</td>
                      <td className="py-3 px-2">
                        <span className={`badge ${c.status === "ACTIVE" ? "badge-active" : c.status === "PAUSED" ? "badge-paused" : "badge-archived"}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-xs">{objectiveLabels[c.objective] || c.objective}</td>
                      <td className="py-3 px-2 text-right">{c.daily_budget ? `R$ ${fmt(safeInt(c.daily_budget) / 100)}` : "-"}</td>
                      <td className="py-3 px-2 text-right">{insight ? `R$ ${fmt(spend)}` : "-"}</td>
                      <td className="py-3 px-2 text-right">{insight ? fmtInt(safeInt(insight.impressions)) : "-"}</td>
                      <td className="py-3 px-2 text-right">
                        {insight ? (
                          <span className={safeFloat(insight.ctr) > 2 ? "text-green-400" : safeFloat(insight.ctr) > 1 ? "text-yellow-400" : "text-red-400"}>
                            {pct(safeFloat(insight.ctr))}
                          </span>
                        ) : "-"}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {insight && safeFloat(insight.cpc) > 0 ? `R$ ${fmt(parseFloat(insight.cpc!))}` : "-"}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {results > 0 ? (
                          <div><span className="font-semibold text-white">{fmtInt(results)}</span><br/><span className="text-xs text-slate-500">{ri.label}</span></div>
                        ) : "-"}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {cpr > 0 ? (
                          <span className={cpr < 5 ? "text-green-400 font-semibold" : cpr < 15 ? "text-yellow-400 font-semibold" : "text-red-400 font-semibold"}>
                            R$ {fmt(cpr)}
                          </span>
                        ) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════ RECOMMENDATIONS ══════════ */}
      {tab === "recommendations" && (
        <div className="space-y-4">
          <div className="card mb-6">
            <h3 className="text-lg font-semibold text-white mb-2">Resumo</h3>
            <div className="text-sm text-slate-300 space-y-2">
              <p>Investido: <strong className="text-white">R$ {fmt(totals.spend)}</strong> &middot; {filteredInsights.length} campanhas</p>
              <p>Resultados (mensagens): <strong className="text-white">{fmtInt(totals.results)}</strong> &middot; Custo por resultado: <strong className={totals.costPerResult < 5 ? "text-green-400" : totals.costPerResult < 15 ? "text-yellow-400" : "text-red-400"}>
                {totals.costPerResult > 0 ? `R$ ${fmt(totals.costPerResult)}` : "N/A"}
              </strong></p>
              <p>CTR medio: <strong className={totals.ctr > 1.5 ? "text-green-400" : totals.ctr > 0.8 ? "text-yellow-400" : "text-red-400"}>{pct(totals.ctr)}</strong>
                {totals.ctr > 1.5 ? " - Acima da media." : totals.ctr > 0.8 ? " - Na media." : " - Abaixo da media."}</p>
            </div>
          </div>

          {filteredInsights.length === 0 && (
            <div className="card text-center py-8 text-slate-400">Nenhum dado para os filtros selecionados.</div>
          )}

          {filteredInsights.map((insight) => {
            const campaign = data.campaigns.find((c) => c.id === insight.campaign_id);
            const recs = generateRecommendations(insight, campaign);
            const ri = detectResult(insight.actions, insight.objective);
            const results = ri.value;
            const spend = safeFloat(insight.spend);
            const cpr = results > 0 ? spend / results : 0;
            return (
              <div key={insight.campaign_id} className="card">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-3 gap-2">
                  <div>
                    <h4 className="text-white font-semibold">{insight.campaign_name}</h4>
                    <p className="text-xs text-slate-400">
                      {insight.account_name} | {objectiveLabels[insight.objective || ""] || insight.objective}{" "}
                      {campaign?.status && (
                        <span className={`badge ml-2 ${campaign.status === "ACTIVE" ? "badge-active" : campaign.status === "PAUSED" ? "badge-paused" : "badge-archived"}`}>
                          {campaign.status}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-4 text-xs text-slate-300 flex-wrap">
                    <span>Gasto: <strong>R$ {fmt(spend)}</strong></span>
                    <span>{ri.label}: <strong className="text-white">{results > 0 ? results : "-"}</strong></span>
                    <span>Custo/Result.: <strong className={cpr > 0 && cpr < 10 ? "text-green-400" : cpr > 0 ? "text-yellow-400" : ""}>{cpr > 0 ? `R$ ${fmt(cpr)}` : "-"}</strong></span>
                    <span>CTR: <strong>{pct(safeFloat(insight.ctr))}</strong></span>
                  </div>
                </div>
                <ul className="space-y-1">
                  {recs.map((r, idx) => (
                    <li key={idx} className="text-sm text-slate-300 py-1 px-3 bg-slate-800/50 rounded-lg">{r}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

        </div>
      </main>

      {/* ══════════ SETTINGS MODAL ══════════ */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          role="dialog" aria-modal="true" aria-label="Configuracoes"
          onClick={(e) => { if (e.target === e.currentTarget) cancelSettings(); }}
          onKeyDown={(e) => { if (e.key === "Escape") cancelSettings(); }}>
          <div className="bg-[#1e293b] border border-slate-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">Configuracoes</h3>
              <button onClick={cancelSettings} className="text-slate-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              {/* Profile */}
              <div>
                <p className="settings-section-label">Perfil</p>
                <div>
                  <label className="settings-label">Nome</label>
                  <input type="text" value={settings.userName} placeholder="Seu nome"
                    onChange={(e) => setSettings({ ...settings, userName: e.target.value })}
                    className="settings-input" />
                </div>
              </div>

              {/* API Connection */}
              <div>
                <p className="settings-section-label">Conexao Meta API</p>
                <div className="space-y-3">
                  <div>
                    <label className="settings-label">Access Token</label>
                    <input type="password" value={settings.apiToken} placeholder="EAAxxxxxxx..."
                      onChange={(e) => setSettings({ ...settings, apiToken: e.target.value })}
                      className="settings-input font-mono" />
                    <p className="text-[10px] text-slate-600 mt-1 px-1">Token de acesso do Graph API. Gere em developers.facebook.com</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="settings-label">Versao da API</label>
                      <select value={settings.apiVersion}
                        onChange={(e) => setSettings({ ...settings, apiVersion: e.target.value })}
                        className="settings-input">
                        <option value="v21.0">v21.0</option>
                        <option value="v20.0">v20.0</option>
                        <option value="v19.0">v19.0</option>
                      </select>
                    </div>
                    <div>
                      <label className="settings-label">App ID</label>
                      <input type="text" value={settings.appId} placeholder="Opcional"
                        onChange={(e) => setSettings({ ...settings, appId: e.target.value })}
                        className="settings-input font-mono" />
                    </div>
                  </div>

                  <div>
                    <label className="settings-label">App Secret</label>
                    <input type="password" value={settings.appSecret} placeholder="Opcional"
                      onChange={(e) => setSettings({ ...settings, appSecret: e.target.value })}
                      className="settings-input font-mono" />
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50">
                <div className={`w-2 h-2 rounded-full ${settings.apiToken ? "bg-green-500" : "bg-slate-600"}`}></div>
                <span className="text-xs text-slate-400">
                  {settings.apiToken ? "Token configurado" : "Nenhum token configurado"}
                </span>
                {settings.apiToken && (
                  <span className="text-xs text-slate-600 ml-auto">
                    ...{settings.apiToken.slice(-8)}
                  </span>
                )}
              </div>

              {/* Data info */}
              <div className="px-3 py-2 rounded-lg bg-slate-800/50 text-xs text-slate-500">
                <p>Dados carregados: <strong className="text-slate-300">{data.accounts.length} contas</strong>, <strong className="text-slate-300">{data.campaigns.length} campanhas</strong></p>
                <p className="mt-1">Armazenamento: <strong className="text-slate-300">localStorage</strong> (dados sensiveis ficam apenas no seu navegador)</p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
              <button onClick={cancelSettings}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                Cancelar
              </button>
              <button onClick={saveSettings}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                  settingsSaved ? "bg-green-600 text-white" : "bg-blue-600 text-white hover:bg-blue-500"
                }`}>
                {settingsSaved ? "Salvo!" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KPICard({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  const borderMap: Record<string, string> = {
    blue: "border-l-blue-500", green: "border-l-green-500", red: "border-l-red-500",
    yellow: "border-l-yellow-500", purple: "border-l-purple-500", cyan: "border-l-cyan-500",
  };
  const valueColorMap: Record<string, string> = {
    blue: "text-white", green: "text-green-400", red: "text-red-400",
    yellow: "text-yellow-400", purple: "text-white", cyan: "text-white",
  };
  return (
    <div className={`metric-card border-l-4 ${borderMap[color] || borderMap.blue}`}>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${valueColorMap[color] || "text-white"}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ──────────── Funnel Chart (custom visual) ──────────── */
function FunnelChart({ data }: { data: { impressions: number; clicks: number; linkClicks: number; results: number; resultLabel: string } }) {
  const steps = [
    { label: "Impressoes", value: data.impressions, color: "#6366f1" },
    { label: "Cliques (todos)", value: data.clicks, color: "#3b82f6" },
    { label: "Cliques no Link", value: data.linkClicks, color: "#06b6d4" },
    { label: data.resultLabel || "Resultados", value: data.results, color: "#22c55e" },
  ];
  const maxVal = steps[0].value || 1;
  const allZero = steps.every((s) => s.value === 0);

  if (allZero) return <p className="text-slate-500 text-center py-8">Sem dados para o funil</p>;

  return (
    <div className="flex flex-col gap-3 py-2">
      {steps.map((step, idx) => {
        const widthPct = Math.max((step.value / maxVal) * 100, 8);
        const prevValue = idx > 0 ? steps[idx - 1].value : 0;
        const convRate = prevValue > 0 ? ((step.value / prevValue) * 100).toFixed(1) : null;
        return (
          <div key={step.label}>
            {idx > 0 && convRate && (
              <div className="flex items-center gap-2 mb-1 ml-2">
                <svg width="12" height="12" viewBox="0 0 12 12" className="text-slate-500">
                  <path d="M6 2 L6 10 M3 7 L6 10 L9 7" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                </svg>
                <span className="text-xs text-slate-500">{convRate}% conversao</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="w-[120px] text-right text-sm text-slate-300 shrink-0">{step.label}</div>
              <div className="flex-1 relative">
                <div
                  className="h-10 rounded-lg flex items-center px-3 transition-all duration-500"
                  style={{ width: `${widthPct}%`, backgroundColor: step.color, minWidth: "60px" }}
                >
                  <span className="text-sm font-bold text-white">{fmtInt(step.value)}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
