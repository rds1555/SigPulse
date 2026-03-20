/**
 * Daily summary generation via LLM API.
 * MAIN PROCESS ONLY — do not import this from the renderer; keys must never reach the frontend.
 *
 * API keys (main process only), in order:
 * 1. Groq key saved in Settings (encrypted local store via groq-credentials).
 * 2. GROQ_API_KEY from process.env (`.env` via dotenv in main/index.js).
 * 3. OPENAI_API_KEY or OPENAI_KEY — fallback when Groq is unset.
 * - GROQ_MODEL — optional override (default llama-3.3-70b-versatile).
 * OpenAI model: gpt-4o-mini.
 *
 * Note: mixtral-8x7b-32768 and llama3-70b-8192 are deprecated on Groq; default follows
 * https://console.groq.com/docs/deprecations (70B class → llama-3.3-70b-versatile).
 */

const OpenAI = require('openai');
const { getGroqApiKey } = require('./groq-credentials');

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
/** Groq production model ID (OpenAI-compatible chat completions). */
const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const OPENAI_MODEL = 'gpt-4o-mini';
/** Daily: JSON with summary + highlights + warnings + suggestions. */
const MAX_TOKENS = 720;
const TEMPERATURE = 0.45;

const SYSTEM_MESSAGE_DAILY_JSON =
  'You are an intelligent productivity assistant. You respond ONLY with valid JSON (no markdown, no code fences, no commentary). Ground every insight in the activity data, focus score, and behavior signals provided; do not invent numbers. Offer meaningful interpretation (patterns, distractions, focus quality, trends)—not a plain category-by-category description. Tone: concise, professional, actionable.';

/**
 * Strip patterns that could be API keys so error strings are safe to show in the renderer.
 * Full errors are still logged in the main process only.
 * @param {unknown} error
 * @returns {string}
 */
function errorMessageSafeForRenderer(error) {
  const raw =
    (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : null) ||
    (typeof error?.toString === 'function' ? error.toString() : '') ||
    'Unknown error';
  let out = raw;
  // Groq / OpenAI-style key fragments
  out = out.replace(/\bgsk_[\w-]+\b/gi, '[redacted]');
  out = out.replace(/\bsk-[a-zA-Z0-9]{10,}\b/g, '[redacted]');
  out = out.replace(/\bBearer\s+[\w._-]+\b/gi, 'Bearer [redacted]');
  const max = 280;
  if (out.length > max) {
    out = `${out.slice(0, max)}…`;
  }
  return out;
}

/**
 * @typedef {{
 *   summary: string,
 *   highlights: string[],
 *   warnings: string[],
 *   suggestions: string[],
 *   tags: string[],
 * }} DailyInsightStructured
 */

/** Must match storage preprocessor insight tag labels */
const DAILY_INSIGHT_TAG_LABELS = ['Deep Work', 'Distraction', 'Context Switching'];

/**
 * Dedupe and keep only allowed activity-derived insight tags (order preserved).
 * @param {unknown} insightTags
 * @returns {string[]}
 */
