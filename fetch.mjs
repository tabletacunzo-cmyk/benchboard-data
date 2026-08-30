// BenchBoard — pipeline dati (senza chiavi, gira su GitHub Actions una volta al giorno)
// Fonti: OpenRouter (indici AA + prezzi + contesto + date), LMArena dataset (immagini/video/vision),
// TTS Arena V2 (voce), Open ASR Leaderboard (trascrizione), Hugging Face (embedding/audio + download).
// Output: data.json — un unico file con tutte le categorie, pronto per l'app.

import fs from "node:fs";

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const alphaTokens = (s) => (s.toLowerCase().match(/[a-z]+/g) || []).filter((t) => t.length >= 3);
const fmtCompact = (n) =>
  n >= 1e9 ? (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B"
  : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K"
  : String(n);
const fmt1 = (v) => Number(v).toFixed(1);

const ORG_PRETTY = {
  openai: "OpenAI", anthropic: "Anthropic", google: "Google", xai: "xAI", zai: "Z AI",
  meta: "Meta", qwen: "Qwen", alibaba: "Alibaba", deepseek: "DeepSeek", moonshotai: "Moonshot AI",
  microsoft: "Microsoft", minimax: "MiniMax", baidu: "Baidu", tencent: "Tencent",
  bytedance: "ByteDance", nvidia: "NVIDIA", xiaomi: "Xiaomi", kuaishou: "Kuaishou",
  mistral: "Mistral AI", cohere: "Cohere", blackforestlabs: "Black Forest Labs",
  lg: "LG AI Research", sktelecom: "SK Telecom", upstage: "Upstage", stepfun: "StepFun",
  meituan: "Meituan", nexagi: "NEX AGI", amazon: "Amazon", perplexity: "Perplexity",
};
const prettyOrg = (org) => ORG_PRETTY[(org || "").toLowerCase()] || (org ? org[0].toUpperCase() + org.slice(1) : "");

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "BenchBoard/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.url} → ${res.status}`);
  return res.json();
}

// ---------- OpenRouter (testo: indici, prezzi, contesto, date; immagini: costo/immagine) ----------

const VENDOR_TOKENS = new Set(["openai","google","anthropic","xai","zai","meta","qwen","alibaba","moonshotai","deepseek","minimax","microsoft","bytedance","tencent","baidu","nvidia","mistral","cohere","amazon","perplexity","xiaomi","kuaishou","kling","upstage","stepfun","lg","meituan","nexagi","moonvalley","genmo","haiper","pika","runway","luma","leonardo","krea","vidu","elevenlabs","blackforestlabs"]);

function parseOpenRouter(orData) {
  return orData.map((m) => {
    const pricing = m.pricing || {};
    const prompt = parseFloat(pricing.prompt);
    const completion = parseFloat(pricing.completion);
    const imageOutput = parseFloat(pricing.image_output);
    const price1MBlended =
      prompt >= 0 && completion >= 0 && (prompt > 0 || completion > 0)
        ? ((3 * prompt + completion) / 4) * 1e6
        : imageOutput > 0 ? null : prompt >= 0 && completion >= 0 ? 0 : null;
    const aa = m.benchmarks?.artificial_analysis || {};
    const metrics = [];
    if (aa.coding_index != null) metrics.push({ label: "Coding Index", value: fmt1(aa.coding_index), fraction: Math.min(aa.coding_index / 100, 1) });
    if (aa.agentic_index != null) metrics.push({ label: "Agentic Index", value: fmt1(aa.agentic_index), fraction: Math.min(aa.agentic_index / 100, 1) });
    return {
      id: norm(m.id),
      nameWords: alphaTokens(m.name || ""),
      nameNorm: norm(m.name || ""),
      name: m.name || "",
      orgRaw: (m.id.split("/")[0] || "").toLowerCase(),
      score: aa.intelligence_index ?? null,
      scoreLabel: "Intelligence Index",
      metrics,
      contextWindow: m.context_length ?? null,
      price1MBlended,
      imagePrice: imageOutput > 0 ? imageOutput * 1000 : null,
      outputTps: null,
      releaseDate: m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : null,
      hfIdNorm: m.hugging_face_id ? norm(m.hugging_face_id) : null,
    };
  });
}

function entryFromOr(o, category) {
  return {
    id: o.idNorm, name: o.name, org: prettyOrg(o.orgRaw), category,
    score: o.score, scoreLabel: o.scoreLabel,
    metrics: o.metrics, price1MBlended: o.price1MBlended, imagePrice: o.imagePrice,
    outputTps: o.outputTps, contextWindow: o.contextWindow, releaseDate: o.releaseDate,
    downloads: null, likes: null, trendingScore: null, hfUrl: null,
  };
}

