/**
 * Criação automática da campanha Dia das Mães - Espaço Giselli Alonso
 * Uso: node criar-campanha-giselli.js SEU_TOKEN
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const TOKEN = process.argv[2];
const ACCOUNT = "act_1399964494989542";
const PAGE_ID = "103216467917816";
const WHATSAPP_NUMBER = "5521990900284";
const CREATIVE_DIR = "C:/Users/lucas/OneDrive/Área de Trabalho/CRIATIVOS GISELI";

if (!TOKEN) { console.error("Uso: node criar-campanha-giselli.js SEU_TOKEN"); process.exit(1); }

/* ──── Helpers ──── */
function apiPost(endpoint, params, isVideoHost = false) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const host = isVideoHost ? "graph-video.facebook.com" : "graph.facebook.com";
    const options = {
      hostname: host,
      path: `/v22.0${endpoint}`,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        const json = JSON.parse(d);
        if (json.error) reject(new Error(`[${endpoint}] ${json.error.message}`));
        else resolve(json);
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function uploadImage(filePath) {
  return new Promise((resolve, reject) => {
    const boundary = "ImgBoundary" + Date.now();
    const fileName = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${TOKEN}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="filename"; filename="${fileName}"\r\nContent-Type: image/jpeg\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileBuffer, footer]);
    const options = {
      hostname: "graph.facebook.com",
      path: `/v22.0/${ACCOUNT}/adimages`,
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": body.length },
    };
    const req = https.request(options, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        const json = JSON.parse(d);
        if (json.error) reject(new Error(`[upload image] ${json.error.message}`));
        else resolve(json);
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function uploadVideo(filePath) {
  return new Promise((resolve, reject) => {
    const boundary = "VidBoundary" + Date.now();
    const fileName = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    console.log(`  Carregando vídeo (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB)...`);
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${TOKEN}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nDia das Maes - Espaco Giselli\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="${fileName}"\r\nContent-Type: video/quicktime\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileBuffer, footer]);
    const options = {
      hostname: "graph-video.facebook.com",
      path: `/v22.0/${ACCOUNT}/advideos`,
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": body.length },
    };
    const req = https.request(options, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        const json = JSON.parse(d);
        if (json.error) reject(new Error(`[upload video] ${json.error.message}`));
        else resolve(json);
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function getVideoThumbnail(videoId) {
  return new Promise((resolve) => {
    // Wait for video to be ready then get thumbnail
    setTimeout(async () => {
      try {
        const https2 = require("https");
        const url = `https://graph.facebook.com/v22.0/${videoId}?fields=thumbnails&access_token=${TOKEN}`;
        https2.get(url, (res) => {
          let d = "";
          res.on("data", (c) => (d += c));
          res.on("end", () => {
            const json = JSON.parse(d);
            const thumb = json.thumbnails?.data?.[0]?.uri;
            resolve(thumb || null);
          });
        });
      } catch { resolve(null); }
    }, 5000);
  });
}

/* ──── Copies ──── */
const COPY_VIDEO = `🌸 Sua mãe merece um dia especial no Espaço Giselli Alonso!\n\nPacotes exclusivos de Dia das Mães a partir de R$ 99 — massagem, escova, unhas e muito mais. ✨\n\nHorários limitados! Chama no WhatsApp e garante o dela antes que esgote 👇`;
const COPY_IMG02 = `💐 Dê à sua mãe o presente que toda mulher ama: um dia de beleza!\n\nEscolha o pacote ideal no Espaço Giselli Alonso, em Itaguaí:\n✅ Massagem + Escova a partir de R$ 199\n✅ Escova + Unhas a partir de R$ 149\n✅ Design + Spa a partir de R$ 99\n\nChame no WhatsApp e agende agora! 👇`;
const COPY_IMG03 = `✂️ Cuide da sua mãe (ou de você mesma 💅) nesse Dia das Mães!\n\nPacotes de beleza completos em Itaguaí. Reserve seu horário antes que acabe!\n\n👇 Fale com a Giselli no WhatsApp agora.`;

const CTA_WPP = JSON.stringify({ type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } });

/* ──── Main ──── */
async function main() {
  console.log("\n🚀 Iniciando criação da campanha Dia das Mães - Espaço Giselli\n");

  // Dates
  const start = Math.floor(new Date("2026-05-06T08:00:00-03:00").getTime() / 1000);
  const end   = Math.floor(new Date("2026-05-18T23:59:00-03:00").getTime() / 1000);

  // 1. Campaign
  console.log("1️⃣  Criando campanha...");
  const campaign = await apiPost(`/${ACCOUNT}/campaigns`, {
    access_token: TOKEN,
    name: "META_Msgs_GiselliAlonso_DiaMaes_Mai06",
    objective: "OUTCOME_ENGAGEMENT",
    status: "PAUSED",
    special_ad_categories: "[]",
  });
  console.log(`   ✅ Campanha criada: ${campaign.id}\n`);

  // 2. Ad Set
  console.log("2️⃣  Criando conjunto de anúncios...");
  const targeting = JSON.stringify({
    geo_locations: { cities: [{ key: "255610", radius: 15, distance_unit: "kilometer" }] },
    age_min: 25,
    age_max: 55,
    genders: [2],
    flexible_spec: [{ interests: [{ id: "6003088846792" }, { id: "6003988602106" }] }],
  });

  const adset = await apiPost(`/${ACCOUNT}/adsets`, {
    access_token: TOKEN,
    name: "CBO_Mulheres_Itaguai_DiaMaes",
    campaign_id: campaign.id,
    optimization_goal: "CONVERSATIONS",
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    lifetime_budget: "30000",
    start_time: String(start),
    end_time: String(end),
    destination_type: "WHATSAPP",
    promoted_object: JSON.stringify({ page_id: PAGE_ID }),
    targeting,
    status: "PAUSED",
  });
  console.log(`   ✅ Conjunto criado: ${adset.id}\n`);

  // 3. Upload images
  console.log("3️⃣  Fazendo upload das imagens...");
  const img02Result = await uploadImage(path.join(CREATIVE_DIR, "02.jpeg"));
  const img02Hash = Object.values(img02Result.images)[0].hash;
  console.log(`   ✅ Imagem 02 enviada: ${img02Hash}`);

  const img03Result = await uploadImage(path.join(CREATIVE_DIR, "03.jpeg"));
  const img03Hash = Object.values(img03Result.images)[0].hash;
  console.log(`   ✅ Imagem 03 enviada: ${img03Hash}\n`);

  // 4. Upload video
  console.log("4️⃣  Fazendo upload do vídeo (pode demorar ~1 min)...");
  const videoResult = await uploadVideo(path.join(CREATIVE_DIR, "Giselli Alonso - Dia das mães  (1).MOV"));
  const videoId = videoResult.id;
  console.log(`   ✅ Vídeo enviado: ${videoId}\n`);

  // 5. Ad Creatives
  console.log("5️⃣  Criando ad creatives...");

  const creativeVideo = await apiPost(`/${ACCOUNT}/adcreatives`, {
    access_token: TOKEN,
    name: "AD01_DiaMaes_Video",
    page_id: PAGE_ID,
    object_story_spec: JSON.stringify({
      page_id: PAGE_ID,
      video_data: {
        video_id: videoId,
        message: COPY_VIDEO,
        call_to_action: JSON.parse(CTA_WPP),
      },
    }),
    degrees_of_freedom_spec: JSON.stringify({ creative_features_spec: { standard_enhancements: { enroll_status: "OPT_OUT" } } }),
  });
  console.log(`   ✅ Creative vídeo: ${creativeVideo.id}`);

  const creativeImg02 = await apiPost(`/${ACCOUNT}/adcreatives`, {
    access_token: TOKEN,
    name: "AD02_DiaMaes_Img02",
    page_id: PAGE_ID,
    object_story_spec: JSON.stringify({
      page_id: PAGE_ID,
      link_data: {
        image_hash: img02Hash,
        message: COPY_IMG02,
        call_to_action: JSON.parse(CTA_WPP),
      },
    }),
    degrees_of_freedom_spec: JSON.stringify({ creative_features_spec: { standard_enhancements: { enroll_status: "OPT_OUT" } } }),
  });
  console.log(`   ✅ Creative imagem 02: ${creativeImg02.id}`);

  const creativeImg03 = await apiPost(`/${ACCOUNT}/adcreatives`, {
    access_token: TOKEN,
    name: "AD03_DiaMaes_Img03",
    page_id: PAGE_ID,
    object_story_spec: JSON.stringify({
      page_id: PAGE_ID,
      link_data: {
        image_hash: img03Hash,
        message: COPY_IMG03,
        call_to_action: JSON.parse(CTA_WPP),
      },
    }),
    degrees_of_freedom_spec: JSON.stringify({ creative_features_spec: { standard_enhancements: { enroll_status: "OPT_OUT" } } }),
  });
  console.log(`   ✅ Creative imagem 03: ${creativeImg03.id}\n`);

  // 6. Ads
  console.log("6️⃣  Criando anúncios...");

  const ad1 = await apiPost(`/${ACCOUNT}/ads`, {
    access_token: TOKEN,
    name: "AD01_DiaMaes_Video",
    adset_id: adset.id,
    creative: JSON.stringify({ creative_id: creativeVideo.id }),
    status: "PAUSED",
  });
  console.log(`   ✅ Anúncio 1 (vídeo): ${ad1.id}`);

  const ad2 = await apiPost(`/${ACCOUNT}/ads`, {
    access_token: TOKEN,
    name: "AD02_DiaMaes_Pacotes",
    adset_id: adset.id,
    creative: JSON.stringify({ creative_id: creativeImg02.id }),
    status: "PAUSED",
  });
  console.log(`   ✅ Anúncio 2 (imagem pacotes): ${ad2.id}`);

  const ad3 = await apiPost(`/${ACCOUNT}/ads`, {
    access_token: TOKEN,
    name: "AD03_DiaMaes_CTA",
    adset_id: adset.id,
    creative: JSON.stringify({ creative_id: creativeImg03.id }),
    status: "PAUSED",
  });
  console.log(`   ✅ Anúncio 3 (imagem CTA): ${ad3.id}\n`);

  console.log("═══════════════════════════════════════════════");
  console.log("✅ CAMPANHA CRIADA COM SUCESSO (status: PAUSADA)");
  console.log("═══════════════════════════════════════════════");
  console.log(`Campanha: ${campaign.id}`);
  console.log(`Conjunto: ${adset.id}`);
  console.log(`Anúncios: ${ad1.id}, ${ad2.id}, ${ad3.id}`);
  console.log("\n⚠️  Revise no Gerenciador de Anúncios e ATIVE quando estiver pronto.");
  console.log(`   https://www.facebook.com/adsmanager/manage/campaigns?act=${ACCOUNT.replace("act_", "")}\n`);
}

main().catch((err) => {
  console.error("\n❌ Erro:", err.message);
  process.exit(1);
});
