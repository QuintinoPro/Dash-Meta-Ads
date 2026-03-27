"use client";

import { useState, useMemo } from "react";
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
const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number) => n.toFixed(2) + "%";

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
      if (a && parseFloat(a.value) > 0) {
        const meta = RESULT_TYPE_PRIORITY.find((r) => r.type === type);
        return { value: parseFloat(a.value), label: meta?.label || type, actionType: type };
      }
    }
  }

  // Fallback: use priority list
  for (const rt of RESULT_TYPE_PRIORITY) {
    const a = actions.find((x) => x.action_type === rt.type);
    if (a && parseFloat(a.value) > 0) {
      return { value: parseFloat(a.value), label: rt.label, actionType: rt.type };
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
  return a ? parseFloat(a.value) : 0;
}
function getCostPerAction(cpa: CostPerAction[] | undefined, type: string): number {
  const a = cpa?.find((x) => x.action_type === type);
  return a ? parseFloat(a.value) : 0;
}

const objectiveLabels: Record<string, string> = {
  OUTCOME_TRAFFIC: "Trafego", OUTCOME_ENGAGEMENT: "Engajamento", OUTCOME_SALES: "Vendas",
  OUTCOME_LEADS: "Leads", OUTCOME_AWARENESS: "Reconhecimento", OUTCOME_APP_PROMOTION: "App",
  LINK_CLICKS: "Cliques no Link", POST_ENGAGEMENT: "Engajamento Post", REACH: "Alcance",
  CONVERSIONS: "Conversoes", MESSAGES: "Mensagens", VIDEO_VIEWS: "Visualizacoes",
};

const COLORS = [
  "#3b82f6","#22c55e","#eab308","#ef4444","#a855f7",
  "#06b6d4","#f97316","#ec4899","#14b8a6","#8b5cf6",
];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().substring(0, 10);
}

