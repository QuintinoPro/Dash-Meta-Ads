import { NextRequest } from "next/server";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";

const INSIGHT_FIELDS = [
  "campaign_id", "campaign_name", "impressions", "clicks", "spend",
  "cpc", "cpm", "ctr", "reach", "frequency",
  "actions", "cost_per_action_type", "objective",
  "date_start", "date_stop",
].join(",");

const ADSET_INSIGHT_FIELDS = [
  "adset_id", "adset_name", "campaign_id", "campaign_name",
  "impressions", "clicks", "spend", "cpc", "cpm", "ctr", "reach", "frequency",
  "actions", "cost_per_action_type", "objective",
  "date_start", "date_stop",
].join(",");

const CAMPAIGN_FIELDS = [
  "id", "name", "status", "objective",
  "daily_budget", "lifetime_budget",
  "start_time", "stop_time", "created_time", "updated_time",
].join(",");

const ADSET_FIELDS = [
  "id", "name", "status", "campaign_id",
  "daily_budget", "lifetime_budget",
  "optimization_goal", "bid_strategy",
  "start_time", "end_time", "created_time",
].join(",");

const AD_INSIGHT_FIELDS = [
  "ad_id", "ad_name", "adset_id", "adset_name", "campaign_id", "campaign_name",
  "impressions", "clicks", "spend", "cpc", "cpm", "ctr", "reach", "frequency",
  "actions", "cost_per_action_type", "objective",
  "date_start", "date_stop",
].join(",");

const AD_FIELDS = [
  "id", "name", "status", "adset_id", "campaign_id", "created_time",
  "creative{thumbnail_url,image_url}",
].join(",");

