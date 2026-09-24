'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabase } from '@/supabase';
import { DIAS_PLANO, EscolhaPlano, KITS_CARRINHO_KEY, PlanosConfig, ProdutoPlano, configurarEntregasPlano, dataBrasilia, datasPlano, diaSemana, distribuirSelecaoParcialComEstoque, lerKitsCarrinho, moedaPlano, opcoesEntregasPlano, primeiraEntregaPadrao, somarDias, validarEscolhaPlano, validarEntregasPlano, validarEstoqueEscolhaPlano } from '@/lib/planosMarmitas';
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
          supabase.from('produtos').select('id,nome,imagem_url,imagem_thumbnail_url,descricao,ativo,preco,estoque,estoque_reservado,estoque_disponivel').eq('ativo', true).eq('disponivel_kit', true).eq('tipo_produto', 'avulso').eq('categoria', 'Marmitas').order('nome'),
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
        const padrao = primeiraEntregaPadrao();
        setEscolha(anterior
          ? { ...anterior, entregas: anterior.entregas ?? 1, primeira_data: anterior.primeira_data >= dataBrasilia() ? anterior.primeira_data : padrao }
          : { sabores: [], primeira_data: padrao, entregas: 1 });
      } catch (error: any) { if (ativo) setErro(error.message); }
      finally { if (ativo) setCarregando(false); }
    })();
    return () => { ativo = false; };
  }, [produto.id, c?.entregas]);
  if (!c) return <p role="alert">Plano sem configuração. Entre em contato com a loja.</p>;
  const total = escolha.sabores.reduce((sum, s) => sum + s.quantidade, 0);
  const configEscolhida = configurarEntregasPlano(c, escolha.entregas);
  const opcoesEntregas = opcoesEntregasPlano(c);
  const aviso = validarEscolhaPlano(c, escolha.sabores) || validarEntregasPlano(c, escolha.entregas) || validarEstoqueEscolhaPlano(escolha.sabores, sabores);
  const dataMinima = somarDias(dataBrasilia(), Math.max(config?.antecedencia_dias || 1, 1));
  const dataValida = escolha.primeira_data >= dataMinima && escolha.primeira_data <= somarDias(dataBrasilia(), 180) && (config?.dias || []).includes(diaSemana(escolha.primeira_data)) && diaSemana(escolha.primeira_data) !== 0;
  function selecionar(id: number) {
    setErro('');
    const sabor = sabores.find(item => item.id === id);
    const disponivel = Number(sabor?.estoque_disponivel ?? 0);
    setEscolha(atual => {
      const ids = atual.sabores.map(s => s.id);
      const selecionado = ids.includes(id);
      if (!selecionado && disponivel <= 0) { setErro(`${sabor?.nome || 'Este sabor'} está esgotado.`); return atual; }
      if (!selecionado && ids.length >= c!.sabores_max) { setErro(`Limite de ${c!.sabores_max} sabores. Desmarque um para trocar.`); return atual; }
      const novosIds = selecionado ? ids.filter(i => i !== id) : [...ids, id];
      const produtosSelecionados = novosIds.map(itemId => sabores.find(item => item.id === itemId)!).filter(Boolean);
      const distribuicao = distribuirSelecaoParcialComEstoque(c!.total_marmitas, produtosSelecionados);
      return { ...atual, sabores: distribuicao };
    });
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
      <p className="mt-3 font-bold">{c.total_marmitas} marmitas · escolha receber em {opcoesEntregas.join(', ')} {opcoesEntregas.length > 1 ? 'etapas' : 'etapa'}</p>
      <p className="mt-2 text-xs">{meios.join(' · ')}{c.permite_voucher && config && Object.values(config.bandeiras).some(Boolean) ? ' · Cartão Alimentação na primeira entrega' : ''}</p>
    </div>
    {carregando ? <p role="status">Carregando sabores...</p> : <>
      <h2 className="font-black">Escolha de {c.sabores_min} a {c.sabores_max} sabores</h2>
      {erro && <p role="alert" aria-live="assertive" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sabores.map(s => {
          const escolhido = escolha.sabores.find(item => item.id === s.id);
          const disponivel = Math.max(0, Number(s.estoque_disponivel ?? 0));
          const esgotado = disponivel <= 0;
          return <article key={s.id} className={`min-w-0 overflow-hidden rounded-lg border bg-white ${escolhido ? 'border-viva-roxo' : 'border-gray-200'} ${esgotado ? 'opacity-60' : ''}`}>
            <label className={`flex gap-3 p-3 ${esgotado && !escolhido ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              {(s.imagem_thumbnail_url || s.imagem_url) && <Image src={s.imagem_thumbnail_url || s.imagem_url || ''} alt="" width={80} height={80} sizes="80px" loading="lazy" className="h-20 w-20 shrink-0 rounded object-cover" />}
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{s.nome}</span><span className={`mt-1 block text-xs font-black ${esgotado ? 'text-red-600' : 'text-emerald-700'}`}>{esgotado ? 'Esgotado' : `${disponivel} disponível(is)`}</span><input type="checkbox" aria-label={`Selecionar ${s.nome}`} checked={Boolean(escolhido)} disabled={esgotado && !escolhido} onChange={() => selecionar(s.id)} className="mt-3 h-5 w-5 accent-viva-roxo" /></span>
            </label>
            {escolhido && <div className="flex items-center justify-between border-t p-3">
              <button type="button" aria-label={`Diminuir ${s.nome}`} disabled={escolhido.quantidade <= 1} onClick={() => setEscolha({ ...escolha, sabores: escolha.sabores.map(i => i.id === s.id ? { ...i, quantidade: i.quantidade - 1 } : i) })} className="h-10 w-10 rounded border disabled:opacity-40">−</button>
              <input aria-label={`Quantidade de ${s.nome}`} type="number" min="1" max={Math.min(c.total_marmitas, disponivel)} value={escolhido.quantidade} onChange={event => { const quantidade = Math.max(1, Math.min(disponivel, Number(event.target.value) || 1)); setEscolha({ ...escolha, sabores: escolha.sabores.map(i => i.id === s.id ? { ...i, quantidade } : i) }); }} className="h-10 w-16 rounded border text-center font-bold" />
              <button type="button" aria-label={`Aumentar ${s.nome}`} disabled={total >= c.total_marmitas || escolhido.quantidade >= disponivel} onClick={() => setEscolha({ ...escolha, sabores: escolha.sabores.map(i => i.id === s.id ? { ...i, quantidade: i.quantidade + 1 } : i) })} className="h-10 w-10 rounded bg-viva-verde disabled:opacity-40">+</button>
            </div>}
          </article>;
        })}
      </div>
      {!sabores.length && <p>Nenhum sabor disponível para este plano no momento.</p>}
      <fieldset className="rounded-lg border border-purple-200 bg-purple-50 p-4">
        <legend className="px-1 text-sm font-black text-viva-roxo">Como deseja receber?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">{opcoesEntregas.map(numero => <label key={numero} className={`flex min-h-[48px] cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 text-sm font-bold ${configEscolhida.entregas === numero ? 'border-viva-roxo ring-2 ring-purple-100' : 'border-gray-200'}`}><input type="radio" name={`entregas-kit-${produto.id}`} checked={configEscolhida.entregas === numero} onChange={() => setEscolha({ ...escolha, entregas: numero })} className="h-4 w-4 accent-viva-roxo"/><span>{numero === 1 ? 'Tudo de uma vez' : `${numero} entregas`}<span className="block text-xs font-normal text-gray-500">{c.total_marmitas / numero} marmitas por entrega</span></span></label>)}</div>
      </fieldset>
      <label className="block text-sm font-bold">Data da primeira entrega
        <input type="date" min={dataMinima} max={somarDias(dataBrasilia(), 180)} value={escolha.primeira_data} onChange={event => { const novaData = event.target.value; if (novaData && diaSemana(novaData) !== 6) window.alert('Você ganhou frete grátis para entrega no sábado'); setEscolha({ ...escolha, primeira_data: novaData }); }} className="mt-2 h-12 w-full rounded-lg border bg-white px-3" />
      </label>
      <p className="rounded-lg bg-emerald-50 p-3 text-xs font-bold text-emerald-800">Entregas de kits programadas para sábado têm frete grátis.</p>
      <p className="text-xs text-gray-600">Dias disponíveis: {(config?.dias || []).filter(d => d > 0 && d <= 6).map(d => DIAS_PLANO[d]).join(', ')}.</p>
      {escolha.primeira_data && !dataValida && <p role="alert" className="text-sm text-red-700">Escolha uma data disponível a partir de {dataMinima.split('-').reverse().join('/')}.</p>}
      <div className="border-t border-gray-200 bg-white py-4">
        <h3 className="font-black">Seu {produto.nome}</h3>
        {escolha.sabores.map(s => <p key={s.id} className="mt-1 text-sm">{sabores.find(p => p.id === s.id)?.nome} — {s.quantidade}</p>)}
        {dataValida && <><p className="mt-3 text-sm font-bold">{configEscolhida.entregas} {configEscolhida.entregas === 1 ? 'entrega' : 'entregas'} · {configEscolhida.marmitas_por_entrega} marmitas por entrega · {DIAS_PLANO[diaSemana(escolha.primeira_data)]}</p><p className="mt-1 text-xs text-gray-600">{datasPlano(escolha.primeira_data, configEscolhida).map(d => d.split('-').reverse().join('/')).join(' · ')}</p></>}
      </div>
      <div className="sticky bottom-20 z-10 rounded-lg border border-purple-200 bg-white p-4 shadow-lg md:bottom-3">
        <div className="flex justify-between gap-3 font-black"><span aria-live="polite">{total} de {c.total_marmitas} marmitas</span><span>{moedaPlano(produto.preco)}</span></div>
        {aviso && <p className="mt-2 text-xs text-amber-800">{aviso}</p>}
        <button type="button" onClick={adicionar} disabled={!liberado || Boolean(aviso) || !dataValida} className="mt-3 min-h-[48px] w-full rounded-lg bg-viva-verde px-3 py-2 text-sm font-black text-viva-roxo disabled:opacity-40">{liberado ? 'Adicionar Plano ao Carrinho' : 'Disponível em 01/09'}</button>
      </div>
    </>}
  </section>;
}
