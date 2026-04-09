/**
 * Script de coleta de dados - Meta Ads Graph API
 *
 * Uso:
 *   node coletar-dados.js SEU_TOKEN_AQUI
 *
 * O token precisa ter permissões: ads_read, ads_management, business_management
 * Gere em: https://developers.facebook.com/tools/explorer/
 *
 * O script vai:
 *   1. Buscar TODAS as contas de anúncio que o token tem acesso
 *   2. Para cada conta: campanhas + insights totais + insights diários (90 dias)
 *   3. Salvar o consolidated.json e o data.json do dashboard automaticamente
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

/* ──────────── Config ──────────── */
const TOKEN = process.argv[2];
const API_VERSION = "v21.0";
const BASE = "graph.facebook.com";
const DAYS_BACK = 90; // Quantos dias de dados diários buscar

const INSIGHT_FIELDS = [
  "campaign_id", "campaign_name", "impressions", "clicks", "spend",
  "cpc", "cpm", "ctr", "reach", "frequency",
  "actions", "cost_per_action_type", "objective",
  "date_start", "date_stop",
].join(",");

const CAMPAIGN_FIELDS = [
  "id", "name", "status", "objective",
  "daily_budget", "lifetime_budget",
  "start_time", "stop_time", "created_time", "updated_time",
].join(",");

/* ──────────── Helpers ──────────── */
function dateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().substring(0, 10);
}

const today = new Date().toISOString().substring(0, 10);
const since90 = dateNDaysAgo(DAYS_BACK);

function get(pathUrl) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE,
      path: pathUrl,
      method: "GET",
      headers: { "Accept": "application/json" },
    };
    https.get(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(`API error: ${json.error.message} (code: ${json.error.code})`));
          else resolve(json);
        } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

