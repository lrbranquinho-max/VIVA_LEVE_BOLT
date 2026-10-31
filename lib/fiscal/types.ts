export type FiscalDocumentType = 'nfe' | 'nfce';
export type FiscalEnvironment = 'homologacao' | 'producao';
export type FiscalStatus = 'pending' | 'processing' | 'authorized' | 'rejected' | 'error' | 'cancelled';

export interface FiscalIssueRequest {
  documentType: FiscalDocumentType;
  environment: FiscalEnvironment;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

export interface FiscalIssueResult {
  status: FiscalStatus;
  providerDocumentId?: string;
  number?: string;
  series?: string;
  accessKey?: string;
  protocol?: string;
  message?: string;
  errorCode?: string;
  xml?: string;
  danfeBase64?: string;
  raw: Record<string, unknown>;
}

export interface FiscalFileResult {
  name: string;
  mime: string;
  content: string;
  encoding: 'utf8' | 'base64';
}

export interface FiscalProvider {
  issue(request: FiscalIssueRequest): Promise<FiscalIssueResult>;
  query(documentType: FiscalDocumentType, providerDocumentId: string): Promise<Record<string, unknown>>;
  cancel(providerDocumentId: string, justification: string, idempotencyKey: string): Promise<FiscalIssueResult>;
  downloadXml(providerDocumentId: string): Promise<FiscalFileResult>;
  downloadDanfe(providerDocumentId: string, idempotencyKey: string): Promise<FiscalFileResult>;
}
