import { FiscalDocumentType, FiscalFileResult, FiscalIssueRequest, FiscalIssueResult, FiscalProvider } from './types';

type FetchLike = typeof fetch;

export class FiscalProviderError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly transient = false) { super(message); }
}

export class DotCompanyFiscalProvider implements FiscalProvider {
  constructor(
    private readonly token: string,
    private readonly baseUrl = 'https://api.dotcompany.com.br',
    private readonly fetcher: FetchLike = fetch,
  ) {
    if (!token) throw new Error('DOTCOMPANY_API_TOKEN não configurado.');
  }

  private async request(path: string, init: RequestInit = {}) {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', Authorization: `Bearer ${this.token}`, ...(init.headers || {}) },
      signal: init.signal || AbortSignal.timeout(30_000),
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const code = response.headers.get('x-error-code') || String((body.error as any)?.code || body.code || 'DOTCOMPANY_REQUEST_FAILED');
      const message = String((body.error as any)?.message || body.message || 'Falha na API fiscal.');
      throw new FiscalProviderError(message, response.status, code, response.status === 408 || response.status === 429 || response.status >= 500);
    }
    return body;
  }

  async issue(request: FiscalIssueRequest): Promise<FiscalIssueResult> {
    const body = await this.request(`/api/v1/${request.documentType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': request.idempotencyKey,
        ...(request.environment === 'homologacao' ? { 'X-Sandbox-Mode': 'simulado' } : {}) },
      body: JSON.stringify({ ...request.payload, idempotency_key: request.idempotencyKey }),
    });
    return this.mapResult(body);
  }

  async query(documentType: FiscalDocumentType, providerDocumentId: string) {
    void documentType;
    const idempotencyKey = crypto.randomUUID();
    return this.request('/api/v1/nfe/consultar', { method: 'POST', headers: {
      'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey,
    }, body: JSON.stringify({ nota_id: Number(providerDocumentId), idempotency_key: idempotencyKey }) });
  }

  async cancel(providerDocumentId: string, justification: string, idempotencyKey: string) {
    const body = await this.request('/api/v1/nfe/cancelar', { method: 'POST', headers: {
      'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey,
    }, body: JSON.stringify({ nota_id: Number(providerDocumentId), justificativa: justification, idempotency_key: idempotencyKey }) });
    return this.mapResult({ ...body, autorizada: false, status: body.success ? 'cancelled' : 'rejected' });
  }

  async downloadXml(providerDocumentId: string): Promise<FiscalFileResult> {
    const body = await this.request(`/api/v1/nfe/xml?nota_id=${encodeURIComponent(providerDocumentId)}`);
    return { name: String(body.nome_arquivo || 'documento.xml'), mime: String(body.mime || 'application/xml'), content: String(body.xml || ''), encoding: 'utf8' };
  }

  async downloadDanfe(providerDocumentId: string, idempotencyKey: string): Promise<FiscalFileResult> {
    const body = await this.request('/api/v1/nfe/danfe', { method: 'POST', headers: {
      'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey,
    }, body: JSON.stringify({ nota_id: Number(providerDocumentId) }) });
    return { name: String(body.nome_arquivo || 'danfe.pdf'), mime: String(body.mime || 'application/pdf'), content: String(body.conteudo_base64 || ''), encoding: 'base64' };
  }

  private mapResult(body: Record<string, unknown>): FiscalIssueResult {
    const status = body.status === 'cancelled' ? 'cancelled' : body.autorizada === true ? 'authorized' : body.pendente === true ? 'processing' : 'rejected';
    const error = body.erro as Record<string, unknown> | null;
    return {
      status, providerDocumentId: body.nota_id == null ? undefined : String(body.nota_id), number: body.numero == null ? undefined : String(body.numero),
      series: body.serie == null ? undefined : String(body.serie), accessKey: body.chave_acesso == null ? undefined : String(body.chave_acesso),
      protocol: body.protocolo == null ? undefined : String(body.protocolo), message: String(body.message || ''),
      errorCode: error?.codigo == null ? undefined : String(error.codigo), xml: body.xml_autorizado == null ? undefined : String(body.xml_autorizado),
      danfeBase64: body.danfe_pdf_base64 == null ? undefined : String(body.danfe_pdf_base64), raw: body,
    };
  }
}
