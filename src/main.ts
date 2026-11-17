import cors from '@fastify/cors';
import { loadConfig, readEnv } from './chassis/config.js';
import { buildHttp } from './chassis/http.js';
import { createBus } from './chassis/messaging/index.js';
import { createEventHub } from './event-hub.js';
import { subscriptions } from './messaging-config.js';
import { registerRoutes } from './routes.js';
import { createUpstreams, type Service } from './upstream.js';

const SERVICES: Service[] = ['catalog', 'ordering', 'inventory', 'payment', 'fulfillment', 'notification'];
const DEFAULT_PORTS: Record<Service, number> = { catalog: 8081, ordering: 8082, inventory: 8083, payment: 8084, fulfillment: 8085, notification: 8086 };

const config = loadConfig('bff', 8080);
const app = buildHttp('bff');

const origins = (readEnv('CORS_ORIGINS') ?? 'http://localhost:5180').split(',').map((o) => o.trim());
const allowOrigin = (origin: string | undefined) => (origin && origins.includes(origin) ? origin : null);
await app.register(cors, { origin: origins, methods: ['GET', 'POST', 'PUT', 'DELETE'] });

const urls = Object.fromEntries(
  SERVICES.map((s) => [s, readEnv(`${s.toUpperCase()}_URL`) ?? `http://localhost:${DEFAULT_PORTS[s]}`]),
) as Record<Service, string>;
const upstreams = createUpstreams(urls, readEnv('UPSTREAM_AUTH') === 'gcp-id-token' ? 'gcp-id-token' : 'none');

// Observer: uma assinatura sem filtro em cada tópico. O BFF não tem banco; a
// deduplicação do que mostra fica no hub (por id do evento).
const hub = createEventHub();
const bus = createBus(config, subscriptions, app.log);
bus.registerRoutes?.(app);
registerRoutes(app, upstreams, hub, allowOrigin);

const topicOf = (subscription: string) => `${subscription.split('-on-').pop()}.events`;
await bus.subscriber.start(async ({ event, subscription }) => {
  hub.push(topicOf(subscription), event);
});

const shutdown = async () => {
  await bus.subscriber.stop();
  await app.close();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());

await app.listen({ host: '0.0.0.0', port: config.port });
app.log.info({ provider: config.provider, upstreams: urls }, 'bff no ar');