async function getPaged(pathUrl, accumulator = []) {
  const data = await get(pathUrl);
  const items = data.data || [];
  accumulator.push(...items);
  if (data.paging?.next) {
    // Extract the relative path from the next URL
    const nextUrl = new URL(data.paging.next);
    await getPaged(nextUrl.pathname + nextUrl.search, accumulator);
  }
  return accumulator;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(msg) { process.stdout.write(msg + "\n"); }
function progress(msg) { process.stdout.write("\r" + msg + "                    "); }
// L3: Mascarar token em mensagens de erro (evita exposição acidental em logs)
function maskToken(str) { return TOKEN ? str.replace(new RegExp(TOKEN, "g"), TOKEN.slice(0, 8) + "***") : str; }

/* ──────────── Gerador de contexto ──────────── */
function generateContext(campaign, insight) {
  const name = (campaign.name || "").toLowerCase();
  const objective = campaign.objective || insight?.objective || "";

  // Detectar destino
  const isWpp = /wpp|whatsapp|msgs?_|mensag/.test(name);
  const isSite = /site|traf|trafico/.test(name);
  const isInsta = /insta|instagram/.test(name);
  const isEngajamento = /engaj|engagem/.test(name) || objective === "OUTCOME_ENGAGEMENT";
  const isLeads = objective === "OUTCOME_LEADS";
  const isTraffic = objective === "OUTCOME_TRAFFIC" || objective === "LINK_CLICKS";

  // Detectar período
  let periodo = "";
  if (insight?.date_start && insight?.date_stop) {
    const start = new Date(insight.date_start + "T12:00:00").toLocaleDateString("pt-BR");
    const stop = new Date(insight.date_stop + "T12:00:00").toLocaleDateString("pt-BR");
    periodo = ` Período de veiculação: ${start} a ${stop}.`;
  } else if (campaign.start_time) {
    const start = new Date(campaign.start_time).toLocaleDateString("pt-BR");
    periodo = ` Campanha iniciada em ${start}.`;
  }

  // Detectar orçamento
  let orcamento = "";
  if (campaign.daily_budget) {
    const val = (parseFloat(campaign.daily_budget) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    orcamento = ` Orçamento diário: ${val}.`;
  }

  // Montar contexto baseado no tipo de campanha
  if (isWpp) {
    return `Campanha de ${isEngajamento ? "engajamento" : "mensagens"} com destino ao WhatsApp Business. Objetivo: gerar conversas diretas com potenciais clientes, facilitando o primeiro contato com o negócio.${periodo}${orcamento}`;
  }
  if (isSite && isTraffic) {
    return `Campanha de tráfego com objetivo de direcionar visitantes qualificados ao site. Foco em atrair o público-alvo e aumentar o volume de acessos às páginas relevantes.${periodo}${orcamento}`;
  }
  if (isSite) {
    return `Campanha direcionada ao site com objetivo de aumentar o tráfego e a visibilidade da marca entre o público-alvo.${periodo}${orcamento}`;
  }
  if (isInsta && isEngajamento) {
    return `Campanha de engajamento no Instagram. Objetivo: aumentar o alcance orgânico, fortalecer a presença da marca e ampliar a audiência do perfil.${periodo}${orcamento}`;
  }
  if (isLeads) {
    return `Campanha de geração de leads. Objetivo: capturar contatos qualificados interessados no produto ou serviço, alimentando o funil de vendas.${periodo}${orcamento}`;
  }
  if (isEngajamento) {
    return `Campanha de engajamento. Objetivo: aumentar as interações com o conteúdo, ampliar o alcance e fortalecer o relacionamento com a audiência.${periodo}${orcamento}`;
  }
  if (isTraffic) {
    return `Campanha de tráfego. Objetivo: gerar cliques qualificados e direcionar o público-alvo para o destino da campanha.${periodo}${orcamento}`;
  }

  // Genérico
  return `Campanha publicitária na plataforma Meta (Facebook/Instagram).${periodo}${orcamento}`;
}

/* ──────────── Main ──────────── */
async function main() {
  if (!TOKEN) {
    console.error("\n❌ Token não informado!\n");
    console.error("Uso: node coletar-dados.js SEU_TOKEN_AQUI\n");
    console.error("Gere o token em: https://developers.facebook.com/tools/explorer/");
    console.error("Permissões necessárias: ads_read, ads_management, business_management\n");
    process.exit(1);
  }

  log("🚀 Iniciando coleta de dados da Meta Ads API...\n");

  // 1. Buscar todas as contas de anúncio
  log("📋 Buscando todas as contas de anúncio...");
  let allAccounts;
  try {
    const fields = "id,name,account_status,currency,timezone_name";
    allAccounts = await getPaged(`/${API_VERSION}/me/adaccounts?fields=${fields}&limit=100&access_token=${TOKEN}`);
  } catch (e) {
    console.error(`\n❌ Erro ao buscar contas: ${maskToken(e.message)}`);
    console.error("Verifique se o token é válido e tem as permissões necessárias.");
    process.exit(1);
  }

  log(`✅ ${allAccounts.length} contas encontradas!\n`);
  allAccounts.forEach(a => log(`   • ${a.name} (${a.id})`));
  log("");

  // Estrutura final
  const result = {
    accounts: [],
    campaigns: [],
    insights: [],
    monthly_insights: [],
    daily_insights: [],
  };

  const errors = [];

  // 2. Para cada conta, buscar campanhas e insights
  for (let i = 0; i < allAccounts.length; i++) {
    const account = allAccounts[i];
    const accountId = account.id; // já vem como act_XXXX
    const accountName = account.name;

    progress(`[${i + 1}/${allAccounts.length}] Verificando: ${accountName}...`);

    // Filtro rápido: só coleta conta com campanhas ativas ou gasto nos últimos 30 dias
    let hasActivity = false;
    try {
      const activeCheck = await get(
        `/${API_VERSION}/${accountId}/campaigns?fields=id&effective_status=["ACTIVE"]&limit=1&access_token=${TOKEN}`
      );
      if (activeCheck.data?.length > 0) hasActivity = true;
    } catch { hasActivity = true; } // sem permissão: deixa passar

    if (!hasActivity) {
      try {
        const spendCheck = await get(
          `/${API_VERSION}/${accountId}/insights?fields=spend&date_preset=last_30d&access_token=${TOKEN}`
        );
        if (spendCheck.data?.some(x => parseFloat(x.spend) > 0)) hasActivity = true;
      } catch { /* ignora */ }
    }

    if (!hasActivity) {
      log(`\r⏭️  [${i + 1}/${allAccounts.length}] ${accountName}: sem atividade nos últimos 30 dias — ignorada`);
      continue;
    }

    progress(`[${i + 1}/${allAccounts.length}] Coletando: ${accountName}...`);

    let campaigns = [];
    let insights = [];
    let dailyInsights = [];

    // Campanhas
    try {
      const rawCampaigns = await getPaged(
        `/${API_VERSION}/${accountId}/campaigns?fields=${CAMPAIGN_FIELDS}&limit=100&access_token=${TOKEN}`
      );
      campaigns = rawCampaigns.map(c => ({
        ...c,
        account_id: accountId,
        account_name: accountName,
        ai_context: c.status === "ACTIVE" ? generateContext(c, null) : undefined,
      }));
    } catch (e) {
      errors.push(`[${accountName}] campanhas: ${e.message}`);
    }

    await sleep(200);

    // Insights agregados (período máximo disponível)
    try {
      const rawInsights = await getPaged(
        `/${API_VERSION}/${accountId}/insights?fields=${INSIGHT_FIELDS}&level=campaign&date_preset=maximum&limit=100&access_token=${TOKEN}`
      );
      insights = rawInsights.map(i => ({
        ...i,
        account_id: accountId,
        account_name: accountName,
      }));
      // Refina contexto das campanhas com dados reais do insight
      campaigns = campaigns.map(c => {
        const insight = insights.find(i => i.campaign_id === c.id);
        if (insight) return { ...c, ai_context: generateContext(c, insight) };
        return c;
      });
    } catch (e) {
      errors.push(`[${accountName}] insights: ${e.message}`);
    }

    await sleep(200);

    // Insights mensais (para histórico)
    let monthlyInsights = [];
    try {
      const rawMonthly = await getPaged(
        `/${API_VERSION}/${accountId}/insights?fields=${INSIGHT_FIELDS}&level=campaign&time_increment=monthly&date_preset=maximum&limit=100&access_token=${TOKEN}`
      );
      monthlyInsights = rawMonthly.map(i => ({
        ...i,
        account_id: accountId,
        account_name: accountName,
      }));
    } catch (e) {
      errors.push(`[${accountName}] monthly insights: ${e.message}`);
    }

    await sleep(200);

    // Insights diários (últimos N dias)
    try {
      const rawDaily = await getPaged(
        `/${API_VERSION}/${accountId}/insights?fields=${INSIGHT_FIELDS}&level=campaign&time_increment=1&time_range=${encodeURIComponent(JSON.stringify({ since: since90, until: today }))}&limit=200&access_token=${TOKEN}`
      );
      dailyInsights = rawDaily.map(i => ({
        ...i,
        account_id: accountId,
        account_name: accountName,
      }));
    } catch (e) {
      errors.push(`[${accountName}] daily insights: ${e.message}`);
    }

    await sleep(300);

    // Acumular
    result.accounts.push({
      id: accountId,
      name: accountName,
      total_campaigns: campaigns.length,
      campaigns_with_data: insights.length,
    });

    result.campaigns.push(...campaigns);
    result.insights.push(...insights);
    result.monthly_insights.push(...monthlyInsights);
    result.daily_insights.push(...dailyInsights);

    log(`\r✅ [${i + 1}/${allAccounts.length}] ${accountName}: ${campaigns.length} campanhas, ${insights.length} insights, ${dailyInsights.length} dias`);
  }

  log("\n");

  // 3. Salvar arquivos
  const dataDir = path.join(__dirname, "data");
  const dashboardDataPath = path.join(__dirname, "dashboard", "src", "data.json");

  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    // consolidated.json na pasta data/
    const consolidatedPath = path.join(dataDir, "consolidated.json");
    fs.writeFileSync(consolidatedPath, JSON.stringify(result, null, 2), "utf8");
    log(`💾 Salvo: data/consolidated.json`);

    // data.json para o dashboard
    fs.writeFileSync(dashboardDataPath, JSON.stringify(result, null, 2), "utf8");
    log(`💾 Salvo: dashboard/src/data.json`);
  } catch (e) {
    console.error(`\n❌ Erro ao salvar arquivos: ${e.message}`);
    process.exit(1);
  }

  // Relatório de erros
  if (errors.length > 0) {
    log(`\n⚠️  ${errors.length} erros durante a coleta:`);
    errors.forEach(e => log(`   • ${e}`));
  }

  // Resumo final
  log(`
╔══════════════════════════════════════╗
║           COLETA FINALIZADA          ║
╠══════════════════════════════════════╣
║  Contas:           ${String(result.accounts.length).padStart(16)} ║
║  Campanhas:        ${String(result.campaigns.length).padStart(16)} ║
║  Insights totais:  ${String(result.insights.length).padStart(16)} ║
║  Insights diários: ${String(result.daily_insights.length).padStart(16)} ║
╚══════════════════════════════════════╝

✅ Dashboard atualizado! Reinicie o servidor para ver os novos dados.
   npm run dev (na pasta dashboard/)
`);
}

main().catch(e => {
  console.error("\n❌ Erro fatal:", maskToken(e.message));
  process.exit(1);
});
