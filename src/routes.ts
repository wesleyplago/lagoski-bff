import type { FastifyInstance, FastifyReply } from 'fastify';
import type { EventHub } from './event-hub.js';
import type { Service, UpstreamResponse, Upstreams } from './upstream.js';

const enc = encodeURIComponent;

/**
 * API do SPA. Cada rota é explícita (não é um proxy genérico): o contrato com o
 * frontend é este arquivo, e só ele expõe rotas dos serviços internos.
 */
export function registerRoutes(app: FastifyInstance, up: Upstreams, hub: EventHub, allowOrigin: (origin: string | undefined) => string | null) {
  const relay = (reply: FastifyReply, r: UpstreamResponse) => reply.code(r.status).send(r.body);
  const get = (service: Service, path: string) => up.call(service, 'GET', path);

  type P<T> = { Params: T };
  type Q<T> = { Querystring: T };

  app.get('/api/health', async () => ({ status: 'ok', streamConnections: hub.connections }));

  app.get('/api/products', async (_req, reply) => relay(reply, await get('catalog', '/products')));
  app.get<P<{ slug: string }>>('/api/products/:slug', async (req, reply) => relay(reply, await get('catalog', `/products/${enc(req.params.slug)}`)));

  app.post('/api/carts', async (req, reply) => relay(reply, await up.call('ordering', 'POST', '/carts', req.body)));
  app.get<P<{ id: string }>>('/api/carts/:id', async (req, reply) => relay(reply, await get('ordering', `/carts/${enc(req.params.id)}`)));
  app.post<P<{ id: string }>>('/api/carts/:id/items', async (req, reply) =>
    relay(reply, await up.call('ordering', 'POST', `/carts/${enc(req.params.id)}/items`, req.body)),
  );
  app.delete<P<{ id: string; sku: string }>>('/api/carts/:id/items/:sku', async (req, reply) =>
    relay(reply, await up.call('ordering', 'DELETE', `/carts/${enc(req.params.id)}/items/${enc(req.params.sku)}`)),
  );

  app.post('/api/orders', async (req, reply) => relay(reply, await up.call('ordering', 'POST', '/orders', req.body)));
  app.get<P<{ id: string }>>('/api/orders/:id', async (req, reply) => relay(reply, await get('ordering', `/orders/${enc(req.params.id)}`)));
  app.get<P<{ id: string }>>('/api/orders/:id/payment', async (req, reply) => relay(reply, await get('payment', `/orders/${enc(req.params.id)}/payment`)));
  app.get<P<{ id: string }>>('/api/orders/:id/shipments', async (req, reply) => relay(reply, await get('fulfillment', `/shipments?orderId=${enc(req.params.id)}`)));
  app.get<P<{ id: string }>>('/api/customers/:id/orders', async (req, reply) => relay(reply, await get('ordering', `/customers/${enc(req.params.id)}/orders`)));

  app.get<Q<{ skus?: string }>>('/api/stock', async (req, reply) => relay(reply, await get('inventory', `/stock?skus=${enc(req.query.skus ?? '')}`)));
  app.get<P<{ sku: string }>>('/api/stock/:sku', async (req, reply) => relay(reply, await get('inventory', `/stock/${enc(req.params.sku)}`)));
  // Demo: permite zerar estoque para o cenário "sem estoque". Em produção ficaria atrás de autenticação.
  app.put<P<{ sku: string }>>('/api/admin/stock/:sku', async (req, reply) =>
    relay(reply, await up.call('inventory', 'PUT', `/admin/stock/${enc(req.params.sku)}`, req.body)),
  );

  app.get<Q<{ customerId?: string }>>('/api/notifications', async (req, reply) =>
    relay(reply, await get('notification', `/notifications?customerId=${enc(req.query.customerId ?? '')}`)),
  );

  // Webhook do Stripe: único endpoint público que chega ao Payment. Corpo cru e assinatura intactos.
  app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
    scope.post('/api/webhooks/stripe', async (req, reply) => {
      const signature = req.headers['stripe-signature'];
      if (typeof signature !== 'string') return reply.code(400).send({ error: 'MISSING_SIGNATURE' });
      const r = await up.forwardRaw('payment', '/webhooks/stripe', req.body as Buffer, { 'content-type': 'application/json', 'stripe-signature': signature });
      return relay(reply, r);
    });
  });

  app.get<Q<{ correlationId?: string }>>('/api/events/recent', async (req) => ({ events: hub.recent(req.query.correlationId) }));

  // Server-Sent Events: o Event Inspector do SPA vê o barramento ao vivo.
  app.get<Q<{ correlationId?: string }>>('/api/stream', (req, reply) => {
    const origin = allowOrigin(req.headers.origin);
    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
    });
    const filter = req.query.correlationId;
    const send = (data: unknown, event = 'bus') => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send({ connectedAt: new Date().toISOString() }, 'hello');
    const unsubscribe = hub.subscribe((e) => {
      if (!filter || e.event.correlationid === filter) send(e);
    });
    const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), 15_000);
    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
