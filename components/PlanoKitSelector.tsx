'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/supabase';
import { DIAS_PLANO, EscolhaPlano, KITS_CARRINHO_KEY, PlanosConfig, ProdutoPlano, dataBrasilia, datasPlano, diaSemana, distribuirSabores, lerKitsCarrinho, moedaPlano, somarDias, validarEscolhaPlano } from '@/lib/planosMarmitas';
import { normalizarMeiosPagamento } from '@/lib/paymentConfig';

export default function PlanoKitSelector({ produto, liberado }: { produto: ProdutoPlano; liberado: boolean }) {
  const router = useRouter();
  const [sabores, setSabores] = useState<ProdutoPlano[]>([]);
  const [config, setConfig] = useState<PlanosConfig | null>(null);
  const [escolha, setEscolha] = useState<EscolhaPlano>({ sabores: [], primeira_data: '' });
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [meios, setMeios] = useState<string[]>([]);
  const c = produto.plano_config;
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [produtos, configuracao, loja] = await Promise.all([
          supabase.from('produtos').select('id,nome,imagem_url,descricao,ativo,preco').eq('ativo', true).eq('disponivel_kit', true).eq('tipo_produto', 'avulso').eq('categoria', 'Marmitas').order('nome'),
          supabase.from('app_config').select('valor').eq('chave', 'planos_config').single(),
          supabase.from('app_config').select('valor').eq('chave', 'loja_config').single(),
        ]);
        if (produtos.error) throw produtos.error;
        if (configuracao.error) throw configuracao.error;
        if (loja.error) throw loja.error;
        if (!ativo) return;
        setSabores(produtos.data || []); setConfig(configuracao.data.valor);
        const pagamentos = normalizarMeiosPagamento(loja.data.valor);
        setMeios([pagamentos.pix ? 'Pix' : '', pagamentos.mercado_pago ? 'Mercado Pago' : '', pagamentos.cielo ? 'Cartão' : ''].filter(Boolean));
        const anterior = lerKitsCarrinho()[produto.id];
        if (anterior) setEscolha(anterior);
      } catch (error: any) { if (ativo) setErro(error.message); }
      finally { if (ativo) setCarregando(false); }
    })();
    return () => { ativo = false; };
  }, [produto.id]);
  if (!c) return <p role="alert">Plano sem configuração. Entre em contato com a loja.</p>;
  const total = escolha.sabores.reduce((sum, s) => sum + s.quantidade, 0);
  const aviso = validarEscolhaPlano(c, escolha.sabores);
  const dataMinima = somarDias(dataBrasilia(), Math.max(config?.antecedencia_dias || 1, 1));
  const dataValida = escolha.primeira_data >= dataMinima && escolha.primeira_data <= somarDias(dataBrasilia(), 180) && (config?.dias || []).includes(diaSemana(escolha.primeira_data)) && diaSemana(escolha.primeira_data) !== 0;
  function selecionar(id: number) {
    setErro('');
    const ids = escolha.sabores.map(s => s.id);
    const selecionado = ids.includes(id);
    if (!selecionado && ids.length >= c!.sabores_max) { setErro(`Limite de ${c!.sabores_max} sabores. Desmarque um para trocar.`); return; }
    setEscolha({ ...escolha, sabores: distribuirSabores(c!.total_marmitas, selecionado ? ids.filter(i => i !== id) : [...ids, id]) });
  }
  function adicionar() {
    if (!liberado || aviso || !dataValida) return;
    try {
      const carrinho = JSON.parse(localStorage.getItem('viva-leve-carrinho') || '{}');
      localStorage.setItem(KITS_CARRINHO_KEY, JSON.stringify({ ...lerKitsCarrinho(), [produto.id]: escolha }));
      localStorage.setItem('viva-leve-carrinho', JSON.stringify({ ...carrinho, [produto.id]: 1 }));
      router.push('/?sacola=1');
    } catch { setErro('Não foi possível salvar a sacola neste dispositivo.'); }
  }
  return <section className="space-y-5 text-gray-900">
    <div className="border-l-4 border-viva-verde bg-purple-50 p-4">
      <h2 className="font-black text-viva-roxo">{c.intervalo_dias === 7 ? 'Entregas semanais' : `Entregas a cada ${c.intervalo_dias} dias`}</h2>
      <p className="mt-2 text-sm leading-relaxed">Seu plano será entregue em etapas para facilitar sua rotina e economizar espaço no freezer. Escolha o dia; a Viva Leve enviará posteriormente a programação do horário.</p>
      <p className="mt-3 font-bold">{c.total_marmitas} marmitas · {c.entregas} entregas · {c.marmitas_por_entrega} por entrega</p>
      <p className="mt-2 text-xs">{meios.join(' · ')}{c.permite_voucher && config && Object.values(config.bandeiras).some(Boolean) ? ' · Voucher na primeira entrega' : ''}</p>
    </div>
    {carregando ? <p role="status">Carregando sabores...</p> : <>
      <h2 className="font-black">Escolha de {c.sabores_min} a {c.sabores_max} sabores</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sabores.map(s => {
          const escolhido = escolha.sabores.find(item => item.id === s.id);
          return <article key={s.id} className={`min-w-0 overflow-hidden rounded-lg border bg-white ${escolhido ? 'border-viva-roxo' : 'border-gray-200'}`}>
            <label className="flex cursor-pointer gap-3 p-3">
              {s.imagem_url && <img src={s.imagem_url} alt="" className="h-20 w-20 shrink-0 rounded object-cover" />}
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{s.nome}</span><input type="checkbox" aria-label={`Selecionar ${s.nome}`} checked={Boolean(escolhido)} onChange={() => selecionar(s.id)} className="mt-3 h-5 w-5 accent-viva-roxo" /></span>
            </label>
            {escolhido && <div className="flex items-center justify-between border-t p-3">
              <button type="button" aria-label={`Diminuir ${s.nome}`} disabled={escolhido.quantidade <= 1} onClick={() => setEscolha({ ...escolha, sabores: escolha.sabores.map(i => i.id === s.id ? { ...i, quantidade: i.quantidade - 1 } : i) })} className="h-10 w-10 rounded border disabled:opacity-40">−</button>
              <input aria-label={`Quantidade de ${s.nome}`} type="number" min="1" max={c.total_marmitas} value={escolhido.quantidade} onChange={event => setEscolha({ ...escolha, sabores: escolha.sabores.map(i => i.id === s.id ? { ...i, quantidade: Number(event.target.value) } : i) })} className="h-10 w-16 rounded border text-center font-bold" />
              <button type="button" aria-label={`Aumentar ${s.nome}`} disabled={total >= c.total_marmitas} onClick={() => setEscolha({ ...escolha, sabores: escolha.sabores.map(i => i.id === s.id ? { ...i, quantidade: i.quantidade + 1 } : i) })} className="h-10 w-10 rounded bg-viva-verde disabled:opacity-40">+</button>
            </div>}
          </article>;
        })}
      </div>
      {!sabores.length && <p>Nenhum sabor disponível para este plano no momento.</p>}
      <label className="block text-sm font-bold">Primeira entrega
        <input type="date" min={dataMinima} max={somarDias(dataBrasilia(), 180)} value={escolha.primeira_data} onChange={event => setEscolha({ ...escolha, primeira_data: event.target.value })} className="mt-2 h-12 w-full rounded-lg border bg-white px-3" />
      </label>
      <p className="text-xs text-gray-600">Dias disponíveis: {(config?.dias || []).filter(d => d > 0 && d <= 6).map(d => DIAS_PLANO[d]).join(', ')}.</p>
      {escolha.primeira_data && !dataValida && <p role="alert" className="text-sm text-red-700">Escolha uma data disponível a partir de {dataMinima.split('-').reverse().join('/')}.</p>}
      <div className="border-t border-gray-200 bg-white py-4">
        <h3 className="font-black">Seu {produto.nome}</h3>
        {escolha.sabores.map(s => <p key={s.id} className="mt-1 text-sm">{sabores.find(p => p.id === s.id)?.nome} — {s.quantidade}</p>)}
        {dataValida && <><p className="mt-3 text-sm font-bold">{c.entregas} entregas · {c.marmitas_por_entrega} marmitas · {DIAS_PLANO[diaSemana(escolha.primeira_data)]}</p><p className="mt-1 text-xs text-gray-600">{datasPlano(escolha.primeira_data, c).map(d => d.split('-').reverse().join('/')).join(' · ')}</p></>}
      </div>
      <div className="sticky bottom-20 z-10 rounded-lg border border-purple-200 bg-white p-4 shadow-lg md:bottom-3">
        <div className="flex justify-between gap-3 font-black"><span aria-live="polite">{total} de {c.total_marmitas} marmitas</span><span>{moedaPlano(produto.preco)}</span></div>
        {aviso && <p className="mt-2 text-xs text-amber-800">{aviso}</p>}
        <button type="button" onClick={adicionar} disabled={!liberado || Boolean(aviso) || !dataValida} className="mt-3 min-h-[48px] w-full rounded-lg bg-viva-verde px-3 py-2 text-sm font-black text-viva-roxo disabled:opacity-40">{liberado ? 'Adicionar Plano ao Carrinho' : 'Disponível em 01/09'}</button>
      </div>
    </>}
    {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
  </section>;
}
