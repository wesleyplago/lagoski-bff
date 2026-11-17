import type { CloudEvent } from '../chassis/cloudevent.js';

/** O BFF não publica eventos: só observa o barramento. */
export function contractSamples(): CloudEvent[] {
  return [];
}
