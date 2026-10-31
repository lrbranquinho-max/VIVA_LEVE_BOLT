export type FiscalDocumentType = 'nfe' | 'nfce';
export type FiscalEnvironment = 'homologacao' | 'producao';
export type ProviderResult = { ok: boolean; status: number; headers: Headers; body: Record<string, any> };

export interface FiscalProvider {
  issue(type: FiscalDocumentType, environment: FiscalEnvironment, idempotencyKey: string, payload: Record<string, any>): Promise<ProviderResult>;
  query(providerDocumentId: string, idempotencyKey: string): Promise<ProviderResult>;
  cancel(providerDocumentId: string, justification: string, idempotencyKey: string): Promise<ProviderResult>;
  downloadXml(providerDocumentId: string): Promise<ProviderResult>;
  downloadDanfe(providerDocumentId: string, idempotencyKey: string): Promise<ProviderResult>;
}

export class DotCompanyFiscalProvider implements FiscalProvider {
  constructor(private readonly token: string, private readonly baseUrl = 'https://api.dotcompany.com.br') {}

  private async request(path: string, init: RequestInit = {}): Promise<ProviderResult> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', Authorization: `Bearer ${this.token}`, ...(init.headers || {}) },
      signal: init.signal || AbortSignal.timeout(30000),
    });
    return { ok: response.ok, status: response.status, headers: response.headers, body: await response.json().catch(() => ({})) };
  }

  issue(type: FiscalDocumentType, environment: FiscalEnvironment, idempotencyKey: string, payload: Record<string, any>) {
    return this.request(`/api/v1/${type}`, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey,
      ...(environment === 'homologacao' ? { 'X-Sandbox-Mode': 'simulado' } : {}),
    }, body: JSON.stringify({ ...payload, idempotency_key: idempotencyKey }) });
  }

  query(providerDocumentId: string, idempotencyKey: string) {
    return this.request('/api/v1/nfe/consultar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ nota_id: Number(providerDocumentId), idempotency_key: idempotencyKey }) });
  }

  cancel(providerDocumentId: string, justification: string, idempotencyKey: string) {
    return this.request('/api/v1/nfe/cancelar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ nota_id: Number(providerDocumentId), justificativa: justification, idempotency_key: idempotencyKey }) });
  }

  downloadXml(providerDocumentId: string) { return this.request(`/api/v1/nfe/xml?nota_id=${encodeURIComponent(providerDocumentId)}`); }
  downloadDanfe(providerDocumentId: string, idempotencyKey: string) {
    return this.request('/api/v1/nfe/danfe', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ nota_id: Number(providerDocumentId) }) });
  }
}

export function createFiscalProvider(name: string, token: string): FiscalProvider {
  if (name === 'dotcompany') return new DotCompanyFiscalProvider(token);
  throw new Error(`FISCAL_PROVIDER_UNSUPPORTED:${name}`);
}
