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

const CAMPAIGN_FIELDS = [
  "id", "name", "status", "objective",
  "daily_budget", "lifetime_budget",
  "start_time", "stop_time", "created_time", "updated_time",
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
  const { token, apiVersion = "v21.0", daysBack = 90 } = await req.json() as {
    token: string; apiVersion?: string; daysBack?: number;
  };

  if (!token) {
    return new Response(JSON.stringify({ error: "Token obrigatório" }), { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send({ type: "status", message: "Buscando contas de anúncio..." });

        const accounts = await getPaged(
          `/${apiVersion}/me/adaccounts?fields=id,name,account_status&limit=100&access_token=${token}`
        ) as Array<{ id: string; name: string }>;

        send({ type: "accounts", total: accounts.length, message: `${accounts.length} contas encontradas` });

        const result = {
          accounts: [] as object[],
          campaigns: [] as object[],
          insights: [] as object[],
          monthly_insights: [] as object[],
          daily_insights: [] as object[],
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

          let campaigns: object[] = [];
          let insights: object[] = [];
          let monthly: object[] = [];
          let daily: object[] = [];

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

          await sleep(200);

          result.accounts.push({
            id: accountId, name: accountName,
            total_campaigns: campaigns.length,
            campaigns_with_data: insights.length,
          });
          result.campaigns.push(...campaigns);
          result.insights.push(...insights);
          result.monthly_insights.push(...monthly);
          result.daily_insights.push(...daily);

          send({ type: "account_done", account: accountName, campaigns: campaigns.length, insights: insights.length, daily: daily.length });
        }

        // Save files
        const dataDir = path.join(process.cwd(), "..", "data");
        const dashboardDataPath = path.join(process.cwd(), "src", "data.json");

        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(path.join(dataDir, "consolidated.json"), JSON.stringify(result, null, 2));
        fs.writeFileSync(dashboardDataPath, JSON.stringify(result, null, 2));

        send({
          type: "done",
          accounts: result.accounts.length,
          campaigns: result.campaigns.length,
          insights: result.insights.length,
          daily: result.daily_insights.length,
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
    },
  });
}