/* ──────────── recommendations engine ──────────── */
function generateRecommendations(insight: Insight, campaign?: Campaign): string[] {
  const recs: string[] = [];
  const ctr = parseFloat(insight.ctr);
  const cpc = parseFloat(insight.cpc || "0");
  const spend = parseFloat(insight.spend);
  const impressions = parseInt(insight.impressions);
  const clicks = parseInt(insight.clicks);
  const freq = parseFloat(insight.frequency);
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
  const spend = items.reduce((s, i) => s + parseFloat(i.spend), 0);
  const impressions = items.reduce((s, i) => s + parseInt(i.impressions), 0);
  const clicks = items.reduce((s, i) => s + parseInt(i.clicks), 0);
  const reach = items.reduce((s, i) => s + parseInt(i.reach), 0);
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

  const dateCutoff = useMemo(() => {
    if (datePeriod === "7") return daysAgo(7);
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

  const filteredInsights = useMemo(() => {
    if (datePeriod !== "all") {
      // Aggregate daily records per campaign with deep copies to avoid mutating source data
      const map = new Map<string, { base: Insight; actionMap: Map<string, number> }>();
      filteredDaily.forEach((d) => {
        const key = d.campaign_id;
        if (!map.has(key)) {
          const actionMap = new Map<string, number>();
          d.actions?.forEach((a) => actionMap.set(a.action_type, parseFloat(a.value)));
          map.set(key, {
            base: { ...d, spend: d.spend, impressions: d.impressions, clicks: d.clicks, reach: d.reach },
            actionMap,
          });
        } else {
          const entry = map.get(key)!;
          entry.base.spend = String(parseFloat(entry.base.spend) + parseFloat(d.spend));
          entry.base.impressions = String(parseInt(entry.base.impressions) + parseInt(d.impressions));
          entry.base.clicks = String(parseInt(entry.base.clicks) + parseInt(d.clicks));
          entry.base.reach = String(parseInt(entry.base.reach) + parseInt(d.reach));
          d.actions?.forEach((a) => {
            entry.actionMap.set(a.action_type, (entry.actionMap.get(a.action_type) || 0) + parseFloat(a.value));
          });
        }
      });
      return [...map.values()].map(({ base, actionMap }) => {
        const imp = parseInt(base.impressions);
        const clk = parseInt(base.clicks);
        const sp = parseFloat(base.spend);
        const actions: Action[] = [...actionMap.entries()].map(([action_type, value]) => ({ action_type, value: String(value) }));
        return {
          ...base,
          actions,
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
      cur.spend += parseFloat(i.spend);
      cur.results += detectResult(i.actions, i.objective).value;
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
      cur.spend += parseFloat(i.spend);
      cur.results += detectResult(i.actions, i.objective).value;
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
    const impressions = filteredInsights.reduce((s, i) => s + parseInt(i.impressions), 0);
    const clicks = filteredInsights.reduce((s, i) => s + parseInt(i.clicks), 0);
    const linkClicks = filteredInsights.reduce((s, i) => s + getActionValue(i.actions, "link_click"), 0);
    const aggResult = detectAggregateResult(filteredInsights);
    return { impressions, clicks, linkClicks, results: aggResult.total, resultLabel: aggResult.label };
  }, [filteredInsights]);

  /* ──── Resultados por campanha (Opção 3 - só múltiplas campanhas) ──── */
  const resultsByCampaignChart = useMemo(() => {
    const items = filteredInsights
      .map((i) => {
        const r = detectResult(i.actions, i.objective);
        const spend = parseFloat(i.spend);
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

  const topCampaigns = useMemo(() =>
    [...filteredInsights].sort((a, b) => parseFloat(b.spend) - parseFloat(a.spend)),
  [filteredInsights]);

  const isSingleCampaign = selectedCampaign !== "all";

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Meta Ads Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">
            {data.accounts.length} contas &middot; {data.campaigns.length} campanhas &middot; {data.insights.length} insights
          </p>
        </div>

        {/* Filters Bar */}
        <div className="flex flex-wrap gap-3 items-end bg-slate-800/50 rounded-xl p-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">Conta de Anuncio</label>
            <select value={selectedAccount} onChange={(e) => handleAccountChange(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]">
              <option value="all">Todas as contas</option>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.campaigns_with_data})</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">Campanha</label>
            <select value={selectedCampaign} onChange={(e) => setSelectedCampaign(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[260px] max-w-[400px]">
              <option value="all">Todas as campanhas ({availableCampaigns.length})</option>
              {availableCampaigns.map(([id, name]) => (
                <option key={id} value={id}>{name.length > 50 ? name.substring(0, 50) + "..." : name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">Periodo</label>
            <div className="flex gap-1">
              {[{ v: "all", l: "Todo periodo" }, { v: "7", l: "7 dias" }, { v: "30", l: "30 dias" }, { v: "90", l: "90 dias" }].map((p) => (
                <button key={p.v} onClick={() => setDatePeriod(p.v)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    datePeriod === p.v ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600"
                  }`}>{p.l}</button>
              ))}
            </div>
          </div>

          {(selectedAccount !== "all" || selectedCampaign !== "all" || datePeriod !== "all") && (
            <button onClick={() => { setSelectedAccount("all"); setSelectedCampaign("all"); setDatePeriod("all"); }}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-red-900/50 text-red-300 hover:bg-red-900 transition-colors">
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-800/50 rounded-xl p-1 w-fit">
        {(["overview", "campaigns", "recommendations"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-700"
            }`}>
            {t === "overview" ? "Visao Geral" : t === "campaigns" ? "Campanhas" : "Recomendacoes"}
          </button>
        ))}
      </div>

      {/* ══════════ OVERVIEW ══════════ */}
      {tab === "overview" && (
        <>
          {isSingleCampaign && (
            <div className="mb-4 px-4 py-2 bg-blue-900/30 border border-blue-800 rounded-lg text-sm text-blue-300">
              Campanha: <strong className="text-white">{filteredInsights[0]?.campaign_name}</strong>
              {datePeriod !== "all" && <span className="ml-2">| Ultimos {datePeriod} dias</span>}
            </div>
          )}

          {filteredInsights.length === 0 ? (
            <div className="card text-center py-12 text-slate-400">
              Nenhum dado encontrado para os filtros selecionados.
            </div>
          ) : (
            <>
              {/* KPI Cards - focused on what matters */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
                <KPICard label="Gasto Total" value={`R$ ${fmt(totals.spend)}`} color="blue" />
                <KPICard label="Impressoes" value={fmtInt(totals.impressions)} color="purple" />
                <KPICard label="Alcance" value={fmtInt(totals.reach)} color="cyan" />
                <KPICard label="Cliques" value={fmtInt(totals.clicks)} color="blue" />
                <KPICard label="Cliques no Link" value={fmtInt(totals.linkClicks)} color="green" />
                <KPICard label="CTR" value={pct(totals.ctr)} color={totals.ctr > 1.5 ? "green" : totals.ctr > 0.8 ? "yellow" : "red"} />
                <KPICard label="CPC" value={`R$ ${fmt(totals.cpc)}`} color={totals.cpc < 1 ? "green" : totals.cpc < 3 ? "yellow" : "red"} />
                <KPICard label="CPM" value={`R$ ${fmt(totals.cpm)}`} color="blue" />
                <KPICard label="Resultados" value={fmtInt(totals.results)} color="green" sub={totals.resultLabel} />
                <KPICard label="Custo por Resultado" value={totals.costPerResult > 0 ? `R$ ${fmt(totals.costPerResult)}` : "N/A"} color={totals.costPerResult > 0 && totals.costPerResult < 5 ? "green" : totals.costPerResult < 15 ? "yellow" : "red"} />
              </div>

              {/* Chart Row 1: Gasto & Resultados + Custo por Resultado (trend) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="card">
                  <h3 className="text-lg font-semibold text-white mb-4">
                    {datePeriod !== "all" ? `Gasto & Resultados (${datePeriod} dias)` : "Gasto & Resultados ao Longo do Tempo"}
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
                    {datePeriod !== "all" ? `Custo por Resultado (${datePeriod} dias)` : "Custo por Resultado ao Longo do Tempo"}
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

              {/* Chart Row 2: Funil + Resultados por Campanha (se múltiplas) */}
              <div className={`grid gap-6 mb-6 ${!isSingleCampaign && resultsByCampaignChart ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
                {/* Funil de Conversão */}
                <div className="card">
                  <h3 className="text-lg font-semibold text-white mb-4">Funil de Conversao</h3>
                  <FunnelChart data={funnelData} />
                </div>

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
                            label: (ctx: { dataset: { label?: string }; parsed: { x: number } }) => {
                              const label = ctx.dataset.label || "";
                              const val = ctx.parsed.x;
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
                        const ri = detectResult(i.actions, i.objective);
                        const results = ri.value;
                        const spend = parseFloat(i.spend);
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
                            <td className="py-3 px-2 text-right">R$ {fmt(spend)}</td>
                            <td className="py-3 px-2 text-right">{fmtInt(parseInt(i.impressions))}</td>
                            <td className="py-3 px-2 text-right">{fmtInt(getActionValue(i.actions, "link_click"))}</td>
                            <td className="py-3 px-2 text-right">
                              <span className={parseFloat(i.ctr) > 2 ? "text-green-400" : parseFloat(i.ctr) > 1 ? "text-yellow-400" : "text-red-400"}>
                                {pct(parseFloat(i.ctr))}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right">
                              {parseFloat(i.cpc || "0") > 0 ? (
                                <span className={parseFloat(i.cpc!) < 1 ? "text-green-400" : parseFloat(i.cpc!) < 3 ? "text-yellow-400" : "text-red-400"}>
                                  R$ {fmt(parseFloat(i.cpc!))}
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
                  const spend = insight ? parseFloat(insight.spend) : 0;
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
                      <td className="py-3 px-2 text-right">{c.daily_budget ? `R$ ${fmt(parseInt(c.daily_budget) / 100)}` : "-"}</td>
                      <td className="py-3 px-2 text-right">{insight ? `R$ ${fmt(spend)}` : "-"}</td>
                      <td className="py-3 px-2 text-right">{insight ? fmtInt(parseInt(insight.impressions)) : "-"}</td>
                      <td className="py-3 px-2 text-right">
                        {insight ? (
                          <span className={parseFloat(insight.ctr) > 2 ? "text-green-400" : parseFloat(insight.ctr) > 1 ? "text-yellow-400" : "text-red-400"}>
                            {pct(parseFloat(insight.ctr))}
                          </span>
                        ) : "-"}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {insight && parseFloat(insight.cpc || "0") > 0 ? `R$ ${fmt(parseFloat(insight.cpc!))}` : "-"}
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
            const spend = parseFloat(insight.spend);
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
                    <span>CTR: <strong>{pct(parseFloat(insight.ctr))}</strong></span>
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

      <div className="text-center text-xs text-slate-500 mt-12 pb-8">
        Meta Ads Dashboard | Graph API v21.0 | {new Date().toLocaleDateString("pt-BR")}
      </div>
    </div>
  );
}

function KPICard({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  const colorMap: Record<string, string> = {
    blue: "border-l-blue-500", green: "border-l-green-500", red: "border-l-red-500",
    yellow: "border-l-yellow-500", purple: "border-l-purple-500", cyan: "border-l-cyan-500",
  };
  return (
    <div className={`metric-card border-l-4 ${colorMap[color] || colorMap.blue}`}>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ──────────── Funnel Chart (custom visual) ──────────── */
function FunnelChart({ data }: { data: { impressions: number; clicks: number; linkClicks: number; results: number; resultLabel: string } }) {
  const steps = [
    { label: "Impressoes", value: data.impressions, color: "#6366f1" },
    { label: "Cliques", value: data.clicks, color: "#3b82f6" },
    { label: "Cliques no Link", value: data.linkClicks, color: "#06b6d4" },
    { label: data.resultLabel || "Resultados", value: data.results, color: "#22c55e" },
  ];
  const maxVal = steps[0].value || 1;

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
