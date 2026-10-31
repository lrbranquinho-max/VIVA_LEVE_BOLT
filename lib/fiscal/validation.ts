type Snapshot = Record<string, any>;

export function fiscalReadiness(snapshot: Snapshot, documentType: 'nfe' | 'nfce') {
  const missing: string[] = [];
  const issuer = snapshot.emitente || {};
  if (!issuer.cnpj) missing.push('CNPJ da empresa');
  if (!issuer.razao_social) missing.push('razão social da empresa');
  if (!issuer.uf) missing.push('UF da empresa');
  if (!issuer.codigo_municipio) missing.push('código IBGE da empresa');
  const items = Array.isArray(snapshot.pedido?.itens) ? snapshot.pedido.itens : [];
  if (!items.length) missing.push('itens do pedido');
  for (const item of items) {
    const tax = snapshot.produtos_fiscais?.[String(item.id)] || {};
    if (!tax.ncm) missing.push(`NCM de ${item.nome || `produto ${item.id}`}`);
    if (documentType === 'nfe' && !tax.cfop) missing.push(`CFOP de ${item.nome || `produto ${item.id}`}`);
  }
  if (documentType === 'nfe') {
    const customer = snapshot.destinatario || {};
    if (!customer.nome) missing.push('nome do destinatário');
    if (!customer.uf) missing.push('UF do destinatário');
  }
  return Array.from(new Set(missing));
}

export function paymentMethodToFiscal(method?: string | null) {
  const value = String(method || '').toLowerCase();
  if (value.includes('pix')) return 'pix';
  if (value.includes('voucher') || value.includes('aliment')) return 'vale_alimentacao';
  if (value.includes('debito')) return 'debito';
  if (value.includes('credito') || value.includes('card') || value.includes('cielo') || value.includes('mercado')) return 'credito';
  if (value.includes('dinheiro')) return 'dinheiro';
  return 'outro';
}
