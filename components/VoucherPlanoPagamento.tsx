'use client';
import { useState } from 'react';
import { supabase } from '@/supabase';
import { moedaPlano } from '@/lib/planosMarmitas';

export default function VoucherPlanoPagamento({ entregaId, valor, bandeira, onSaved }: { entregaId: number; valor: number; bandeira: string; onSaved: () => void }) {
  const [referencia, setReferencia] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  async function registrar(aprovado: boolean) {
    if (busy) return;
    if (aprovado && !window.confirm(`Confirma o recebimento integral de ${moedaPlano(valor)} na maquininha?`)) return;
    setBusy(true); setErro('');
    try {
      const { error } = await supabase.rpc('registrar_voucher_plano', { p_entrega_id: entregaId, p_aprovado: aprovado, p_referencia: referencia });
      if (error) throw error;
      setReferencia(''); setErro(aprovado ? 'Pagamento confirmado.' : 'Recusa registrada. O cliente pode pagar pelo aplicativo.'); onSaved();
    } catch (error: any) { setErro(error.message); }
    finally { setBusy(false); }
  }
  return <section className="border-l-4 border-amber-400 bg-amber-50 p-4">
    <h3 className="text-sm font-black">Pagamento na entrega — Voucher {bandeira}</h3>
    <p className="mt-2 text-lg font-black">Cobrar total: {moedaPlano(valor)}</p>
    <label className="mt-3 block text-xs font-bold">Referência do comprovante / motivo da recusa<input maxLength={300} value={referencia} onChange={e => setReferencia(e.target.value)} className="mt-1 h-11 w-full rounded border bg-white px-3 text-sm" /></label>
    <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy || referencia.trim().length < 3} onClick={() => registrar(true)} className="min-h-[44px] rounded bg-green-700 px-3 text-sm font-bold text-white disabled:opacity-40">Pagamento confirmado</button><button disabled={busy || referencia.trim().length < 3} onClick={() => registrar(false)} className="min-h-[44px] rounded border border-red-300 px-3 text-sm font-bold text-red-800 disabled:opacity-40">Registrar recusa</button></div>
    {erro && <p role="status" className="mt-2 text-sm">{erro}</p>}
  </section>;
}
