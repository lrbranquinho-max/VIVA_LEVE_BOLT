export const MEIOS_PAGAMENTO_LABELS: Record<string, string> = {
  voucher_presencial: 'Voucher na primeira entrega',
  pix: 'Pix',
  credito: 'Chave de Crédito',
  mercado_pago_debito: 'Mercado Pago (Débito)',
  mercado_pago_credito: 'Mercado Pago (Crédito)',
  cielo_credito: 'Cielo (Crédito)',
  cielo_debito: 'Cielo (Débito)',
  cielo_ticket: 'Cielo (Ticket)',
  cielo_vr: 'Cielo (VR)',
  cielo_alelo: 'Cielo (Alelo)',
  cielo_pluxee: 'Cielo (Pluxee)',
};

export function nomeMeioPagamento(meio?: string | null) {
  if (!meio) return 'Meio de pagamento não identificado';
  return MEIOS_PAGAMENTO_LABELS[meio] ?? meio;
}

export function meioPagamentoMercadoPago(paymentMethodId?: string | null, paymentTypeId?: string | null) {
  if (paymentMethodId === 'pix' || paymentTypeId === 'bank_transfer') return 'pix';
  if (paymentTypeId === 'debit_card') return 'mercado_pago_debito';
  if (paymentTypeId === 'credit_card') return 'mercado_pago_credito';
  return null;
}
