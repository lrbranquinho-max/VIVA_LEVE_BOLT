import { DotCompanyFiscalProvider } from './DotCompanyFiscalProvider';
import { FiscalProvider } from './types';

export function createFiscalProvider(name: string, token: string): FiscalProvider {
  if (name === 'dotcompany') return new DotCompanyFiscalProvider(token);
  throw new Error(`Provedor fiscal não suportado: ${name}`);
}
