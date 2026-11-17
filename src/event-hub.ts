import type { CloudEvent } from './chassis/cloudevent.js';

export type ObservedEvent = {
  topic: string;
  receivedAt: string;
  event: CloudEvent;
};

type Listener = (e: ObservedEvent) => void;

/**
 * Tudo que passa pelo barramento (assinaturas observer, sem filtro), em memória:
 * um buffer circular para o histórico recente e fan-out para conexões SSE.
 *
 * Limitação conhecida: com várias réplicas do BFF, cada uma recebe só parte dos
 * eventos (a fila é compartilhada). Para a demo roda com uma réplica; em
 * produção, uma assinatura por réplica ou Redis Pub/Sub resolveria.
 */
export function createEventHub(capacity = 500) {
  const buffer: ObservedEvent[] = [];
  const seen = new Set<string>();
  const listeners = new Set<Listener>();

  return {
    push(topic: string, event: CloudEvent) {
      if (seen.has(event.id)) return false; // entrega duplicada do broker
      seen.add(event.id);
      const observed = { topic, receivedAt: new Date().toISOString(), event };
      buffer.push(observed);
      if (buffer.length > capacity) seen.delete(buffer.shift()!.event.id);
      for (const listener of listeners) listener(observed);
      return true;
    },
    recent(correlationId?: string, limit = 200): ObservedEvent[] {
      const items = correlationId ? buffer.filter((e) => e.event.correlationid === correlationId) : buffer;
      return items.slice(-limit);
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get connections() {
      return listeners.size;
    },
  };
}

export type EventHub = ReturnType<typeof createEventHub>;