function matchOr(entries, orModels) {
  const byKey = new Map();
  for (const o of orModels) {
    byKey.set(o.idNorm, o); byKey.set(o.nameNorm, o);
    if (o.hfIdNorm) byKey.set(o.hfIdNorm, o);
  }
  return entries.map((e) => {
    const nName = norm(e.name || ""), nId = norm(e.id || "");
    let hit = byKey.get(nName) || byKey.get(nId) || null;
    if (!hit) {
      const eT = new Set(alphaTokens(e.name));
      const eD = new Set(nName.match(/\d/g) || []);
      if (eT.size >= 2) {
        // prefisso: nome OR (≥8) prefisso del nome entry, resto senza cifre
        let bestP = null, bestLen = 0;
        for (const o of orModels) {
          const k = o.nameNorm;
          if (k.length >= 8 && nName.startsWith(k) && k.length > bestLen) {
            const rest = nName.slice(k.length);
            if (!rest || !/\d/.test(rest[0])) { bestP = o; bestLen = k.length; }
          }
        }
        hit = bestP;
      }
    }
    if (!hit) {
      // inverso a parole: parole OR (meno venditore) tutte nell'entry, min 2, cifre coperte
      const eT = new Set(alphaTokens(e.name));
      const eD = new Set(nName.match(/\d/g) || []);
      let best = null, bestExtra = 99;
      for (const o of orModels) {
        const oT = new Set(o.nameWords.filter((w) => !VENDOR_TOKENS.has(w)));
        if (oT.size < 2 || ![...oT].every((t) => eT.has(t))) continue;
        const oD = new Set(o.nameNorm.match(/\d/g) || []);
        if (![...oD].every((d) => eD.has(d))) continue;
        const extra = eT.size - oT.size;
        if (extra < bestExtra) { best = o; bestExtra = extra; }
      }
      hit = best;
    }
    if (!hit) return e;
    return {
      ...e,
      price1MBlended: e.price1MBlended ?? hit.price1MBlended,
      imagePrice: e.imagePrice ?? hit.imagePrice,
      contextWindow: e.contextWindow ?? hit.contextWindow,
      releaseDate: e.releaseDate ?? hit.releaseDate,
    };
  });
}

// ---------- LMArena (dataset pubblico, /rows top 100 = già in ordine di rank) ----------

async function fetchLma(cfg) {
  const d = await getJson(
    `https://datasets-server.huggingface.co/rows?dataset=lmarena-ai/leaderboard-dataset&config=${cfg}&split=latest&offset=0&length=100`
  );
  return (d.rows || []).map((r) => r.row).filter(Boolean);
}

function lmaEntries(rows, category) {
  return rows.map((o) => {
    const metrics = [];
    if (o.vote_count != null) metrics.push({ label: "Voti", value: fmtCompact(o.vote_count), fraction: null });
    if (o.license) metrics.push({ label: "Licenza", value: o.license, fraction: null });
    return {
      id: norm(o.model_name), name: o.model_name, org: prettyOrg(o.organization), category,
      score: o.rating ?? null, scoreLabel: "LMArena Elo", metrics,
      price1MBlended: null, imagePrice: null, outputTps: null, contextWindow: null,
      downloads: null, likes: null, releaseDate: null, hfUrl: null,
    };
  });
}

// ---------- TTS Arena V2 ----------

async function fetchTts() {
  const d = await getJson("https://tts-agi-tts-arena-v2.hf.space/api/leaderboard");
  return (d.rows || []).map((o) => {
    const metrics = [];
    if (o.winRate != null) metrics.push({ label: "Win Rate", value: (o.winRate).toFixed(1) + "%", fraction: Math.min(o.winRate / 100, 1) });
    if (o.totalVotes != null) metrics.push({ label: "Voti", value: fmtCompact(o.totalVotes), fraction: null });
    if (o.tier) metrics.push({ label: "Tier", value: o.tier, fraction: null });
    return {
      id: norm(o.name || o.id), name: o.name || o.id, org: "", category: "tts",
      score: o.elo ?? null, scoreLabel: "TTS Arena Elo", metrics,
      price1MBlended: null, imagePrice: null, outputTps: null, contextWindow: null,
      downloads: null, likes: null, releaseDate: null, hfUrl: null,
    };
  });
}

// ---------- Open ASR Leaderboard (config gradio dello Space) ----------

async function fetchAsr() {
  const cfg = await getJson("https://hf-audio-open-asr-leaderboard.hf.space/config");
  let data = null;
  for (const c of cfg.components || []) {
    if (c.type === "dataframe" && c.props?.value) {
      const headers = c.props.value.headers || [];
      if (headers.some((h) => String(h).includes("Average WER"))) { data = c.props.value.data; break; }
    }
  }
  if (!data) return [];
  return data.map((row) => {
    const html = String(row[2] ?? "");
    const name = (html.match(/>([^<]+)<\/a>/) || [])[1] || html;
    const wer = Number(row[3]);
    const rtfx = Number(row[4]);
    const metrics = [];
    if (!Number.isNaN(rtfx) && rtfx > 0) metrics.push({ label: "RTFx", value: rtfx.toFixed(1), fraction: Math.min(rtfx / 100, 1) });
    if (!Number.isNaN(Number(row[0]))) metrics.push({ label: "Posizione", value: String(row[0]), fraction: null });
    const orgSlug = name.split("/")[0] || "";
    return {
      id: norm(name), name, org: prettyOrg(orgSlug), category: "stt",
      score: Number.isNaN(wer) ? null : 100 - wer, scoreLabel: "ASR Accuracy", metrics,
      price1MBlended: null, imagePrice: null, outputTps: null, contextWindow: null,
      downloads: null, likes: null, releaseDate: null, hfUrl: null,
    };
  }).filter((e) => e.score != null);
}