function normalizeInsightTags(insightTags) {
  const allowed = new Set(DAILY_INSIGHT_TAG_LABELS);
  if (!Array.isArray(insightTags)) return [];
  const out = [];
  const seen = new Set();
  for (const x of insightTags) {
    const t = String(x).trim();
    if (!allowed.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Strict JSON shape hint appended to the user prompt */
const DAILY_JSON_OUTPUT_RULES = `
Output requirements:
- Return a single JSON object only. No markdown, no code fences, no extra keys.
- Keys exactly: "summary", "highlights", "warnings", "suggestions". Do not include "tags" (assigned server-side).
- "summary": one string with 2–3 lines separated by newline characters; implications and patterns, not a category list; max ~120 characters per line.
- "highlights": array of 2–4 short strings (positive observations tied to the data).
- "warnings": array of 0–4 strings (issues or inefficiencies), or [] if none apply.
- "suggestions": array of 2–4 practical improvements.
- No emojis; no markdown inside strings.
- If tracked time is very low, say so in the summary and keep other arrays short or empty.
`.trim();

/**
 * @param {{ score?: number, label?: string } | null | undefined} focusScore
 * @returns {string}
 */
function formatFocusScoreForPrompt(focusScore) {
  const fs = focusScore && typeof focusScore === 'object' ? focusScore : { score: 0, label: 'Low' };
  const score = typeof fs.score === 'number' && Number.isFinite(fs.score) ? fs.score : 0;
  const label = typeof fs.label === 'string' && fs.label.trim() ? fs.label.trim() : 'Low';
  return `${score} (${label}) — 0–100; reflects idle, app switching, and deep-work balance`;
}

/**
 * Advanced structured user prompt: activity + focus + behavioral signals → JSON insight schema.
 * @param {{ [key: string]: number }} activityData Hours by category from getActivitySummary()
 * @param {{ score: number, label: string }} focusScore From getFocusScore()
 * @param {{ high_idle_time?: boolean, high_productivity?: boolean, frequent_context_switching?: boolean } | Record<string, unknown> | null | undefined} behavioralSignals From storage.getBehavioralSignalsFromActivity()
 * @returns {string}
 */
function buildDailyProductivityAssistantUserPrompt(activityData, focusScore, behavioralSignals) {
  const data = activityData && typeof activityData === 'object' ? activityData : {};
  const signals =
    behavioralSignals && typeof behavioralSignals === 'object' ? behavioralSignals : {};

  const prompt = `
You are an intelligent productivity assistant.

Analyze the user's activity data and generate meaningful insights.

Focus on:
- Productivity patterns
- Distractions
- Focus quality
- Behavioral trends

Return output in JSON format with:
- summary (2-3 lines)
- highlights (positive observations)
- warnings (issues or inefficiencies)
- suggestions (practical improvements)

Keep it concise, professional, and actionable.

Activity Data:
${JSON.stringify(data, null, 2)}

Focus Score: ${formatFocusScoreForPrompt(focusScore)}

Behavior Signals:
${JSON.stringify(signals, null, 2)}

${DAILY_JSON_OUTPUT_RULES}
`.trim();

  return prompt;
}

/**
 * Alias for {@link buildDailyProductivityAssistantUserPrompt} (backward-compatible export name).
 * @type {typeof buildDailyProductivityAssistantUserPrompt}
 */
const buildDailySummaryUserPrompt = buildDailyProductivityAssistantUserPrompt;

/** @deprecated Use buildDailyProductivityAssistantUserPrompt / buildDailySummaryUserPrompt */
const buildSummaryPrompt = buildDailySummaryUserPrompt;

const MAX_LINE_LEN = 220;
const MAX_ITEMS_PER_LIST = 4;

/**
 * @param {unknown} raw
 * @returns {DailyInsightStructured}
 */
function normalizeDailyStructured(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  let summary = typeof o.summary === 'string' ? o.summary.trim() : '';
  const lines = summary
    ? summary
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];
  summary = lines.join('\n') || 'Limited tracked time today — insights reflect partial activity only.';

  const clampStr = (s) => {
    const t = String(s).trim();
    if (!t) return '';
    return t.length > MAX_LINE_LEN ? `${t.slice(0, MAX_LINE_LEN - 1)}…` : t;
  };

  const toList = (key) => {
    const a = o[key];
    if (!Array.isArray(a)) return [];
    return a
      .map((x) => clampStr(x))
      .filter(Boolean)
      .slice(0, MAX_ITEMS_PER_LIST);
  };

  return {
    summary,
    highlights: toList('highlights'),
    warnings: toList('warnings'),
    suggestions: toList('suggestions'),
    tags: normalizeInsightTags(o.tags),
  };
}

/**
 * Strip optional ```json fences from model output.
 * @param {string} content
 * @returns {string}
 */
function stripMarkdownJsonFence(content) {
  let s = String(content).trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/im;
  const m = s.match(fenced);
  if (m) s = m[1].trim();
  return s;
}

/**
 * Parse model JSON into a normalized daily insight object.
 * @param {string} content
 * @returns {DailyInsightStructured}
 * @throws {SyntaxError|Error} If JSON is invalid or not an object
 */
function parseDailyStructuredFromModelContent(content) {
  const s = stripMarkdownJsonFence(content);
  let obj;
  try {
    obj = JSON.parse(s);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SyntaxError(`Invalid JSON from model: ${msg}`);
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('Model output must be a JSON object with summary, highlights, warnings, suggestions.');
  }
  return normalizeDailyStructured(obj);
}

/**
 * If `text` is our stored JSON daily insight, return the object; else null.
 * @param {string} text
 * @returns {DailyInsightStructured | null}
 */
function tryParseDailyStructuredFromText(text) {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t || t[0] !== '{') return null;
  try {
    const obj = JSON.parse(t);
    if (!obj || typeof obj !== 'object') return null;
    return normalizeDailyStructured(obj);
  } catch {
    return null;
  }
}

/**
 * @param {DailyInsightStructured} structured
 * @returns {string}
 */
function serializeDailyStructured(structured) {
  return JSON.stringify(structured);
}

/**
 * @param {import('openai').OpenAI} client
 * @param {Record<string, unknown>} args
 */
async function chatCompletionPreferJson(client, args) {
  try {
    return await client.chat.completions.create({
      ...args,
      response_format: { type: 'json_object' },
    });
  } catch (err) {
    console.warn('[Summary] response_format json_object not supported, retrying:', err?.message || err);
    return client.chat.completions.create(args);
  }
}

/**
 * Single daily insight completion (JSON mode when supported).
 * @param {import('openai').OpenAI} client
 * @param {string} model
 * @param {string} userContent
 */
async function requestDailySummaryCompletion(client, model, userContent) {
  return chatCompletionPreferJson(client, {
    model,
    messages: [
      { role: 'system', content: SYSTEM_MESSAGE_DAILY_JSON },
      { role: 'user', content: userContent },
    ],
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
  });
}

/**
 * Generate a daily summary using Groq (if GROQ_API_KEY) or OpenAI.
 * @param {{ [key: string]: number }} activitySummary From storage.getActivitySummary()
 * @param {{ score: number, label: string }} focusScore From storage.getFocusScore()
 * @param {Record<string, unknown> | null | undefined} preprocessorSignals From storage.getDailySummaryPreprocessorSignals(activitySummary) — used for server-side tags only
 * @param {Record<string, unknown> | null | undefined} behavioralSignals From storage.getBehavioralSignalsFromActivity(activitySummary) — included in the LLM user prompt
 * @returns {Promise<{ ok: true, text: string, structured: DailyInsightStructured } | { ok: false, error: string, errorCode?: string }>}
 */
const MISSING_AI_KEY_CODE = 'MISSING_AI_KEY';

async function generateDailySummary(activitySummary, focusScore, preprocessorSignals, behavioralSignals) {
  const groqKey = (getGroqApiKey() || process.env.GROQ_API_KEY || '').trim();
  const openaiKey = (process.env.OPENAI_API_KEY || process.env.OPENAI_KEY)?.trim();

  let client;
  let model;
  let providerLabel;

  if (groqKey) {
    client = new OpenAI({
      apiKey: groqKey,
      baseURL: GROQ_BASE_URL,
    });
    model = process.env.GROQ_MODEL?.trim() || GROQ_DEFAULT_MODEL;
    providerLabel = 'Groq';
  } else if (openaiKey) {
    client = new OpenAI({ apiKey: openaiKey });
    model = OPENAI_MODEL;
    providerLabel = 'OpenAI';
  } else {
    return {
      ok: false,
      errorCode: MISSING_AI_KEY_CODE,
      error: 'Please add your Groq API key in Settings to enable insights',
    };
  }

  const userContent = buildDailyProductivityAssistantUserPrompt(
    activitySummary || {},
    focusScore || { score: 0, label: 'Low' },
    behavioralSignals,
  );

  try {
    const response = await requestDailySummaryCompletion(client, model, userContent);

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return { ok: false, error: `Empty response from ${providerLabel}.` };
    }
    let structured;
    try {
      structured = parseDailyStructuredFromModelContent(raw);
    } catch (parseErr) {
      console.error('[Summary] Daily JSON parse failed:', parseErr, raw.slice(0, 500));
      return {
        ok: false,
        error: 'The model returned invalid JSON. Try Refresh Insights again.',
      };
    }
    structured = {
      ...structured,
      tags: normalizeInsightTags(preprocessorSignals?.insightTags),
    };
    const text = serializeDailyStructured(structured);
    return { ok: true, text, structured };
  } catch (error) {
    // Full error for operators only (terminal / main logs) — never forward raw secrets to the renderer.
    console.error('[Summary] Error generating summary:', error);
    return { ok: false, error: errorMessageSafeForRenderer(error) };
  }
}

/**
 * Minimal Groq chat completion to verify an API key (Settings "Test API Key").
 * @param {string} apiKey
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
async function testGroqApiKeyConnection(apiKey) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key) {
    return { ok: false, error: 'No API key to test.' };
  }
  const client = new OpenAI({
    apiKey: key,
    baseURL: GROQ_BASE_URL,
  });
  const model = process.env.GROQ_MODEL?.trim() || GROQ_DEFAULT_MODEL;
  try {
    await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'ok' }],
      max_tokens: 1,
      temperature: 0,
    });
    return { ok: true };
  } catch (error) {
    console.error('[Summary] Groq API key test failed:', error);
    return { ok: false, error: errorMessageSafeForRenderer(error) };
  }
}

module.exports = {
  MISSING_AI_KEY_CODE,
  buildSummaryPrompt,
  buildDailyProductivityAssistantUserPrompt,
  buildDailySummaryUserPrompt,
  formatFocusScoreForPrompt,
  generateDailySummary,
  testGroqApiKeyConnection,
  normalizeInsightTags,
  normalizeDailyStructured,
  parseDailyStructuredFromModelContent,
  tryParseDailyStructuredFromText,
  serializeDailyStructured,
};
