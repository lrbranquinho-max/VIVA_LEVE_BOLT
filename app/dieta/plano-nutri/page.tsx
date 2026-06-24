"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../supabase';
import Logo from '../../../components/Logo';

interface PlanoGerado {
  id: string;
  user_id: string;
  requisicao_id: string;
  data_plano: string;
  objetivo_estabelecido: string;
  kcal_diaria_meta: number;
  plano_semanal: any;
}

interface PlanoRequisicao {
  id: string;
  status: string;
  objetivo: string;
  criado_em: string;
}

interface RefeicaoPlano {
  refeicao: string;
  nome: string;
  porcao: string;
  gramas?: number;
  descricao?: string;
  modo_preparo?: string;
  kcal: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  produto_id?: number | null;
  receita_externa_id?: string | null;
  porcao_fixa_loja?: boolean;
  porcao_fixa_receita?: boolean;
}

interface DiaPlano {
  dia: string;
  refeicoes: RefeicaoPlano[];
}

interface SelecaoRefeicao {
  item: RefeicaoPlano;
  diaIndex: number;
  refeicaoIndex: number;
}

function hojeLocal() {
  const data = new Date();
  data.setMinutes(data.getMinutes() - data.getTimezoneOffset());
  return data.toISOString().slice(0, 10);
}

function normalizarDias(plano: any): DiaPlano[] {
  const bruto = Array.isArray(plano) ? plano : Array.isArray(plano?.dias) ? plano.dias : Array.isArray(plano?.plano_semanal) ? plano.plano_semanal : [];
  return bruto.map((dia: any, idx: number) => ({
    dia: String(dia.dia ?? dia.nome ?? `Dia ${idx + 1}`),
    refeicoes: (Array.isArray(dia.refeicoes) ? dia.refeicoes : []).map((item: any) => ({
      refeicao: String(item.refeicao ?? item.tipo_refeicao ?? 'Refeicao'),
      nome: String(item.nome ?? item.nome_alimento ?? item.prato ?? 'Item do plano'),
      porcao: String(item.porcao ?? (item.gramas ? `${item.gramas}g` : '')),
      gramas: Number(item.gramas ?? String(item.porcao ?? '').replace(/\D/g, '') ?? 0),
      descricao: String(item.descricao ?? ''),
      modo_preparo: String(item.modo_preparo ?? item.descricao ?? ''),
      kcal: Number(item.kcal ?? 0),
      proteinas: Number(item.proteinas ?? item.prot ?? 0),
      carboidratos: Number(item.carboidratos ?? item.carb ?? 0),
      gorduras: Number(item.gorduras ?? item.gord ?? 0),
      produto_id: item.produto_id ? Number(item.produto_id) : null,
      receita_externa_id: item.receita_externa_id ? String(item.receita_externa_id) : null,
      porcao_fixa_loja: Boolean(item.porcao_fixa_loja),
      porcao_fixa_receita: Boolean(item.porcao_fixa_receita),
    })),
  }));
}

function textoRefeicao(item: RefeicaoPlano) {
  if (/\(\s*(porcao:\s*)?\d+\s*g\s*\)/i.test(item.nome)) return item.nome;
  return `${item.nome}${item.porcao ? ` (${item.porcao})` : ''}`;
}

