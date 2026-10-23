/**
 * Shared Gemini Live model helpers for the persona client.
 *
 * Verified model quirks:
 *  - `gemini-3.8-live` must NOT receive a `thinkingConfig`.
 *  - `gemini-3.8-live-extended-thinking` requires a `thinkingLevel`
 *    (`low`/`medium`/`high`).
 *  - Live 3.8 models reject TEXT-only response modalities (close code 1007);
 *    the persona client requests AUDIO with `outputAudioTranscription`.
 */

export type ThinkingLevelName = 'minimal' | 'low' | 'medium' | 'high';

/**
 * `gemini-3.8-live` must omit thinkingConfig entirely; the extended-thinking
 * model requires one, so it defaults to `low` when none is configured.
 */
export function resolveThinkingLevel(model: string, level: string | undefined): string | null {
  const normalisedModel = model.replace(/^models\//, '');
  const explicit = level?.trim().toLowerCase() || null;

  if (normalisedModel === 'gemini-3.8-live') return null;
  if (normalisedModel === 'gemini-3.8-live-extended-thinking') return explicit ?? 'low';
  return explicit;
}
