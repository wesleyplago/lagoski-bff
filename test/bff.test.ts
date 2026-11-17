import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { newEvent } from '../src/chassis/cloudevent.js';
import { createEventHub } from '../src/event-hub.js';
import { registerRoutes } from '../src/routes.js';
import type { Upstreams } from '../src/upstream.js';

const ev = (correlationId: string) => newEvent({ source: 's', type: 'lagoski.ordering.order.placed.v1', data: {}, correlationId });

describe('event hub', () => {
  it('ignora entrega duplicada e filtra por correlação', () => {
    const hub = createEventHub(10);
    const a = ev('ord_a');
    expect(hub.push('ordering.events', a)).toBe(true);
    expect(hub.push('ordering.events', a)).toBe(false);
    hub.push('ordering.events', ev('ord_b'));
    expect(hub.recent('ord_a').map((e) => e.event.id)).toEqual([a.id]);
    expect(hub.recent()).toHaveLength(2);
  });

  it('buffer circular respeita a capacidade', () => {
    const hub = createEventHub(3);
    for (let i = 0; i < 5; i++) hub.push('t', ev(`ord_${i}`));
    expect(hub.recent().map((e) => e.event.correlationid)).toEqual(['ord_2', 'ord_3', 'ord_4']);
  });
});

describe('rotas', () => {
  const calls: Array<[string, string, string, unknown]> = [];
  const up: Upstreams = {
    async call(service, method, path, body) {
      calls.push([service, method, path, body]);
      return { status: 200, body: { ok: true } };
    },
    async forwardRaw(service, path, raw, headers) {
      calls.push([service, 'RAW', path, { raw: raw.toString(), signature: headers['stripe-signature'] }]);
      return { status: 200, body: { received: true } };
    },
  };
  const app = Fastify();
  registerRoutes(app, up, createEventHub(), () => null);

  it('mapeia rotas do SPA para o serviço dono', async () => {
    await app.inject({ method: 'POST', url: '/api/carts/cart_1/items', payload: { sku: 'A', quantity: 1 } });
    await app.inject({ method: 'GET', url: '/api/orders/ord_1/shipments' });
    expect(calls).toContainEqual(['ordering', 'POST', '/carts/cart_1/items', { sku: 'A', quantity: 1 }]);
    expect(calls).toContainEqual(['fulfillment', 'GET', '/shipments?orderId=ord_1', undefined]);
  });

  it('repassa o webhook do Stripe com corpo cru e assinatura', async () => {
    const raw = '{"id":"evt_1",  "type":"checkout.session.completed"}';
    const res = await app.inject({ method: 'POST', url: '/api/webhooks/stripe', payload: raw, headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=abc' } });
    expect(res.statusCode).toBe(200);
    expect(calls.at(-1)).toEqual(['payment', 'RAW', '/webhooks/stripe', { raw, signature: 't=1,v1=abc' }]);
    const unsigned = await app.inject({ method: 'POST', url: '/api/webhooks/stripe', payload: raw, headers: { 'content-type': 'application/json' } });
    expect(unsigned.statusCode).toBe(400);
  });
});