function categoriaProduto(produto: any) {
  return String(produto?.categoria ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function produtoPermitidoNaRefeicao(produto: any, refeicao: string) {
  const categoria = categoriaProduto(produto);
  if (categoria.includes('marmita')) return ['Almoco', 'Jantar'].includes(refeicao);
  if (categoria.includes('lanche') || categoria.includes('suplemento')) return ['Cafe da Manha', 'Lanche da Manha', 'Lanche da Tarde'].includes(refeicao);
  if (categoria.includes('caldo')) return ['Jantar', 'Ceia'].includes(refeicao);
  return ['Almoco', 'Jantar', 'Ceia'].includes(refeicao);
}

function produtoTemPorcaoFixa(produto: any) {
  const categoria = categoriaProduto(produto);
  return categoria.includes('marmita') || categoria.includes('caldo');
}

function tipoReceitaExterna(refeicao: string) {
  if (refeicao === 'Cafe da Manha') return 'Cafe da Manha';
  if (refeicao === 'Lanche da Manha' || refeicao === 'Lanche da Tarde') return 'Lanche';
  if (refeicao === 'Almoco' || refeicao === 'Jantar') return 'Almoco_Jantar';
  if (refeicao === 'Ceia') return 'Ceia';
  return '';
}

function macrosReceita(receita: any, gramas: number) {
  const fator = gramas / 100;
  return {
    kcal: Math.round(Number(receita.kcal_100g ?? 0) * fator),
    proteinas: Number((Number(receita.prot_100g ?? 0) * fator).toFixed(1)),
    carboidratos: Number((Number(receita.carb_100g ?? 0) * fator).toFixed(1)),
    gorduras: Number((Number(receita.gord_100g ?? 0) * fator).toFixed(1)),
  };
}

function pontuarAlternativa(base: RefeicaoPlano, item: RefeicaoPlano) {
  return Math.abs(Number(base.kcal) - Number(item.kcal))
    + Math.abs(Number(base.proteinas) - Number(item.proteinas)) * 4
    + Math.abs(Number(base.carboidratos) - Number(item.carboidratos)) * 2
    + Math.abs(Number(base.gorduras) - Number(item.gorduras)) * 3;
}

export default function PlanoNutriPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [clienteId, setClienteId] = useState('');
  const [plano, setPlano] = useState<PlanoGerado | null>(null);
  const [pendente, setPendente] = useState<PlanoRequisicao | null>(null);
  const [diaAberto, setDiaAberto] = useState(0);
  const [refeicaoSelecionada, setRefeicaoSelecionada] = useState<SelecaoRefeicao | null>(null);
  const [alternativas, setAlternativas] = useState<RefeicaoPlano[]>([]);
  const [carregandoAlternativas, setCarregandoAlternativas] = useState(false);
  const [salvandoAlternativa, setSalvandoAlternativa] = useState(false);
  const [toast, setToast] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      setClienteId(user.id);

      const [{ data: planoData, error: planoError }, { data: reqData, error: reqError }] = await Promise.all([
        supabase
          .from('planos_gerados')
          .select('*')
          .eq('user_id', user.id)
          .order('data_plano', { ascending: false })
          .order('criado_em', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('planos_requisicoes')
          .select('id,status,objetivo,criado_em')
          .eq('user_id', user.id)
          .in('status', ['pendente', 'em_revisao'])
          .order('criado_em', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (planoError) throw planoError;
      if (reqError) throw reqError;
      setPlano(planoData as PlanoGerado | null);
      setPendente(reqData as PlanoRequisicao | null);
    } catch (err: any) {
      setToast(`Erro ao carregar plano: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const dias = useMemo(() => normalizarDias(plano?.plano_semanal), [plano]);

  const registrarRefeicao = async (item: RefeicaoPlano) => {
    if (!clienteId) return;

    try {
      const gramas = Number(item.gramas) || Number(String(item.porcao).replace(/\D/g, '')) || 100;
      const { error } = await supabase.from('historico_refeicoes').insert([{
        cliente_id: clienteId,
        data_consumo: hojeLocal(),
        tipo_refeicao: item.refeicao,
        nome_alimento: textoRefeicao(item),
        gramas,
        kcal: item.kcal,
        proteinas: item.proteinas,
        carboidratos: item.carboidratos,
        gorduras: item.gorduras,
      }]);
      if (error) throw error;
      setRefeicaoSelecionada(null);
      setAlternativas([]);
      setToast('Refeicao registrada no diario de hoje.');
      window.setTimeout(() => setToast(''), 3500);
    } catch (err: any) {
      setToast(`Erro ao registrar refeicao: ${err.message}`);
    }
  };

  const abrirRefeicao = (item: RefeicaoPlano, diaIndex: number, refeicaoIndex: number) => {
    setRefeicaoSelecionada({ item, diaIndex, refeicaoIndex });
    setAlternativas([]);
  };

  const buscarAlternativas = async () => {
    if (!refeicaoSelecionada) return;
    const itemAtual = refeicaoSelecionada.item;
    setCarregandoAlternativas(true);
    setAlternativas([]);
    try {
      const [produtosRes, receitasRes] = await Promise.all([
        supabase
          .from('produtos')
          .select('id,nome,descricao,categoria,porcao_g,kcal,proteinas,carboidratos,gorduras')
          .eq('ativo', true)
          .gt('estoque', 0),
        supabase
          .from('receitas_externas')
          .select('id,tipo_refeicao,nome_receita,modo_preparo,kcal_100g,carb_100g,prot_100g,gord_100g,porcao')
          .eq('tipo_refeicao', tipoReceitaExterna(itemAtual.refeicao)),
      ]);
      if (produtosRes.error) throw produtosRes.error;
      if (receitasRes.error) throw receitasRes.error;

      const gramasBase = Number(itemAtual.gramas) || Number(String(itemAtual.porcao).replace(/\D/g, '')) || 100;
      const produtos = (produtosRes.data ?? [])
        .filter(produto => produtoPermitidoNaRefeicao(produto, itemAtual.refeicao))
        .map((produto: any) => {
          const gramas = Number(produto.porcao_g ?? gramasBase) || gramasBase;
          return {
            refeicao: itemAtual.refeicao,
            nome: `${produto.nome} (${gramas}g)`,
            porcao: `${gramas}g`,
            gramas,
            descricao: produto.descricao ?? '',
            modo_preparo: produto.descricao ?? '',
            kcal: Math.round(Number(produto.kcal ?? 0) * (gramas / 100)),
            proteinas: Number(produto.proteinas ?? 0),
            carboidratos: Number(produto.carboidratos ?? 0),
            gorduras: Number(produto.gorduras ?? 0),
            produto_id: Number(produto.id),
            receita_externa_id: null,
            porcao_fixa_loja: produtoTemPorcaoFixa(produto),
          } as RefeicaoPlano;
        });

      const receitas = (receitasRes.data ?? []).map((receita: any) => {
        const gramas = Number(receita.porcao ?? 0) > 0 ? Math.round(Number(receita.porcao)) : gramasBase;
        const macros = macrosReceita(receita, gramas);
        return {
          refeicao: itemAtual.refeicao,
          nome: `${receita.nome_receita} (Porcao: ${gramas}g)`,
          porcao: `${gramas}g`,
          gramas,
          descricao: receita.modo_preparo ?? '',
          modo_preparo: receita.modo_preparo ?? '',
          ...macros,
          produto_id: null,
          receita_externa_id: String(receita.id),
          porcao_fixa_receita: true,
        } as RefeicaoPlano;
      });

      const nomeAtual = textoRefeicao(itemAtual).toLowerCase();
      const melhores = [...produtos, ...receitas]
        .filter(item => textoRefeicao(item).toLowerCase() !== nomeAtual)
        .sort((a, b) => pontuarAlternativa(itemAtual, a) - pontuarAlternativa(itemAtual, b))
        .slice(0, 3);

      if (melhores.length === 0) {
        setToast('Nao encontrei alternativas compativeis para esta refeicao.');
      }
      setAlternativas(melhores);
    } catch (err: any) {
      setToast(`Erro ao buscar alternativas: ${err.message}`);
    } finally {
      setCarregandoAlternativas(false);
    }
  };

  const trocarRefeicao = async (novaRefeicao: RefeicaoPlano) => {
    if (!plano || !refeicaoSelecionada) return;
    setSalvandoAlternativa(true);
    try {
      const novosDias = dias.map((dia, diaIndex) => ({
        ...dia,
        refeicoes: dia.refeicoes.map((item, refeicaoIndex) => (
          diaIndex === refeicaoSelecionada.diaIndex && refeicaoIndex === refeicaoSelecionada.refeicaoIndex
            ? novaRefeicao
            : item
        )),
      }));

      const { error } = await supabase
        .from('planos_gerados')
        .update({ plano_semanal: novosDias })
        .eq('id', plano.id)
        .eq('user_id', clienteId);
      if (error) throw error;

      setPlano({ ...plano, plano_semanal: novosDias });
      setRefeicaoSelecionada({ ...refeicaoSelecionada, item: novaRefeicao });
      setAlternativas([]);
      setToast('Item do plano atualizado.');
      window.setTimeout(() => setToast(''), 3500);
    } catch (err: any) {
      setToast(`Erro ao atualizar plano: ${err.message}`);
    } finally {
      setSalvandoAlternativa(false);
    }
  };

  const enviarParaCarrinho = () => {
    const itens: Record<number, number> = {};
    dias.forEach(dia => {
      dia.refeicoes.forEach(refeicao => {
        if (refeicao.produto_id) {
          itens[refeicao.produto_id] = (itens[refeicao.produto_id] ?? 0) + 1;
        }
      });
    });

    if (Object.keys(itens).length === 0) {
      setToast('Este plano nao possui itens Viva Leve vinculados.');
      return;
    }

    localStorage.setItem('viva-leve-plano-carrinho', JSON.stringify(itens));
    router.push('/');
  };

  if (loading) {
    return <div className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-gray-50 text-sm font-bold text-gray-500">Carregando plano...</div>;
  }

  return (
    <div className="relative mx-auto min-h-screen max-w-md bg-gray-50 pb-24 font-sans shadow-2xl">
      {toast && (
        <button onClick={() => setToast('')} className="fixed left-1/2 top-4 z-[120] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl bg-viva-roxo p-4 text-center text-sm font-bold text-white shadow-xl">
          {toast}
        </button>
      )}

      <header className="space-y-4 border-b border-gray-100 bg-white p-4 shadow-sm">
        <div className="max-w-xs"><Logo /></div>
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-viva-roxo">Plano Nutri</p>
          <h1 className="text-2xl font-black text-gray-900">Seu plano alimentar</h1>
        </div>
      </header>

      <main className="space-y-4 p-4">
        {pendente && (
          <section className="rounded-2xl border border-viva-verde/50 bg-viva-verde/20 p-5 text-center">
            <p className="text-3xl">VL</p>
            <h2 className="mt-2 text-lg font-black text-viva-roxo">Seu perfil esta em analise!</h2>
            <p className="mt-2 text-sm font-semibold text-gray-600">
              Nosso nutricionista virtual esta montando o melhor plano para voce. Volte em ate 24 horas.
            </p>
          </section>
        )}

        {!plano ? (
          <section className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <p className="text-sm font-bold text-gray-500">Nenhum plano aprovado ainda.</p>
            <Link href="/dieta?abrirPlano=1" className="mt-4 inline-flex rounded-xl bg-viva-roxo px-4 py-3 text-xs font-black text-white">
              Solicitar Plano Nutri
            </Link>
          </section>
        ) : (
          <>
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase text-gray-400">{new Date(`${plano.data_plano}T12:00:00`).toLocaleDateString('pt-BR')}</p>
              <h2 className="mt-1 text-xl font-black text-gray-900">{plano.objetivo_estabelecido}</h2>
              <p className="mt-1 text-sm font-bold text-viva-roxo">{Number(plano.kcal_diaria_meta).toLocaleString('pt-BR')} kcal/dia</p>
              <button onClick={enviarParaCarrinho} className="mt-4 w-full rounded-xl bg-viva-verde py-3 text-sm font-black text-viva-roxo shadow-sm">
                Enviar itens da Viva Leve para o Carrinho
              </button>
            </section>

            <section className="space-y-3">
              {dias.map((dia, index) => (
                <article key={`${dia.dia}-${index}`} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                  <button type="button" onClick={() => setDiaAberto(index)} className="flex w-full items-center justify-between p-4 text-left">
                    <span className="font-black text-gray-900">{dia.dia}</span>
                    <span className="text-xs font-black text-viva-roxo">{diaAberto === index ? 'Aberto' : 'Ver'}</span>
                  </button>
                  {diaAberto === index && (
                    <div className="space-y-3 border-t border-gray-100 p-4">
                      {dia.refeicoes.map((item, itemIndex) => (
                        <button key={`${item.nome}-${itemIndex}`} type="button" onClick={() => abrirRefeicao(item, index, itemIndex)} className="w-full rounded-xl bg-gray-50 p-4 text-left">
                          <p className="text-xs font-black uppercase text-viva-roxo">{item.refeicao}</p>
                          <h3 className="mt-1 text-sm font-black text-gray-900">{textoRefeicao(item)}</h3>
                          <p className="mt-2 text-xs font-bold text-gray-500">
                            Kcal: {Math.round(item.kcal)} | Prot: {item.proteinas}g | Carb: {item.carboidratos}g | Gord: {item.gorduras}g
                          </p>
                          {item.produto_id && <p className="mt-1 text-[11px] font-black text-green-600">Item Viva Leve #{item.produto_id}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </section>
          </>
        )}
      </main>

      {refeicaoSelecionada && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <section className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
              <div>
                <p className="text-xs font-black uppercase text-viva-roxo">{refeicaoSelecionada.item.refeicao}</p>
                <h2 className="mt-1 text-lg font-black text-gray-900">{textoRefeicao(refeicaoSelecionada.item)}</h2>
              </div>
              <button type="button" onClick={() => setRefeicaoSelecionada(null)} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-500">Fechar</button>
            </div>
            <div className="mt-4 space-y-4">
              <p className="rounded-xl bg-gray-50 p-4 text-sm font-semibold leading-relaxed text-gray-600">
                {refeicaoSelecionada.item.modo_preparo || refeicaoSelecionada.item.descricao || 'Detalhe de preparo nao informado para esta refeicao.'}
              </p>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded-xl bg-gray-50 p-2"><p className="font-black text-gray-400">Kcal</p><p className="font-black">{Math.round(refeicaoSelecionada.item.kcal)}</p></div>
                <div className="rounded-xl bg-gray-50 p-2"><p className="font-black text-gray-400">Prot</p><p className="font-black">{refeicaoSelecionada.item.proteinas}g</p></div>
                <div className="rounded-xl bg-gray-50 p-2"><p className="font-black text-gray-400">Carb</p><p className="font-black">{refeicaoSelecionada.item.carboidratos}g</p></div>
                <div className="rounded-xl bg-gray-50 p-2"><p className="font-black text-gray-400">Gord</p><p className="font-black">{refeicaoSelecionada.item.gorduras}g</p></div>
              </div>
              <button type="button" onClick={() => registrarRefeicao(refeicaoSelecionada.item)} className="w-full rounded-xl bg-viva-verde py-3 text-sm font-black text-viva-roxo shadow-sm">
                ✅ Registrar Refeição no meu Diário
              </button>
              <button type="button" onClick={buscarAlternativas} disabled={carregandoAlternativas} className="w-full rounded-xl bg-viva-roxo py-3 text-sm font-black text-white shadow-sm disabled:opacity-60">
                {carregandoAlternativas ? 'Buscando...' : 'Alterar item'}
              </button>
              {alternativas.length > 0 && (
                <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs font-black uppercase text-gray-500">Escolha uma alternativa</p>
                  {alternativas.map((alternativa, index) => (
                    <button
                      key={`${alternativa.nome}-${index}`}
                      type="button"
                      onClick={() => trocarRefeicao(alternativa)}
                      disabled={salvandoAlternativa}
                      className="w-full rounded-xl bg-white p-3 text-left text-xs font-bold text-gray-700 shadow-sm disabled:opacity-60"
                    >
                      <span className="block text-sm font-black text-gray-900">{textoRefeicao(alternativa)}</span>
                      <span>Kcal: {Math.round(alternativa.kcal)} | Prot: {alternativa.proteinas}g | Carb: {alternativa.carboidratos}g | Gord: {alternativa.gorduras}g</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      <nav className="fixed bottom-0 z-10 flex w-full max-w-md justify-around border-t border-gray-200 bg-white p-3 pb-5">
        <Link href="/" className="flex flex-col items-center text-gray-400 hover:text-viva-roxo"><span className="text-xl">&#127968;</span><span className="mt-1 text-[10px] font-bold">Loja</span></Link>
        <Link href="/pedidos" className="flex flex-col items-center text-gray-400 hover:text-viva-roxo"><span className="text-xl">&#128203;</span><span className="mt-1 text-[10px] font-bold">Pedidos</span></Link>
        <Link href="/dieta" className="flex flex-col items-center text-viva-roxo"><span className="text-xl">&#128241;</span><span className="mt-1 text-[10px] font-bold">Dieta</span></Link>
        <Link href="/perfil" className="flex flex-col items-center text-gray-400 hover:text-viva-roxo"><span className="text-xl">&#128100;</span><span className="mt-1 text-[10px] font-bold">Perfil</span></Link>
      </nav>
    </div>
  );
}
