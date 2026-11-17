import { GoogleAuth } from 'google-auth-library';

export type Service = 'catalog' | 'ordering' | 'inventory' | 'payment' | 'fulfillment' | 'notification';

export type UpstreamResponse = { status: number; body: unknown };

export type Upstreams = {
  call(service: Service, method: string, path: string, body?: unknown): Promise<UpstreamResponse>;
  /** Repasse cru (webhook do Stripe): a assinatura depende dos bytes exatos. */
  forwardRaw(service: Service, path: string, raw: Buffer, headers: Record<string, string>): Promise<UpstreamResponse>;
};

/**
 * Cliente dos serviços internos. Na AWS, URL do Cloud Map sem autenticação
 * (rede privada + security group). No GCP, Cloud Run com ingress interno e
 * IAM: cada chamada leva um ID token da conta do BFF.
 */
export function createUpstreams(urls: Record<Service, string>, auth: 'none' | 'gcp-id-token', timeoutMs = 8_000): Upstreams {
  const google = auth === 'gcp-id-token' ? new GoogleAuth() : null;

  async function authHeaders(service: Service): Promise<Record<string, string>> {
    if (!google) return {};
    const client = await google.getIdTokenClient(urls[service]);
    const headers = await client.getRequestHeaders();
    const value = headers instanceof Headers ? headers.get('authorization') : (headers as Record<string, string>).Authorization;
    return value ? { authorization: value } : {};
  }

  async function send(service: Service, method: string, path: string, body: string | Uint8Array | undefined, headers: Record<string, string>): Promise<UpstreamResponse> {
    let response: Response;
    try {
      response = await fetch(`${urls[service]}${path}`, {
        method,
        body,
        headers: { ...headers, ...(await authHeaders(service)) },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      return { status: 503, body: { error: 'UPSTREAM_UNAVAILABLE', message: `${service} indisponível: ${(err as Error).message}` } };
    }
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // resposta não-JSON: devolve como texto
    }
    return { status: response.status, body: parsed };
  }

  return {
    call: (service, method, path, body) =>
      send(service, method, path, body === undefined ? undefined : JSON.stringify(body), body === undefined ? {} : { 'content-type': 'application/json' }),
    forwardRaw: (service, path, raw, headers) => send(service, 'POST', path, new Uint8Array(raw), headers),
  };
}