function apiGet(pathUrl: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    https.get({ hostname: "graph.facebook.com", path: pathUrl, headers: { Accept: "application/json" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const json = JSON.parse(data) as Record<string, unknown>;
          if (json.error) {
            const err = json.error as Record<string, unknown>;
            reject(new Error(String(err.message || "API error")));
          } else resolve(json);
        } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

async function getPaged(pathUrl: string, acc: unknown[] = []): Promise<unknown[]> {
  const data = await apiGet(pathUrl);
  const items = (data.data as unknown[]) || [];
  acc.push(...items);
  const paging = data.paging as Record<string, unknown> | undefined;
  if (paging?.next) {
    const nextUrl = new URL(String(paging.next));
    await getPaged(nextUrl.pathname + nextUrl.search, acc);
  }
  return acc;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().substring(0, 10);
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  // C1: Token via Authorization header (não exposto no body/DevTools)
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  const { apiVersion = "v21.0", daysBack = 90 } = await req.json() as {
    apiVersion?: string; daysBack?: number;
  };

  if (!token) {
    return new Response(JSON.stringify({ error: "Token obrigatório" }), { status: 400 });
  }

  // A5: Validar daysBack
  if (typeof daysBack !== "number" || !Number.isInteger(daysBack) || daysBack < 1 || daysBack > 365) {
    return new Response(JSON.stringify({ error: "daysBack deve ser um inteiro entre 1 e 365" }), { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send({ type: "status", message: "Buscando contas de anúncio..." });

        const accounts = await getPaged(
          `/${apiVersion}/me/adaccounts?fields=id,name,account_status,balance,amount_spent&limit=100&access_token=${token}`
        ) as Array<{ id: string; name: string; balance?: string; amount_spent?: string }>;

        send({ type: "accounts", total: accounts.length, message: `${accounts.length} contas encontradas` });

        const result = {
          accounts: [] as object[],
          campaigns: [] as object[],
          insights: [] as object[],
          monthly_insights: [] as object[],
          daily_insights: [] as object[],
          adsets: [] as object[],
          adset_insights: [] as object[],
          adset_daily_insights: [] as object[],
          ads: [] as object[],
          ad_insights: [] as object[],
          ad_daily_insights: [] as object[],
          pages: [] as object[],
          last_updated: new Date().toISOString(),
        };

        const today = new Date().toISOString().substring(0, 10);
        const since = dateNDaysAgo(daysBack);
        const timeRange = encodeURIComponent(JSON.stringify({ since, until: today }));

        for (let i = 0; i < accounts.length; i++) {
          const account = accounts[i];
          const accountId = account.id;
          const accountName = account.name;

          send({ type: "progress", current: i + 1, total: accounts.length, account: accountName });

          // Filtro rápido: só coleta conta com campanhas ativas ou gasto nos últimos 30 dias
          let hasActivity = false;
          try {
            const activeCheck = await apiGet(
              `/${apiVersion}/${accountId}/campaigns?fields=id&effective_status=["ACTIVE"]&limit=1&access_token=${token}`
            );
            if ((activeCheck.data as unknown[])?.length > 0) hasActivity = true;
          } catch { /* sem permissão, deixa passar */ hasActivity = true; }

          if (!hasActivity) {
            try {
              const spendCheck = await apiGet(
                `/${apiVersion}/${accountId}/insights?fields=spend&date_preset=last_30d&access_token=${token}`
              );
              const items = spendCheck.data as Array<{ spend: string }> | undefined;
              if (items?.some(x => parseFloat(x.spend) > 0)) hasActivity = true;
            } catch { /* ignora */ }
          }

          if (!hasActivity) {
            send({ type: "progress", current: i + 1, total: accounts.length, account: `${accountName} (sem atividade — ignorada)` });
            await sleep(100);
            continue;
          }

          let campaigns: object[] = [];
          let insights: object[] = [];
          let monthly: object[] = [];
          let daily: object[] = [];
          let adsets: object[] = [];
          let adset_insights: object[] = [];
          let adset_daily: object[] = [];
          let ads: object[] = [];
          let ad_insights: object[] = [];
          let ad_daily: object[] = [];

          try {
            const raw = await getPaged(
              `/${apiVersion}/${accountId}/campaigns?fields=${CAMPAIGN_FIELDS}&limit=100&access_token=${token}`
            );
            campaigns = (raw as Array<Record<string, unknown>>).map(c => ({ ...c, account_id: accountId, account_name: accountName }));
          } catch { /* conta sem permissão */ }

          await sleep(150);

          try {
            const raw = await getPaged(
              `/${apiVersion}/${accountId}/insights?fields=${INSIGHT_FIELDS}&level=campaign&date_preset=maximum&limit=100&access_token=${token}`
            );
            insights = (raw as Array<Record<string, unknown>>).map(i => ({ ...i, account_id: accountId, account_name: accountName }));
          } catch { /* sem insights */ }

          await sleep(150);

          try {
            const raw = await getPaged(
              `/${apiVersion}/${accountId}/insights?fields=${INSIGHT_FIELDS}&level=campaign&time_increment=monthly&date_preset=maximum&limit=100&access_token=${token}`
            );
            monthly = (raw as Array<Record<string, unknown>>).map(i => ({ ...i, account_id: accountId, account_name: accountName }));
          } catch { /* sem monthly */ }

          await sleep(150);

          try {
            const raw = await getPaged(
              `/${apiVersion}/${accountId}/insights?fields=${INSIGHT_FIELDS}&level=campaign&time_increment=1&time_range=${timeRange}&limit=200&access_token=${token}`
            );
            daily = (raw as Array<Record<string, unknown>>).map(i => ({ ...i, account_id: accountId, account_name: accountName }));
          } catch { /* sem daily */ }

          await sleep(150);

          // Adsets metadata
          try {
            const raw = await getPaged(
              `/${apiVersion}/${accountId}/adsets?fields=${ADSET_FIELDS}&limit=200&access_token=${token}`
            );
            adsets = (raw as Array<Record<string, unknown>>).map(a => ({ ...a, account_id: accountId, account_name: accountName }));
          } catch { /* sem permissão adsets */ }

          await sleep(150);

          // Adset aggregate insights
          try {
            const raw = await getPaged(
              `/${apiVersion}/${accountId}/insights?fields=${ADSET_INSIGHT_FIELDS}&level=adset&date_preset=maximum&limit=200&access_token=${token}`
            );
            adset_insights = (raw as Array<Record<string, unknown>>).map(i => ({ ...i, account_id: accountId, account_name: accountName }));
          } catch { /* sem adset insights */ }

          await sleep(150);

          // Adset daily insights
          try {
            const raw = await getPaged(
              `/${apiVersion}/${accountId}/insights?fields=${ADSET_INSIGHT_FIELDS}&level=adset&time_increment=1&time_range=${timeRange}&limit=500&access_token=${token}`
            );
            adset_daily = (raw as Array<Record<string, unknown>>).map(i => ({ ...i, account_id: accountId, account_name: accountName }));
          } catch { /* sem adset daily */ }

          // Ads metadata
          try {
            const raw = await getPaged(
              `/${apiVersion}/${accountId}/ads?fields=${AD_FIELDS}&limit=200&access_token=${token}`
            );
            ads = (raw as Array<Record<string, unknown>>).map(a => {
              const creative = a.creative as Record<string, unknown> | undefined;
              return {
                ...a,
                thumbnail_url: creative?.thumbnail_url ?? creative?.image_url ?? null,
                creative: undefined,
                account_id: accountId,
                account_name: accountName,
              };
            });
          } catch { /* sem permissão ads */ }

          await sleep(150);

          // Ad aggregate insights
          try {
            const raw = await getPaged(
              `/${apiVersion}/${accountId}/insights?fields=${AD_INSIGHT_FIELDS}&level=ad&date_preset=maximum&limit=200&access_token=${token}`
            );
            ad_insights = (raw as Array<Record<string, unknown>>).map(i => ({ ...i, account_id: accountId, account_name: accountName }));
          } catch { /* sem ad insights */ }

          await sleep(150);

          // Ad daily insights
          try {
            const raw = await getPaged(
              `/${apiVersion}/${accountId}/insights?fields=${AD_INSIGHT_FIELDS}&level=ad&time_increment=1&time_range=${timeRange}&limit=500&access_token=${token}`
            );
            ad_daily = (raw as Array<Record<string, unknown>>).map(i => ({ ...i, account_id: accountId, account_name: accountName }));
          } catch { /* sem ad daily */ }

          await sleep(200);

          // Pages linked to this ad account (requires pages_read_engagement)
          try {
            const raw = await getPaged(
              `/${apiVersion}/${accountId}/promote_pages?fields=id,name,fan_count,followers_count,link&limit=50&access_token=${token}`
            ) as Array<Record<string, unknown>>;
            if (raw.length > 0) {
              // For each page, try to get fan_adds in the period
              for (const page of raw) {
                const pageId = page.id as string;
                try {
                  const fanData = await apiGet(
                    `/${apiVersion}/${pageId}/insights?metric=page_fan_adds_unique&period=day&since=${since}&until=${today}&access_token=${token}`
                  );
                  const fanAddsData = (fanData.data as Array<Record<string, unknown>>) || [];
                  const totalFanAdds = fanAddsData.reduce((sum, item) => {
                    const vals = (item.values as Array<{ value: number }>) || [];
                    return sum + vals.reduce((s, v) => s + (v.value || 0), 0);
                  }, 0);
                  result.pages.push({ ...page, account_id: accountId, account_name: accountName, fan_adds_period: totalFanAdds });
                } catch {
                  result.pages.push({ ...page, account_id: accountId, account_name: accountName, fan_adds_period: 0 });
                }
                await sleep(100);
              }
            }
          } catch { /* sem permissão pages */ }

          result.accounts.push({
            id: accountId, name: accountName,
            total_campaigns: campaigns.length,
            campaigns_with_data: insights.length,
            balance: account.balance,
            amount_spent: account.amount_spent,
          });
          result.campaigns.push(...campaigns);
          result.insights.push(...insights);
          result.monthly_insights.push(...monthly);
          result.daily_insights.push(...daily);
          result.adsets.push(...adsets);
          result.adset_insights.push(...adset_insights);
          result.adset_daily_insights.push(...adset_daily);
          result.ads.push(...ads);
          result.ad_insights.push(...ad_insights);
          result.ad_daily_insights.push(...ad_daily);

          send({
            type: "account_done", account: accountName,
            campaigns: campaigns.length, insights: insights.length,
            daily: daily.length, adsets: adsets.length, ads: ads.length,
          });
        }

        // Save files — M5: envolver em try-catch para erro de disco/permissão
        const dataDir = path.join(process.cwd(), "..", "data");
        const dashboardDataPath = path.join(process.cwd(), "src", "data.json");

        try {
          if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
          fs.writeFileSync(path.join(dataDir, "consolidated.json"), JSON.stringify(result, null, 2));
          fs.writeFileSync(dashboardDataPath, JSON.stringify(result, null, 2));
        } catch (fsErr) {
          send({ type: "error", message: `Erro ao salvar arquivos: ${fsErr instanceof Error ? fsErr.message : "Erro desconhecido"}` });
          controller.close();
          return;
        }

        send({
          type: "done",
          accounts: result.accounts.length,
          campaigns: result.campaigns.length,
          insights: result.insights.length,
          daily: result.daily_insights.length,
          adsets: result.adsets.length,
          adset_insights: result.adset_insights.length,
          ads: result.ads.length,
          ad_insights: result.ad_insights.length,
          last_updated: result.last_updated,
        });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "Erro desconhecido" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
