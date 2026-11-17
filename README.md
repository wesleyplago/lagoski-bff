# lagoski-bff

Backend for Frontend do SPA: único ponto HTTP público, agrega os serviços e transmite os eventos por SSE.

Parte do **Lagoski**, uma loja de camisetas que demonstra bounded contexts (DDD) em
microsserviços integrados só por eventos, rodando na AWS (SNS + SQS) e no GCP (Pub/Sub)
com o mesmo código. Bounded context: **BFF** (Edge).

| Repositório | Papel |
| --- | --- |
| [lagoski-platform](https://github.com/wesleyplago/lagoski-platform) | base compartilhada (rede, cluster, banco, tópicos), spec, ADRs e compose do sistema inteiro |
| [lagoski-contracts](https://github.com/wesleyplago/lagoski-contracts) | Published Language: JSON Schemas e AsyncAPI dos eventos |
| [portfolio](https://github.com/wesleyplago/portfolio) | SPA em microfrontends que mostra o fluxo funcionando |

## Eventos

Não publica eventos.

Consome (assinaturas com filtro por `ce_type`, idempotente via inbox):

| Tópico | Fila / assinatura | Tipos |
| --- | --- | --- |
| `catalog.events` | `lagoski-dev-bff-on-catalog` | todos (sem filtro) |
| `ordering.events` | `lagoski-dev-bff-on-ordering` | todos (sem filtro) |
| `inventory.events` | `lagoski-dev-bff-on-inventory` | todos (sem filtro) |
| `payment.events` | `lagoski-dev-bff-on-payment` | todos (sem filtro) |
| `fulfillment.events` | `lagoski-dev-bff-on-fulfillment` | todos (sem filtro) |

A topologia está em [`messaging.json`](messaging.json), lido pelo código e pelo Terraform.

## API

| Método | Rota | O quê |
| --- | --- | --- |
| GET | `/api/health` | saúde do BFF |
| GET | `/api/products` | catálogo |
| POST | `/api/carts` | cria carrinho |
| GET | `/api/carts/:id` | carrinho |
| POST | `/api/carts/:id/items` | adiciona item |
| DELETE | `/api/carts/:id/items/:sku` | remove item |
| POST | `/api/orders` | fecha pedido |
| GET | `/api/orders/:id` | pedido |
| GET | `/api/customers/:id/orders` | pedidos do cliente |
| POST | `/api/payments/:id/confirm` | confirma pagamento |
| GET | `/api/stock/:sku` | estoque |
| PUT | `/api/admin/stock/:sku` | ajusta estoque |
| GET | `/api/notifications?customerId=` | notificações |
| POST | `/api/webhooks/stripe` | repassa o webhook do Stripe ao Payment (corpo cru + assinatura) |
| GET | `/api/events/recent` | últimos eventos vistos no barramento |
| GET | `/api/stream` | SSE com todos os eventos (observer) |

Também: `GET /healthz` e `POST /_events/pubsub` (push do Pub/Sub, com OIDC).

## Estrutura

```text
src/
├── chassis/          HTTP, config, CloudEvents e barramento
│   └── messaging/    portas + adapters aws (SNS/SQS, pull), gcp (Pub/Sub, push) e memory
├── routes.ts         API do SPA: cada rota aponta para o serviço dono
├── upstream.ts       cliente dos serviços internos (Cloud Map na AWS, ID token no GCP)
├── event-hub.ts      buffer dos eventos observados + fan-out para SSE
├── module.ts         o que o chassis precisa saber deste serviço
└── main.ts
infrastructure/       Terraform (ver infrastructure/README.md)
```


## Rodando

```bash
pnpm install
docker compose up -d localstack
cp .env.example .env
pnpm dev
```

Ou tudo em container: `docker compose up --build`. Para subir o sistema inteiro (todos os
serviços, um LocalStack e um Postgres), use o compose do `lagoski-platform`.

```bash
pnpm typecheck && pnpm test
```

`pnpm test:contracts` valida os eventos contra os JSON Schemas do `lagoski-contracts`
(`CONTRACTS_DIR` aponta para um checkout dele; o CI faz isso na tag fixada em `CONTRACTS_REF`).

## Deploy

Workflow **deploy** (manual): escolhe `aws` ou `gcp`, autentica por OIDC, builda a imagem com o
SHA do commit e aplica `infrastructure/environments/<nuvem>/dev`. Detalhes em
[infrastructure/README.md](infrastructure/README.md).
