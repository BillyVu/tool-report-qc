export type GeminiFailureKind = 'RETRY' | 'FINAL';

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export function classifyGeminiError(error: unknown): GeminiFailureKind {
  const value = error as { status?: number; code?: number };
  return RETRYABLE_STATUS_CODES.has(value?.status ?? value?.code ?? 0) ? 'RETRY' : 'FINAL';
}

export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000 * 2 ** attempt, 60 * 60 * 1000);
  return Math.round(base * (1 + random() * 0.2));
}

export function shouldOpenCircuit(consecutiveQuotaFailures: number): boolean {
  return consecutiveQuotaFailures >= 3;
}
