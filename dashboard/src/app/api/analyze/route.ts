import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const client = new Anthropic();

interface DailyItem {
  date_start: string;
  spend: number;
  impressions: number;
  results: number;
  clicks: number;
}

interface AnalyzeBody {
  campName: string;
  objective: string;
  objLabel: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  linkClicks: number;
  resultValue: number;
  resultLabel: string;
  costPerResult: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  dailyItems: DailyItem[];
  campaigns: { name: string; status: string }[];
}

export async function POST(req: NextRequest) {
  const body = await req.json() as AnalyzeBody;

  const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = (n: number) => n.toLocaleString("pt-BR");

  const bestDay = body.dailyItems.length > 0
    ? body.dailyItems.reduce((a, b) => b.results > a.results ? b : a)
    : null;

  const prompt = `Você é um especialista em tráfego pago e Meta Ads. Analise os dados abaixo e escreva um parágrafo curto (3-5 linhas) de contexto sobre a campanha, descrevendo o que ela é, seus principais resultados e estado atual. Seja direto e profissional, sem introduções desnecessárias.

## Dados da Campanha

**Nome:** ${body.campName}
**Objetivo:** ${body.objLabel}
**Campanhas incluídas:** ${body.campaigns.map(c => `${c.name} (${c.status})`).join(", ")}

## Métricas Gerais
- Investimento total: R$ ${fmt(body.spend)}
- Alcance: ${fmtInt(body.reach)} pessoas
- Impressões: ${fmtInt(body.impressions)}
- Frequência: ${body.frequency.toFixed(2)}x
- Cliques: ${fmtInt(body.clicks)} (CTR: ${body.ctr.toFixed(2)}%)
- CPC: R$ ${fmt(body.cpc)}
- CPM: R$ ${fmt(body.cpm)}
- ${body.resultLabel}: ${fmtInt(body.resultValue)}
- Custo por ${body.resultLabel}: R$ ${fmt(body.costPerResult)}
${bestDay ? `- Melhor dia: ${new Date(bestDay.date_start + "T12:00:00").toLocaleDateString("pt-BR")} (${fmtInt(bestDay.results)} ${body.resultLabel})` : ""}

Escreva apenas o parágrafo de contexto, sem títulos ou marcadores.`;

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return Response.json({ context: text });
}
