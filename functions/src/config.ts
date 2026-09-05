import { defineSecret } from 'firebase-functions/params';

export const vertexApiKey = defineSecret('VERTEX_AI_API_KEY');
// Only the active Vertex credential is injected into deployed functions.
// Other provider slots remain documented but cannot expand the attack surface
// or block deployment while Vertex is the only supported route.
export const providerSecrets = [vertexApiKey];

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = {
  textProvider: 'vertex',
  imageProvider: 'vertex',
  aiBaseUrl: process.env.AI_BASE_URL ?? 'https://api.openai.com/v1',
  textModel: 'gemini-2.5-flash-lite',
  textFallbackModel: 'gemini-2.5-flash',
  imageModel: 'gemini-2.5-flash-image',
  vertexProject: process.env.VERTEX_AI_PROJECT ?? 'hackathon-mmu-2026',
  vertexLocation: process.env.VERTEX_AI_LOCATION ?? 'global',
  vertexModel: process.env.VERTEX_AI_MODEL ?? 'gemini-2.5-flash-lite',
  openRouterBaseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
  openRouterModel: process.env.OPENROUTER_MODEL ?? 'google/gemini-2.5-flash',
  xplabsBaseUrl: process.env.XPLABS_AI_BASE_URL ?? '',
  xplabsModel: process.env.XPLABS_AI_MODEL ?? '',
  imageAllowlist: new Set(
    (process.env.AI_IMAGE_ALLOWLIST ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  ),
  dryRun: process.env.AI_DRY_RUN === 'true',
  quotaPeriod: process.env.QUOTA_PERIOD === 'daily' ? 'daily' : 'monthly',
  questionQuota: numberEnv('QUESTION_QUOTA', 15),
  imageQuota: numberEnv('IMAGE_QUOTA', 5),
  maxDocumentBytes: numberEnv('MAX_DOCUMENT_BYTES', 25 * 1024 * 1024),
  maxDocumentChars: numberEnv('MAX_DOCUMENT_CHARS', 120_000),
  generationTimeoutMs: numberEnv('AI_TIMEOUT_MS', 90_000),
};

export function getAiApiKey(): string {
  const value = process.env.AI_API_KEY;
  if (!value && !config.dryRun) {
    throw new Error('AI_API_KEY is not configured as a Firebase secret.');
  }
  return value ?? '';
}

export function getProviderSecret(provider: string): string {
  const value = provider === 'vertex'
    ? vertexApiKey.value() || process.env.VERTEX_AI_API_KEY || process.env.VERTEX_AI_ACCESS_TOKEN
      : provider === 'openrouter'
      ? process.env.OPENROUTER_API_KEY
      : provider === 'xplabs'
        ? process.env.XPLABS_AI_API_KEY
        : getAiApiKey();
  if (!value && !config.dryRun) throw new Error(`${provider} credentials are not configured.`);
  return value ?? '';
}

export function quotaPeriodKey(now = new Date()): string {
  if (config.quotaPeriod === 'daily') {
    return now.toISOString().slice(0, 10);
  }
  return now.toISOString().slice(0, 7);
}