// ---------- Hugging Face (popolarità per embedding/audio + arricchimento) ----------

async function fetchHf(tag, limit = 100) {
  const d = await getJson(
    `https://huggingface.co/api/models?pipeline_tag=${encodeURIComponent(tag)}&sort=downloads&direction=-1&limit=${limit}`
  );
  return d.map((o) => ({
    id: norm(o.id), name: o.id, org: prettyOrg(o.id.split("/")[0]), category: "",
    score: null, scoreLabel: "Downloads", metrics: [],
    downloads: o.downloads ?? null, likes: o.likes ?? null,
    releaseDate: (o.createdAt || "").slice(0, 10) || null, hfUrl: "https://huggingface.co/" + o.id,
    price1MBlended: null, imagePrice: null, outputTps: null, contextWindow: null,
  }));
}

function enrichDownloads(entries, hfList) {
  const byKey = new Map();
  for (const h of hfList) { byKey.set(h.id, h); byKey.set(norm(h.name), h); }
  return entries.map((e) => {
    const h = byKey.get(norm(e.name)) || byKey.get(e.id);
    if (!h) return e;
    return { ...e, downloads: e.downloads ?? h.downloads, likes: e.likes ?? h.likes, hfUrl: e.hfUrl ?? h.hfUrl };
  });
}

// ---------- Assemblaggio ----------

function finalize(entries) {
  const sorted = [...entries].sort((a, b) =>
    (b.score ?? b.downloads ?? -Infinity) - (a.score ?? a.downloads ?? -Infinity)
  );
  const maxScore = sorted[0]?.score ?? 0;
  const maxDl = sorted[0]?.downloads ?? 0;
  const seen = new Map();
  return sorted.map((e) => {
    const n = seen.get(e.id) || 0;
    seen.set(e.id, n + 1);
    let scoreFraction = null;
    if (e.score != null && maxScore > 0) scoreFraction = Math.min(e.score / maxScore, 1);
    else if (e.downloads != null && maxDl > 0) scoreFraction = Math.min(e.downloads / maxDl, 1);
    return { ...e, id: n === 0 ? e.id : `${e.id}-${n + 1}`, scoreFraction };
  });
}

const hfDownloadsFor = {};
for (const [tag, key] of [["feature-extraction", "embeddings"], ["text-to-audio", "audio"]]) {
  hfDownloadsFor[key] = await fetchHf(tag).then((l) =>
    l.map((e) => ({ ...e, category: key, metrics: (e.likes != null ? [{ label: "Likes", value: fmtCompact(e.likes), fraction: null }] : []) }))
  );
}

const orData = await getJson("https://openrouter.ai/api/v1/models");
const orModels = parseOpenRouter(orData.data || []);

const [lmaImage, lmaVideo, lmaVision] = await Promise.all([
  fetchLma("text_to_image"), fetchLma("text_to_video"), fetchLma("vision"),
]);
const [ttsRows, asrRows] = await Promise.all([fetchTts(), fetchAsr()]);

const textEntries = finalize(
  matchOr(
    orModels
      .filter((o) => o.score != null)
      .map((o) => entryFromOr(o, "text"))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 150),
    orModels
  )
);

const imageEntries = finalize(matchOr(enrichDownloads(lmaEntries(lmaImage, "image"),
  await fetchHf("text-to-image").then((l) => l.map((e) => ({ ...e, category: "image" })))), orModels));
const videoEntries = finalize(matchOr(lmaEntries(lmaVideo, "video"), orModels));
const multimodalEntries = finalize(matchOr(enrichDownloads(lmaEntries(lmaVision, "multimodal"),
  await fetchHf("image-text-to-text").then((l) => l.map((e) => ({ ...e, category: "multimodal" })))), orModels));
const ttsEntries = finalize(matchOr(ttsRows, orModels));
const sttEntries = finalize(matchOr(asrRows, orModels));

const out = {
  generatedAt: new Date().toISOString(),
  categories: {
    text: textEntries,
    image: imageEntries,
    tts: ttsEntries,
    stt: sttEntries,
    video: videoEntries,
    multimodal: multimodalEntries,
    embeddings: finalize(hfDownloadsFor.embeddings),
    audio: finalize(hfDownloadsFor.audio),
  },
};

fs.writeFileSync("data.json", JSON.stringify(out));
console.log(
  "data.json scritto:",
  Object.entries(out.categories).map(([k, v]) => `${k}=${v.length}`).join(", "),
  "| generato:", out.generatedAt
);
