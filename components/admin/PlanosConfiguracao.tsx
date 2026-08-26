'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/supabase';
import { DIAS_PLANO, PlanosConfig } from '@/lib/planosMarmitas';

export default function PlanosConfiguracao() {
  const [config, setConfig] = useState<PlanosConfig | null>(null);
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { (async () => {
    try { const { data, error } = await supabase.from('app_config').select('valor').eq('chave', 'planos_config').single(); if (error) throw error; setConfig(data.valor); }
    catch (error: any) { setMensagem(error.message); }
  })(); }, []);
  async function salvar() {
    if (!config) return;
    setSalvando(true); setMensagem('');
    try {
      const { error, data } = await supabase.from('app_config').update({ valor: config }).eq('chave', 'planos_config').select('chave').single();
      if (error || !data) throw error || new Error('Configuração não salva.');
      setMensagem('Configurações salvas.');
    } catch (error: any) { setMensagem(error.message); } finally { setSalvando(false); }
  }
  return <details className="border-y bg-white p-4"><summary className="cursor-pointer font-black text-viva-roxo">Configurações dos planos</summary>
    {config && <div className="mt-4 grid gap-5 md:grid-cols-3">
      <fieldset><legend className="mb-2 text-sm font-bold">Dias de entrega</legend>{DIAS_PLANO.slice(1).map((dia, index) => <label key={dia} className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={config.dias.includes(index + 1)} onChange={e => setConfig({ ...config, dias: e.target.checked ? [...config.dias, index + 1].sort() : config.dias.filter(d => d !== index + 1) })} />{dia}</label>)}</fieldset>
      <fieldset><legend className="mb-2 text-sm font-bold">Voucher presencial</legend>{['Alelo', 'VR', 'Ticket', 'Pluxee'].map(b => <label key={b} className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(config.bandeiras[b])} onChange={e => setConfig({ ...config, bandeiras: { ...config.bandeiras, [b]: e.target.checked } })} />{b}</label>)}</fieldset>
      <div><label className="text-sm font-bold">Antecedência mínima (dias)<input type="number" min="1" max="90" value={config.antecedencia_dias} onChange={e => setConfig({ ...config, antecedencia_dias: Math.max(1, Math.min(90, Number(e.target.value))) })} className="mt-2 h-11 w-full rounded border px-3" /></label><button type="button" onClick={salvar} disabled={salvando} className="mt-4 h-11 rounded-lg bg-viva-verde px-4 font-bold text-viva-roxo disabled:opacity-40">{salvando ? 'Salvando...' : 'Salvar configurações'}</button></div>
    </div>}{mensagem && <p role="status" className="mt-3 text-sm">{mensagem}</p>}
  </details>;
}
