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

// v5.2 — case CANONICHE: chiavi normalizzate (minuscolo, senza simboli) → nome display
// unico. Così "Moonshot"/"Moonshot AI", "Z-ai"/"Z.ai"/"Zai-org", "Meta-llama"/"Facebook"
// sono UNA casa sola: stessa schermata casa, stesso logo.
const ORG_MAP = {
  openai: "OpenAI", anthropic: "Anthropic", google: "Google", googledeepmind: "Google DeepMind",
  xai: "xAI", zai: "Z AI", zaiorg: "Z AI", meta: "Meta", metallama: "Meta", facebook: "Meta",
  qwen: "Qwen", alibaba: "Alibaba", deepseek: "DeepSeek", deepseekai: "DeepSeek",
  moonshot: "Moonshot AI", moonshotai: "Moonshot AI",
  microsoft: "Microsoft", microsoftai: "Microsoft", ibm: "IBM", ibmgranite: "IBM", ibmresearch: "IBM Research",
  minimax: "MiniMax", minimaxai: "MiniMax", mistral: "Mistral AI", mistralai: "Mistral AI",
  cohere: "Cohere", coherelabs: "Cohere", nvidia: "NVIDIA", baai: "BAAI",
  baidu: "Baidu", tencent: "Tencent", bytedance: "ByteDance", xiaomi: "Xiaomi", chinamobile: "China Mobile",
  kuaishou: "Kuaishou", kling: "Kling", kwaipilot: "Kwaipilot", meituan: "Meituan", longcat: "LongCat",
  upstage: "Upstage", stepfun: "StepFun", lg: "LG AI Research", sktelecom: "SK Telecom",
  nexagi: "NEX AGI", nex: "NEX AGI",
  luma: "Luma", lumaai: "Luma", lumalabs: "Luma", leonardo: "Leonardo", leonardoai: "Leonardo",
  moonvalley: "Moon Valley", videorebirth: "VideoRebirth", genmo: "Genmo", haiper: "Haiper",
  pika: "Pika", runway: "Runway", krea: "Krea", vidu: "Vidu", seedance: "Seedance",
  thinkingmachines: "Thinking Machines", hidream: "HiDream", liquidai: "LiquidAI",
  blackforestlabs: "Black Forest Labs", bfl: "Black Forest Labs",
  amazon: "Amazon", perplexity: "Perplexity", elevenlabs: "ElevenLabs", assemblyai: "AssemblyAI",
  inclusionai: "InclusionAI", unsloth: "Unsloth", unslothai: "Unsloth", allenai: "AllenAI",
  tii: "TII", technologyinnovationinstitute: "TII", alephalpha: "Aleph Alpha", deepl: "DeepL",
  openmoss: "OpenMOSS", openmossteam: "OpenMOSS", acestep: "ACE-Step",
  // v5.5 — slug HF ufficiali delle case (per il filtro repo-ufficiale): "deepseek-ai",
  // "meta-llama", "Qwen", "mistralai", "stabilityai"... normalizzati da norm()
  deepseekai: "DeepSeek", metallama: "Meta", qwen: "Qwen", allenai: "AllenAI",
  ibmresearch: "IBM", ibmgranite: "IBM", coherelabs: "Cohere", naver: "Naver",
  nvidia: "NVIDIA", microsoft: "Microsoft", google: "Google", googledeepmind: "Google DeepMind",
  stability: "Stability AI", stabilityai: "Stability AI", blackforestlabs: "Black Forest Labs",
  bfl: "Black Forest Labs", tencent: "Tencent", tencentyoutu: "Tencent", bytedance: "ByteDance",
  moonshot: "Moonshot AI", zaiorg: "Z AI", zai: "Z AI", zaiorganization: "Z AI",
  kuaishou: "Kuaishou", kling: "Kling", kwaipilot: "Kwaipilot", xiaomi: "Xiaomi",
  mispeech: "Xiaomi", stepfun: "StepFun", upstage: "Upstage", lg: "LG AI Research",
  exaone: "LG AI Research", thinkingmachines: "Thinking Machines", inclusionai: "InclusionAI",
  bigcode: "BigCode", nomicai: "Nomic AI", jinaai: "Jina AI", voyageai: "VoyageAI",
  elevenlabs: "ElevenLabs", assemblyai: "AssemblyAI", cartesia: "Cartesia",
  kyutai: "Kyutai", suno: "Suno", openaudio: "OpenAudio", fishaudio: "Fish Audio",
  ideogram: "Ideogram", recraft: "Recraft", lightricks: "Lightricks", runway: "Runway",
  luma: "Luma", lumaai: "Luma", lumalabs: "Luma", genmo: "Genmo", haiper: "Haiper",
  pika: "Pika", vidu: "Vidu", seedance: "Seedance", moonvalley: "Moon Valley",
  kandinsky: "Kandinsky", hidream: "HiDream", minimax: "MiniMax", minimaxai: "MiniMax",
  baichuan: "Baichuan", baidu: "Baidu", alephalpha: "Aleph Alpha", tii: "TII",
  technologyinnovationinstitute: "TII", openbmb: "OpenBMB", "01ai": "01.AI",
  yitutech: "YituTech", abeai: "ABE.AI", sapling: "Sapling AI", paradigmailabe: "Paradigm AI Lab",
};
const titleOrg = (org) => org.replace(/(^|[\s\-_.])([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase());
const prettyOrg = (org) => {
  if (!org) return "";
  return ORG_MAP[norm(org)] || titleOrg(org);
};

// v4.5 — nomi leggibili dagli slug: "gpt-image-2 (medium)" → "GPT Image 2 (Medium)"
const ACRONYMS = {
  gpt: "GPT", llm: "LLM", ai: "AI", sd: "SD", xl: "XL", xxl: "XXL", vlm: "VLM",
  api: "API", tts: "TTS", asr: "ASR", ocr: "OCR", ideogram: "Ideogram",
  gemini: "Gemini", claude: "Claude", flux: "FLUX", imagen: "Imagen", mistral: "Mistral",
  recraft: "Recraft", reve: "Reve", ide: "IDE", omni: "Omni", neo: "Neo", ultra: "Ultra",
  pro: "Pro", preview: "Preview", mini: "Mini", nano: "Nano", banana: "Banana",
  flash: "Flash", image: "Image", video: "Video", lite: "Lite", high: "High",
  medium: "Medium", low: "Low", max: "Max", open: "Open", web: "Web", search: "Search",
};
function prettyName(slug) {
  return String(slug || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => {
      const lw = w.toLowerCase();
      if (ACRONYMS[lw]) return ACRONYMS[lw];
      if (/^\d/.test(w) || /^v\d/i.test(lw)) return w; // versioni: "3.1", "v2"
      return lw[0].toUpperCase() + lw.slice(1);
    })
    .join(" ");
}

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "BenchBoard/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.url} → ${res.status}`);
  return res.json();
}

// ---------- OpenRouter (testo: indici, prezzi, contesto, date; immagini: costo/immagine) ----------

const VENDOR_TOKENS = new Set(["openai","google","anthropic","xai","zai","meta","qwen","alibaba","moonshotai","deepseek","minimax","microsoft","bytedance","tencent","baidu","nvidia","mistral","cohere","amazon","perplexity","xiaomi","kuaishou","kling","upstage","stepfun","lg","meituan","nexagi","moonvalley","genmo","haiper","pika","runway","luma","leonardo","krea","vidu","elevenlabs","blackforestlabs"]);

// v5.4 — nomi dei modelli di testo SENZA prefisso casa: "Anthropic: Claude Fable 5.1"
// → "Claude Fable 5.1" (la casa è già mostrata sotto il nome nell'app).
// Il prefisso si toglie SOLO se è davvero la casa del modello (orgRaw), così i nomi
// che contengono ":" per altri motivi restano intatti.
function stripOrgPrefix(name, orgRaw) {
  const s = String(name || "");
  const cut = s.indexOf(":");
  if (cut <= 0) return s;
  const prefix = s.slice(0, cut).trim();
  const p = norm(prefix), o = norm(orgRaw || "");
  // prefisso = casa esatta, oppure uno dei due contiene l'altro ("spaceXai"/"xai",
  // "mistral"/"mistralai", "ibm"/"ibmgranite") e il resto è un nome vero (non vuoto)
  const rest = s.slice(cut + 1).trim();
  const isOrg = p === o || (o.length >= 2 && (p.includes(o) || o.includes(p)));
  return isOrg && rest ? rest : s;
}

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
      name: stripOrgPrefix(m.name || "", m.id.split("/")[0] || ""),
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
      id: norm(o.model_name), name: prettyName(o.model_name), org: prettyOrg(o.organization), category,
      score: o.rating != null ? Math.round(o.rating) : null, scoreLabel: "LMArena Elo", metrics,
      price1MBlended: null, imagePrice: null, outputTps: null, contextWindow: null,
      downloads: null, likes: null, releaseDate: null, hfUrl: null,
    };
  });
}

// v5.2 — casa TTS ricavata dalla prima parola del nome ("MiniMax Speech 2.8 HD" →
// "MiniMax", "Eleven Turbo v2.5" → "ElevenLabs"): la fonte non la fornisce.
const TTS_ORG_GUESS = {
  minimax: "MiniMax", eleven: "ElevenLabs", openaudio: "OpenAudio", hume: "Hume AI",
  cartesia: "Cartesia", inworld: "Inworld", deepdub: "Deepdub", typecast: "Typecast",
  hithink: "HiThink", lightning: "Lightning", gradium: "Gradium", papla: "Papla",
  vocu: "Vocu", castleflow: "CastleFlow", luck: "Luck Dolphin", luna: "Luna TTS",
};
function guessTtsOrg(name) {
  const w = norm(String(name || "").split(/\s+/)[0] || "");
  return TTS_ORG_GUESS[w] || "";
}

async function fetchTts() {
  const d = await getJson("https://tts-agi-tts-arena-v2.hf.space/api/leaderboard");
  return (d.rows || []).map((o) => {
    const metrics = [];
    if (o.winRate != null) metrics.push({ label: "Win Rate", value: (o.winRate).toFixed(1) + "%", fraction: Math.min(o.winRate / 100, 1) });
    if (o.totalVotes != null) metrics.push({ label: "Voti", value: fmtCompact(o.totalVotes), fraction: null });
    if (o.tier) metrics.push({ label: "Tier", value: o.tier, fraction: null });
    return {
      id: norm(o.name || o.id), name: o.name || o.id, org: guessTtsOrg(o.name || o.id), category: "tts",
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
    const rawName = (html.match(/>([^<]+)<\/a>/) || [])[1] || html;
    // "elevenlabs/scribe_v2" → nome "Scribe V2", casa "Elevenlabs"
    const modelPart = rawName.includes("/") ? rawName.split("/").slice(1).join(" ") : rawName;
    const name = prettyName(modelPart);
    const wer = Number(row[3]);
    const rtfx = Number(row[4]);
    const metrics = [];
    if (!Number.isNaN(rtfx) && rtfx > 0) metrics.push({ label: "RTFx", value: rtfx.toFixed(1), fraction: Math.min(rtfx / 100, 1) });
    if (!Number.isNaN(Number(row[0]))) metrics.push({ label: "Posizione", value: String(row[0]), fraction: null });
    const orgSlug = rawName.includes("/") ? rawName.split("/")[0] : "";
    return {
      id: norm(name), name, org: prettyOrg(orgSlug), category: "stt",
      score: Number.isNaN(wer) ? null : Math.round((100 - wer) * 10) / 10, scoreLabel: "ASR Accuracy", metrics,
      price1MBlended: null, imagePrice: null, outputTps: null, contextWindow: null,
      downloads: null, likes: null, releaseDate: null, hfUrl: null,
    };
  }).filter((e) => e.score != null);
}

// ---------- Hugging Face (popolarità per embedding/audio + arricchimento) ----------

async function fetchHf(tag, limit = 100) {
  // v5.5 — DUE richieste: top per download + ultimi usciti (i modelli nuovi hanno
  // pochi download e non entrano mai nei top), fuse per id.
  const dl = await getJson(
    `https://huggingface.co/api/models?pipeline_tag=${encodeURIComponent(tag)}&sort=downloads&direction=-1&limit=${limit}`
  );
  const fresh = await getJson(
    `https://huggingface.co/api/models?pipeline_tag=${encodeURIComponent(tag)}&sort=createdAt&direction=-1&limit=1000`
  );
  const map = new Map();
  for (const o of [...dl, ...fresh]) {
    if (map.has(o.id)) continue;
    map.set(o.id, {
      id: norm(o.id), name: o.id, org: prettyOrg(o.id.split("/")[0]), category: "",
      score: null, scoreLabel: "Downloads", metrics: [],
      downloads: o.downloads ?? null, likes: o.likes ?? null,
      releaseDate: (o.createdAt || "").slice(0, 10) || null, hfUrl: "https://huggingface.co/" + o.id,
      price1MBlended: null, imagePrice: null, outputTps: null, contextWindow: null,
    });
  }
  return [...map.values()];
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

// v5.5 — COMPLETAMENTO: i modelli HF più scaricati della categoria che NON sono in
// classifica vengono aggiunti in coda con i loro download (es. DeepSeek-V4-Flash-Vision
// appena uscito, non ancora valutato da LMArena). Niente doppioni (match a token) e
// niente quantizzazioni/riposti di terzi (solo casa ufficiale = org con più modelli).
const STOP_TOKENS = new Set(["gguf","mlx","awq","gptq","exl3","exl2","fp8","int8","nvfp4","mxfp4","4bit","8bit","6bit","5bit","abliterated","uncensored","quantized","quant","dwarfstar","oq2e","iq2xxs","q2","q4","q8","base","distill","ggml","onnx","merge","merged","mergekit","lora","finetune","tuned","checkpoint","ckpt"]);
// v5.5 — RE della pappa conversione: presa sul nome NORMALIZZATO (le cifre non si
// staccano: "NVFP4"→"nvfp4"): gguf, ggml, nvfp, mxfp, fp8, 4bit, w4a16, qat...
const QUANT_RE = /gguf|ggml|nvfp|mxfp|awq|gptq|exl[23]|\bfp8\b|\bfp16\b|bf16|[_.-]?[4568]bit|qat|imatrix|autoround|int[48]|w4a16|q[458]_|q8_0|onnx|abliterated|uncensored|heretic|imatrix/i;
// v5.5 — repo ufficiale = casa nota (chiave ORG_MAP normalizzata): deepseek-ai, Qwen,
// meta-llama... Le ricariche di terzi (unsloth, mlx-community, nick vari) restano fuori.
const OFFICIAL_ORGS = new Set(Object.keys(ORG_MAP));
const isOfficialRepo = (org) => OFFICIAL_ORGS.has(norm(org));
function hfOnlyEntries(entries, hfList, category, maxAdd = 25) {
  const normName = (n) => norm(String(n || "").replace(/^[a-z0-9_.\-]+\//i, ""));
  const present = new Set();
  for (const e of entries) {
    const words = alphaTokens(e.name).filter((w) => !STOP_TOKENS.has(w));
    present.add(e.id);
    present.add(norm(e.name));
    if (words.length >= 2) present.add(words.sort().join("-"));
  }
  // v5.5 — candidati: prima le NOVITÀ ufficiali degli ultimi 45 giorni (es. DeepSeek
  // V4 Vision uscito ieri, pochi download), poi i top download. MaxAdd limita il totale.
  const now = Date.now();
  const freshCut = now - 45 * 24 * 3600 * 1000;
  const fresh = hfList.filter((h) => {
    const t = Date.parse(h.releaseDate || "");
    return Number.isFinite(t) && t >= freshCut;
  });
  const candidates = [...fresh, ...hfList];
  const added = [];
  for (const h of candidates) {
    if (added.length >= maxAdd) break;
    const orgSlug = String(h.name).includes("/") ? String(h.name).split("/")[0] : "";
    if (!orgSlug || !isOfficialRepo(orgSlug)) continue; // solo repo ufficiali
    const modelPart = normName(h.name);
    const slug = norm(String(h.name).split("/").pop() || "");
    const rawWords = alphaTokens(slug);
    // v5.5 — niente conversioni/quantizzazioni (GGUF, NVFP4...) né varianti abliterate:
    // il check va sul nome normalizzato perché i token perdono le cifre
    if (QUANT_RE.test(slug)) continue;
    const words = rawWords.filter((w) => !STOP_TOKENS.has(w));
    if (words.length < 2) continue; // nome troppo povero per dire che esiste
    const key = words.sort().join("-");
    const fullKey = norm(orgSlug) + "-" + key;
    if (present.has(key) || present.has(fullKey) || present.has(modelPart)) continue;
    present.add(key); present.add(fullKey);
    const isFresh = fresh.includes(h);
    added.push({
      ...h, category,
      id: modelPart, name: prettyName(String(h.name).split("/").pop()),
      org: prettyOrg(orgSlug),
      score: null, scoreLabel: "Downloads",
      metrics: [
        { label: "Download", value: fmtCompact(h.downloads || 0), fraction: null },
        { label: isFresh ? "Stato" : "Hugging Face", value: isFresh ? "Nuovo uscita" : "Modello aperto", fraction: null },
      ],
    });
  }
  return [...entries, ...added];
}

// ---------- Assemblaggio ----------

function finalize(entries) {
  // v5.5 — prima i modelli con punteggio (classifica vera), poi gli altri per download
  const sorted = [...entries].sort((a, b) => {
    const sa = a.score ?? -Infinity, sb = b.score ?? -Infinity;
    if (sa !== sb) return sb - sa;
    return (b.downloads ?? -Infinity) - (a.downloads ?? -Infinity);
  });
  const maxScore = sorted[0]?.score ?? 0;
  const maxDl = Math.max(...sorted.filter((e) => e.score == null).map((e) => e.downloads ?? 0), 0);
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
// v5.5 — niente conversioni di terzi (QUANT_RE definito sopra) e niente doppioni dello
// stesso modello caricato da utenti diversi: si tiene il repo più scaricato.
for (const [tag, key] of [["feature-extraction", "embeddings"], ["text-to-audio", "audio"]]) {
  const seenBase = new Map();
  const clean = await getJson(
    `https://huggingface.co/api/models?pipeline_tag=${encodeURIComponent(tag)}&sort=downloads&direction=-1&limit=400`
  ).then((d) => d.filter((o) => !QUANT_RE.test(o.id)));
  for (const o of clean) {
    const base = norm(o.id.split("/").pop() || o.id);
    if (seenBase.has(base)) continue; // stesso modello da un altro utente
    seenBase.set(base, o);
    if (seenBase.size >= 100) break;
  }
  hfDownloadsFor[key] = [...seenBase.values()].map((o) => ({
    id: norm(o.id), name: o.id, org: prettyOrg(o.id.split("/")[0]), category: key,
    score: null, scoreLabel: "Downloads",
    metrics: (o.likes != null ? [{ label: "Likes", value: fmtCompact(o.likes), fraction: null }] : []),
    downloads: o.downloads ?? null, likes: o.likes ?? null,
    releaseDate: (o.createdAt || "").slice(0, 10) || null, hfUrl: "https://huggingface.co/" + o.id,
    price1MBlended: null, imagePrice: null, outputTps: null, contextWindow: null,
  }));
}

const orData = await getJson("https://openrouter.ai/api/v1/models");
const orModels = parseOpenRouter(orData.data || []);

// v5.5 — anche per il testo: modelli HF ufficiali non in classifica AA in coda
const textHfList = await fetchHf("text-generation", 200).then((l) => l.map((e) => ({ ...e, category: "text" })));

const [lmaImage, lmaVideo, lmaVision] = await Promise.all([
  fetchLma("text_to_image"), fetchLma("text_to_video"), fetchLma("vision"),
]);
const [ttsRows, asrRows] = await Promise.all([fetchTts(), fetchAsr()]);

const textEntries = finalize(
  matchOr(
    hfOnlyEntries(
      orModels
        .filter((o) => o.score != null)
        .map((o) => entryFromOr(o, "text"))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 150),
      textHfList, "text"
    ),
    orModels
  )
);

const imageHfList = await fetchHf("text-to-image").then((l) => l.map((e) => ({ ...e, category: "image" })));
const imageEntries = finalize(matchOr(hfOnlyEntries(
  enrichDownloads(lmaEntries(lmaImage, "image"), imageHfList),
  imageHfList, "image"), orModels));
const videoEntries = finalize(matchOr(lmaEntries(lmaVideo, "video"), orModels));
const visionHfList = await fetchHf("image-text-to-text").then((l) => l.map((e) => ({ ...e, category: "multimodal" })));
const multimodalEntries = finalize(matchOr(hfOnlyEntries(
  enrichDownloads(lmaEntries(lmaVision, "multimodal"), visionHfList),
  visionHfList, "multimodal"), orModels));
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
