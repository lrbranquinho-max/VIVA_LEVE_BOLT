'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import LancamentoFinanceiroModal from '@/components/admin/LancamentoFinanceiroModal';
import { GraficoDistribuicao, GraficoReceitasSaidas, SerieFinanceira } from '@/components/admin/FinanceiroGraficos';
import {
  CategoriaFinanceira,
  CentroCustoFinanceiro,
  dataISO,
  FormaPagamentoFinanceira,
  FORMAS_PAGAMENTO_FINANCEIRO,
  formatarData,
  formatarMoeda,
  FornecedorFinanceiro,
  intervaloFinanceiro,
  LancamentoFinanceiro,
  nomeForma,
  nomeTipo,
  ParcelaFinanceira,
  ReceitaFinanceira,
  TipoFinanceiro,
  TIPOS_FINANCEIROS,
} from '@/lib/financeiro';
import { supabase } from '@/supabase';

type Aba = 'dashboard' | 'lancamentos' | 'contas' | 'categorias';
type Periodo = 'hoje' | '7dias' | 'mes' | 'mes_anterior' | 'personalizado';

interface Toast { id: number; texto: string; tipo: 'sucesso' | 'erro' }

const selectClass = 'h-10 border border-gray-300 bg-white px-3 text-sm font-bold text-gray-700 outline-none focus:border-viva-roxo';

function dentroDoPeriodo(data: string | null | undefined, inicio: Date, fim: Date) {
  if (!data) return false;
  const instante = new Date(data.length === 10 ? `${data}T12:00:00` : data);
  return instante >= inicio && instante <= fim;
}

function somar(valores: number[]) {
  return valores.reduce((total, valor) => total + (Number(valor) || 0), 0);
}

function CardIndicador({ titulo, valor, detalhe, tom = 'neutro' }: { titulo: string; valor: string; detalhe?: string; tom?: 'verde' | 'roxo' | 'vermelho' | 'neutro' }) {
  const cores = {
    verde: 'border-emerald-500 text-emerald-700',
    roxo: 'border-viva-roxo text-viva-roxo',
    vermelho: 'border-red-500 text-red-700',
    neutro: 'border-gray-400 text-gray-900',
  };
  return (
    <article className={`min-h-[7.5rem] border-l-4 bg-white p-4 shadow-sm ${cores[tom]}`}>
      <p className="text-xs font-black uppercase text-gray-500">{titulo}</p>
      <p className="mt-2 text-2xl font-black">{valor}</p>
      {detalhe && <p className="mt-1 text-xs font-bold text-gray-500">{detalhe}</p>}
    </article>
  );
}

function StatusBadge({ status, vencimento }: { status: string; vencimento?: string }) {
  const vencida = status === 'pendente' && vencimento && vencimento < dataISO();
  const classe = status === 'pago' ? 'bg-emerald-100 text-emerald-800' : status === 'cancelado' ? 'bg-gray-200 text-gray-600' : vencida ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800';
  return <span className={`inline-flex px-2 py-1 text-xs font-black uppercase ${classe}`}>{vencida ? 'Vencida' : status}</span>;
}

export default function FinanceiroAdminPage() {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>('dashboard');
  const [menuAberto, setMenuAberto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [usuarioEmail, setUsuarioEmail] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modalLancamento, setModalLancamento] = useState(false);
  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([]);
  const [centros, setCentros] = useState<CentroCustoFinanceiro[]>([]);
  const [fornecedores, setFornecedores] = useState<FornecedorFinanceiro[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoFinanceiro[]>([]);
  const [parcelas, setParcelas] = useState<ParcelaFinanceira[]>([]);
  const [receitas, setReceitas] = useState<ReceitaFinanceira[]>([]);
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [inicioPersonalizado, setInicioPersonalizado] = useState(dataISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [fimPersonalizado, setFimPersonalizado] = useState(dataISO());
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroCentro, setFiltroCentro] = useState('');
  const [filtroFornecedor, setFiltroFornecedor] = useState('');
  const [filtroForma, setFiltroForma] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [ordem, setOrdem] = useState<'data' | 'valor' | 'vencimento'>('data');
  const [parcelaPagamento, setParcelaPagamento] = useState<ParcelaFinanceira | null>(null);
  const [dataPagamento, setDataPagamento] = useState(dataISO());
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamentoFinanceira>('pix');
  const [salvandoPagamento, setSalvandoPagamento] = useState(false);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState('');
  const [novaCategoriaTipo, setNovaCategoriaTipo] = useState<TipoFinanceiro>('insumo');
  const [novoCentroNome, setNovoCentroNome] = useState('');

  const toast = useCallback((texto: string, tipo: Toast['tipo']) => {
    const id = Date.now() + Math.random();
    setToasts(atual => [...atual, { id, texto, tipo }]);
    window.setTimeout(() => setToasts(atual => atual.filter(item => item.id !== id)), 4500);
  }, []);

  const carregarDados = useCallback(async () => {
    setErro('');
    try {
      const [categoriasResp, centrosResp, fornecedoresResp, lancamentosResp, parcelasResp, receitasResp] = await Promise.all([
        supabase.from('financeiro_categorias').select('*').order('tipo').order('nome'),
        supabase.from('financeiro_centros_custo').select('*').order('nome'),
        supabase.from('financeiro_fornecedores').select('*').order('nome_razao_social'),
        supabase.from('financeiro_lancamentos').select('*, categoria:financeiro_categorias!categoria_id(*), centro_custo:financeiro_centros_custo!centro_custo_id(*), fornecedor:financeiro_fornecedores!fornecedor_id(*)').order('data_compra', { ascending: false }),
        supabase.from('financeiro_parcelas').select('*, lancamento:financeiro_lancamentos!lancamento_id(*, categoria:financeiro_categorias!categoria_id(*), centro_custo:financeiro_centros_custo!centro_custo_id(*), fornecedor:financeiro_fornecedores!fornecedor_id(*))').order('data_vencimento'),
        supabase.from('financeiro_receitas').select('*').order('data_recebimento', { ascending: false }),
      ]);
      const falha = [categoriasResp, centrosResp, fornecedoresResp, lancamentosResp, parcelasResp, receitasResp].find(item => item.error)?.error;
      if (falha) throw falha;
      setCategorias((categoriasResp.data ?? []) as CategoriaFinanceira[]);
      setCentros((centrosResp.data ?? []) as CentroCustoFinanceiro[]);
      setFornecedores((fornecedoresResp.data ?? []) as FornecedorFinanceiro[]);
      setLancamentos((lancamentosResp.data ?? []) as LancamentoFinanceiro[]);
      setParcelas((parcelasResp.data ?? []) as ParcelaFinanceira[]);
      setReceitas((receitasResp.data ?? []) as ReceitaFinanceira[]);
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : 'Não foi possível carregar o módulo financeiro.';
      setErro(mensagem);
    }
  }, []);

  useEffect(() => {
    async function iniciar() {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) { router.replace('/login'); return; }
      const { data: admin, error: adminError } = await supabase.rpc('is_viva_leve_admin');
      if (adminError || !admin) { router.replace('/login'); return; }
      setUsuarioEmail(auth.user.email ?? '');
      await carregarDados();
      setLoading(false);
    }
    iniciar();
  }, [carregarDados, router]);

  const intervalo = useMemo(() => intervaloFinanceiro(periodo, inicioPersonalizado, fimPersonalizado), [periodo, inicioPersonalizado, fimPersonalizado]);
  const receitasPeriodo = useMemo(() => receitas.filter(item => dentroDoPeriodo(item.data_recebimento, intervalo.inicio, intervalo.fim)), [receitas, intervalo]);
  const saidasPeriodo = useMemo(() => parcelas.filter(item => item.status === 'pago' && dentroDoPeriodo(item.data_pagamento, intervalo.inicio, intervalo.fim)), [parcelas, intervalo]);
  const pendentes = useMemo(() => parcelas.filter(item => item.status === 'pendente'), [parcelas]);
  const vencidas = useMemo(() => pendentes.filter(item => item.data_vencimento < dataISO()), [pendentes]);
  const proximos30 = useMemo(() => {
    const limite = new Date(); limite.setDate(limite.getDate() + 30);
    return pendentes.filter(item => item.data_vencimento >= dataISO() && item.data_vencimento <= dataISO(limite));
  }, [pendentes]);

  const totais = useMemo(() => {
    const receita = somar(receitasPeriodo.map(item => item.valor));
    const saida = somar(saidasPeriodo.map(item => item.valor));
    return {
      receita, saida, resultado: receita - saida,
      contas: somar(pendentes.map(item => item.valor)),
      vencidas: somar(vencidas.map(item => item.valor)),
      investimentos: somar(saidasPeriodo.filter(item => item.lancamento?.tipo === 'investimento').map(item => item.valor)),
      futuro30: somar(proximos30.map(item => item.valor)),
    };
  }, [receitasPeriodo, saidasPeriodo, pendentes, vencidas, proximos30]);

  const seriePeriodo = useMemo<SerieFinanceira[]>(() => {
    const dias = Math.ceil((intervalo.fim.getTime() - intervalo.inicio.getTime()) / 86400000) + 1;
    const mensal = dias > 45;
    const mapa = new Map<string, SerieFinanceira>();
    const chave = (data: string) => {
      const d = new Date(data.length === 10 ? `${data}T12:00:00` : data);
      return mensal ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : dataISO(d);
    };
    const rotulo = (valor: string) => mensal ? valor.split('-').reverse().join('/') : valor.slice(8, 10) + '/' + valor.slice(5, 7);
    receitasPeriodo.forEach(item => { const k = chave(item.data_recebimento); const atual = mapa.get(k) ?? { rotulo: k, receitas: 0, saidas: 0 }; atual.receitas += Number(item.valor); mapa.set(k, atual); });
    saidasPeriodo.forEach(item => { const k = chave(item.data_pagamento!); const atual = mapa.get(k) ?? { rotulo: k, receitas: 0, saidas: 0 }; atual.saidas += Number(item.valor); mapa.set(k, atual); });
    return Array.from(mapa.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, item]) => ({ ...item, rotulo: rotulo(item.rotulo) }));
  }, [receitasPeriodo, saidasPeriodo, intervalo]);

  const evolucao12Meses = useMemo<SerieFinanceira[]>(() => {
    const resultado: SerieFinanceira[] = [];
    const hoje = new Date();
    for (let i = 11; i >= 0; i--) {
      const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ano = data.getFullYear(); const mes = data.getMonth();
      const noMes = (valor: string | null) => { if (!valor) return false; const d = new Date(valor.length === 10 ? `${valor}T12:00:00` : valor); return d.getFullYear() === ano && d.getMonth() === mes; };
      resultado.push({
        rotulo: `${String(mes + 1).padStart(2, '0')}/${String(ano).slice(2)}`,
        receitas: somar(receitas.filter(item => noMes(item.data_recebimento)).map(item => item.valor)),
        saidas: somar(parcelas.filter(item => item.status === 'pago' && noMes(item.data_pagamento)).map(item => item.valor)),
      });
    }
    return resultado;
  }, [receitas, parcelas]);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, number>();
    saidasPeriodo.forEach(item => { const nome = item.lancamento?.categoria?.nome ?? 'Sem categoria'; mapa.set(nome, (mapa.get(nome) ?? 0) + Number(item.valor)); });
    return Array.from(mapa.entries()).map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8);
  }, [saidasPeriodo]);

  const porTipo = useMemo(() => TIPOS_FINANCEIROS.map(tipo => ({
    rotulo: tipo.label,
    valor: somar(saidasPeriodo.filter(item => item.lancamento?.tipo === tipo.value).map(item => item.valor)),
  })).filter(item => item.valor > 0), [saidasPeriodo]);

  const lancamentosFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return lancamentos.filter(item => {
      const primeiraParcela = parcelas.find(parcela => parcela.lancamento_id === item.id);
      const texto = `${item.descricao} ${item.numero_documento ?? ''} ${item.fornecedor?.nome_razao_social ?? ''}`.toLocaleLowerCase('pt-BR');
      return (!termo || texto.includes(termo))
        && (!filtroTipo || item.tipo === filtroTipo)
        && (!filtroCategoria || item.categoria_id === filtroCategoria)
        && (!filtroCentro || item.centro_custo_id === filtroCentro)
        && (!filtroFornecedor || item.fornecedor_id === filtroFornecedor)
        && (!filtroForma || item.forma_pagamento === filtroForma)
        && (!filtroStatus || item.status === filtroStatus)
        && dentroDoPeriodo(item.data_compra, intervalo.inicio, intervalo.fim)
        && Boolean(primeiraParcela);
    }).sort((a, b) => {
      if (ordem === 'valor') return Number(b.valor_total) - Number(a.valor_total);
      if (ordem === 'vencimento') {
        const av = parcelas.find(item => item.lancamento_id === a.id)?.data_vencimento ?? '';
        const bv = parcelas.find(item => item.lancamento_id === b.id)?.data_vencimento ?? '';
        return av.localeCompare(bv);
      }
      return b.data_compra.localeCompare(a.data_compra);
    });
  }, [lancamentos, parcelas, busca, filtroTipo, filtroCategoria, filtroCentro, filtroFornecedor, filtroForma, filtroStatus, ordem, intervalo]);

  const gruposContas = useMemo(() => {
    const hoje = dataISO(); const limite = new Date(); limite.setDate(limite.getDate() + 30);
    const futuras = dataISO(limite);
    return [
      { titulo: 'Vencidas', tom: 'text-red-700', itens: pendentes.filter(item => item.data_vencimento < hoje) },
      { titulo: 'Vencem hoje', tom: 'text-amber-700', itens: pendentes.filter(item => item.data_vencimento === hoje) },
      { titulo: 'Próximos vencimentos', tom: 'text-viva-roxo', itens: pendentes.filter(item => item.data_vencimento > hoje && item.data_vencimento <= futuras) },
      { titulo: 'Pagas', tom: 'text-emerald-700', itens: parcelas.filter(item => item.status === 'pago').sort((a, b) => (b.data_pagamento ?? '').localeCompare(a.data_pagamento ?? '')).slice(0, 50) },
    ];
  }, [pendentes, parcelas]);

  async function confirmarPagamento() {
    if (!parcelaPagamento) return;
    setSalvandoPagamento(true);
    const { error } = await supabase.rpc('marcar_parcela_financeira_paga', { p_parcela_id: parcelaPagamento.id, p_data_pagamento: dataPagamento, p_forma_pagamento: formaPagamento });
    setSalvandoPagamento(false);
    if (error) { toast(`Erro ao marcar pagamento: ${error.message}`, 'erro'); return; }
    setParcelaPagamento(null); toast('Pagamento registrado com sucesso.', 'sucesso'); await carregarDados();
  }

  async function salvarCategoria() {
    if (!novaCategoriaNome.trim()) return;
    const { error } = await supabase.from('financeiro_categorias').insert({ tipo: novaCategoriaTipo, nome: novaCategoriaNome.trim() });
    if (error) toast(`Erro ao criar categoria: ${error.message}`, 'erro');
    else { setNovaCategoriaNome(''); toast('Categoria criada.', 'sucesso'); await carregarDados(); }
  }

  async function salvarCentro() {
    if (!novoCentroNome.trim()) return;
    const { error } = await supabase.from('financeiro_centros_custo').insert({ nome: novoCentroNome.trim() });
    if (error) toast(`Erro ao criar centro de custo: ${error.message}`, 'erro');
    else { setNovoCentroNome(''); toast('Centro de custo criado.', 'sucesso'); await carregarDados(); }
  }

  async function alternarAtivo(tabela: 'financeiro_categorias' | 'financeiro_centros_custo', id: string, ativo: boolean) {
    const { error } = await supabase.from(tabela).update({ ativo: !ativo }).eq('id', id);
    if (error) toast(`Erro ao atualizar: ${error.message}`, 'erro'); else await carregarDados();
  }

  async function editarItem(tabela: 'financeiro_categorias' | 'financeiro_centros_custo', id: string, nomeAtual: string) {
    const novoNome = window.prompt('Novo nome:', nomeAtual)?.trim();
    if (!novoNome || novoNome === nomeAtual) return;
    const { error } = await supabase.from(tabela).update({ nome: novoNome }).eq('id', id);
    if (error) toast(`Erro ao editar: ${error.message}`, 'erro');
    else { toast('Cadastro atualizado.', 'sucesso'); await carregarDados(); }
  }

  async function cancelarLancamento(id: string) {
    if (!window.confirm('Cancelar este lançamento e todas as parcelas ainda pendentes? O histórico será preservado.')) return;
    const { error } = await supabase.rpc('cancelar_lancamento_financeiro', { p_lancamento_id: id });
    if (error) toast(`Erro ao cancelar: ${error.message}`, 'erro');
    else { toast('Lançamento cancelado sem excluir o histórico.', 'sucesso'); await carregarDados(); }
  }

  async function abrirAnexo(path: string) {
    const { data, error } = await supabase.storage.from('financeiro-documentos').createSignedUrl(path, 120);
    if (error || !data?.signedUrl) { toast(`Erro ao abrir anexo: ${error?.message ?? 'arquivo indisponível'}`, 'erro'); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-gray-100"><div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-viva-roxo" /></div>;

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <div className="fixed right-4 top-4 z-[90] space-y-2">{toasts.map(item => <div key={item.id} className={`max-w-sm px-4 py-3 text-sm font-bold text-white shadow-xl ${item.tipo === 'sucesso' ? 'bg-emerald-600' : 'bg-red-600'}`}>{item.texto}</div>)}</div>
      <main className="mx-auto w-full max-w-screen-2xl p-4 md:p-6">
        <header className="relative mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase text-viva-roxo">Viva Leve Admin</p>
            <h1 className="text-2xl font-black">Financeiro</h1>
            <p className="text-sm text-gray-500">Fluxo realizado e compromissos futuros.</p>
          </div>
          <div className="relative z-40">
            <button onClick={() => setMenuAberto(v => !v)} className="flex h-12 w-12 flex-col items-center justify-center gap-1 bg-white shadow-sm ring-1 ring-gray-200" aria-label="Abrir menu">
              {[0, 1, 2, 3].map(item => <span key={item} className="h-0.5 w-6 bg-gray-900" />)}
            </button>
            {menuAberto && <nav className="absolute right-0 top-14 w-72 border border-gray-200 bg-white p-2 shadow-2xl">
              <p className="truncate border-b px-3 py-2 text-xs text-gray-500">{usuarioEmail}</p>
              {(['dashboard', 'lancamentos', 'contas', 'categorias'] as Aba[]).map(item => <button key={item} onClick={() => { setAba(item); setMenuAberto(false); }} className={`block w-full px-3 py-2.5 text-left text-sm font-black capitalize ${aba === item ? 'bg-gray-900 text-white' : 'hover:bg-gray-100'}`}>{item === 'contas' ? 'Contas a pagar' : item}</button>)}
              <Link href="/admin" className="mt-2 block border-t px-3 py-3 text-sm font-black text-viva-roxo">Voltar ao painel Admin</Link>
            </nav>}
          </div>
        </header>

        <div className="mb-5 flex gap-2 overflow-x-auto border-b border-gray-300 pb-2">
          {([['dashboard', 'Dashboard'], ['lancamentos', 'Lançamentos'], ['contas', 'Contas a pagar'], ['categorias', 'Categorias']] as [Aba, string][]).map(([id, label]) => <button key={id} onClick={() => setAba(id)} className={`h-10 shrink-0 px-4 text-sm font-black ${aba === id ? 'bg-viva-roxo text-white' : 'bg-white text-gray-600'}`}>{label}</button>)}
          <button onClick={() => setModalLancamento(true)} className="ml-auto h-10 shrink-0 bg-viva-verde px-4 text-sm font-black text-viva-roxo">+ Novo lançamento</button>
        </div>

        {erro && <div className="mb-5 border-l-4 border-red-500 bg-red-50 p-4 text-sm font-bold text-red-700">Erro ao carregar dados: {erro}<button onClick={carregarDados} className="ml-3 underline">Tentar novamente</button></div>}

        {(aba === 'dashboard' || aba === 'lancamentos') && <div className="mb-5 flex flex-wrap items-end gap-2 bg-white p-3 shadow-sm">
          <label className="text-xs font-black uppercase text-gray-500">Período<select value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)} className={`block ${selectClass}`}><option value="hoje">Hoje</option><option value="7dias">Últimos 7 dias</option><option value="mes">Mês atual</option><option value="mes_anterior">Mês anterior</option><option value="personalizado">Personalizado</option></select></label>
          {periodo === 'personalizado' && <><label className="text-xs font-black uppercase text-gray-500">De<input type="date" value={inicioPersonalizado} onChange={e => setInicioPersonalizado(e.target.value)} className={`block ${selectClass}`} /></label><label className="text-xs font-black uppercase text-gray-500">Até<input type="date" value={fimPersonalizado} onChange={e => setFimPersonalizado(e.target.value)} className={`block ${selectClass}`} /></label></>}
          <button onClick={carregarDados} className="h-10 border border-gray-300 px-4 text-sm font-black">Atualizar dados</button>
        </div>}

        {aba === 'dashboard' && <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <CardIndicador titulo="Receitas recebidas" valor={formatarMoeda(totais.receita)} tom="verde" />
            <CardIndicador titulo="Saídas pagas" valor={formatarMoeda(totais.saida)} tom="roxo" />
            <CardIndicador titulo="Resultado de caixa" valor={formatarMoeda(totais.resultado)} detalhe="Recebido menos pago" tom={totais.resultado >= 0 ? 'verde' : 'vermelho'} />
            <CardIndicador titulo="Contas a pagar" valor={formatarMoeda(totais.contas)} detalhe={`${pendentes.length} parcelas`} />
            <CardIndicador titulo="Contas vencidas" valor={formatarMoeda(totais.vencidas)} detalhe={`${vencidas.length} parcelas`} tom={vencidas.length ? 'vermelho' : 'neutro'} />
            <CardIndicador titulo="Investimentos" valor={formatarMoeda(totais.investimentos)} detalhe="Pagos no período" tom="roxo" />
            <CardIndicador titulo="Próximos 30 dias" valor={formatarMoeda(totais.futuro30)} detalhe="Fluxo previsto" />
          </section>
          <div className="grid gap-5 xl:grid-cols-2"><GraficoReceitasSaidas titulo="Receitas x saídas no período" dados={seriePeriodo} /><GraficoReceitasSaidas titulo="Evolução financeira · 12 meses" dados={evolucao12Meses} /></div>
          <div className="grid gap-5 xl:grid-cols-2"><GraficoDistribuicao titulo="Despesas por categoria" dados={porCategoria} /><GraficoDistribuicao titulo="Despesas por tipo" dados={porTipo} /></div>
        </div>}

        {aba === 'lancamentos' && <section className="bg-white shadow-sm">
          <div className="grid gap-2 border-b border-gray-200 p-4 md:grid-cols-3 xl:grid-cols-4">
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar descrição, fornecedor ou documento" className="h-10 border border-gray-300 px-3 text-sm md:col-span-2" />
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className={selectClass}><option value="">Todos os tipos</option>{TIPOS_FINANCEIROS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} className={selectClass}><option value="">Todas as categorias</option>{categorias.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select>
            <select value={filtroCentro} onChange={e => setFiltroCentro(e.target.value)} className={selectClass}><option value="">Todos os centros</option>{centros.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select>
            <select value={filtroFornecedor} onChange={e => setFiltroFornecedor(e.target.value)} className={selectClass}><option value="">Todos os fornecedores</option>{fornecedores.map(item => <option key={item.id} value={item.id}>{item.nome_razao_social}</option>)}</select>
            <select value={filtroForma} onChange={e => setFiltroForma(e.target.value)} className={selectClass}><option value="">Todas as formas</option>{FORMAS_PAGAMENTO_FINANCEIRO.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className={selectClass}><option value="">Todos os status</option><option value="pendente">Pendente</option><option value="pago">Pago</option><option value="cancelado">Cancelado</option></select>
            <select value={ordem} onChange={e => setOrdem(e.target.value as typeof ordem)} className={selectClass}><option value="data">Ordenar por data</option><option value="valor">Ordenar por valor</option><option value="vencimento">Ordenar por vencimento</option></select>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1220px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{['Data', 'Descrição', 'Fornecedor', 'Tipo', 'Categoria', 'Centro de custo', 'Pagamento', 'Valor', 'Vencimento', 'Status', 'Ações'].map(item => <th key={item} className="px-4 py-3">{item}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">
            {lancamentosFiltrados.map(item => { const primeira = parcelas.find(parcela => parcela.lancamento_id === item.id); return <tr key={item.id} className="hover:bg-gray-50"><td className="px-4 py-3 whitespace-nowrap">{formatarData(item.data_compra)}</td><td className="max-w-xs px-4 py-3 font-bold">{item.descricao}{item.quantidade_parcelas > 1 && <span className="block text-xs text-gray-400">{item.quantidade_parcelas} parcelas</span>}</td><td className="px-4 py-3">{item.fornecedor?.nome_razao_social ?? '-'}</td><td className="px-4 py-3">{nomeTipo(item.tipo)}</td><td className="px-4 py-3">{item.categoria?.nome ?? '-'}</td><td className="px-4 py-3">{item.centro_custo?.nome ?? '-'}</td><td className="px-4 py-3">{nomeForma(item.forma_pagamento)}</td><td className="px-4 py-3 font-black">{formatarMoeda(item.valor_total)}</td><td className="px-4 py-3 whitespace-nowrap">{formatarData(primeira?.data_vencimento)}</td><td className="px-4 py-3"><StatusBadge status={item.status} vencimento={primeira?.data_vencimento} /></td><td className="px-4 py-3"><div className="flex gap-2">{item.anexo_path && <button onClick={() => abrirAnexo(item.anexo_path!)} className="text-xs font-black text-viva-roxo hover:underline">Anexo</button>}{item.status === 'pendente' && <button onClick={() => cancelarLancamento(item.id)} className="text-xs font-black text-red-600 hover:underline">Cancelar</button>}</div></td></tr>; })}
            {!lancamentosFiltrados.length && <tr><td colSpan={11} className="p-10 text-center text-gray-400">Nenhum lançamento encontrado.</td></tr>}
          </tbody></table></div>
        </section>}

        {aba === 'contas' && <div className="grid gap-5 xl:grid-cols-2">{gruposContas.map(grupo => <section key={grupo.titulo} className="bg-white shadow-sm"><header className="flex items-center justify-between border-b px-4 py-3"><h2 className={`font-black ${grupo.tom}`}>{grupo.titulo}</h2><span className="text-sm font-black text-gray-500">{formatarMoeda(somar(grupo.itens.map(item => item.valor)))}</span></header><div className="divide-y divide-gray-100">
          {grupo.itens.map(item => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate font-black">{item.lancamento?.descricao ?? 'Lançamento'}</p><p className="text-xs text-gray-500">Parcela {item.numero_parcela}/{item.total_parcelas} · vencimento {formatarData(item.data_vencimento)}</p><p className="text-xs text-gray-500">{item.lancamento?.fornecedor?.nome_razao_social ?? 'Sem fornecedor'}</p></div><div className="text-right"><p className="font-black">{formatarMoeda(item.valor)}</p>{item.status === 'pendente' ? <button onClick={() => { setParcelaPagamento(item); setFormaPagamento(item.forma_pagamento ?? 'pix'); }} className="mt-1 bg-viva-verde px-3 py-2 text-xs font-black text-viva-roxo">Marcar como pago</button> : <StatusBadge status={item.status} />}</div></article>)}
          {!grupo.itens.length && <p className="p-8 text-center text-sm text-gray-400">Nenhuma conta nesta faixa.</p>}
        </div></section>)}</div>}

        {aba === 'categorias' && <div className="grid gap-5 xl:grid-cols-2">
          <section className="bg-white shadow-sm"><header className="border-b p-4"><h2 className="font-black">Categorias financeiras</h2><p className="text-xs text-gray-500">Configuráveis e separadas por natureza.</p></header><div className="grid gap-2 border-b p-4 sm:grid-cols-[10rem_1fr_auto]"><select value={novaCategoriaTipo} onChange={e => setNovaCategoriaTipo(e.target.value as TipoFinanceiro)} className={selectClass}>{TIPOS_FINANCEIROS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><input value={novaCategoriaNome} onChange={e => setNovaCategoriaNome(e.target.value)} placeholder="Nome da categoria" className="h-10 border border-gray-300 px-3 text-sm" /><button onClick={salvarCategoria} className="h-10 bg-viva-roxo px-4 text-sm font-black text-white">Criar</button></div><div className="divide-y divide-gray-100">{categorias.map(item => <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="font-bold">{item.nome}</p><p className="text-xs text-gray-400">{nomeTipo(item.tipo)}</p></div><div className="flex items-center gap-3"><button onClick={() => editarItem('financeiro_categorias', item.id, item.nome)} className="text-xs font-black text-viva-roxo hover:underline">Editar</button><button onClick={() => alternarAtivo('financeiro_categorias', item.id, item.ativo)} className={`h-7 w-12 p-1 transition ${item.ativo ? 'bg-emerald-500' : 'bg-gray-300'}`} aria-label={item.ativo ? 'Inativar categoria' : 'Ativar categoria'}><span className={`block h-5 w-5 bg-white transition ${item.ativo ? 'translate-x-5' : ''}`} /></button></div></div>)}</div></section>
          <section className="bg-white shadow-sm"><header className="border-b p-4"><h2 className="font-black">Centros de custo</h2><p className="text-xs text-gray-500">Estrutura preparada para novos centros.</p></header><div className="grid gap-2 border-b p-4 sm:grid-cols-[1fr_auto]"><input value={novoCentroNome} onChange={e => setNovoCentroNome(e.target.value)} placeholder="Nome do centro de custo" className="h-10 border border-gray-300 px-3 text-sm" /><button onClick={salvarCentro} className="h-10 bg-viva-roxo px-4 text-sm font-black text-white">Criar</button></div><div className="divide-y divide-gray-100">{centros.map(item => <div key={item.id} className="flex items-center justify-between px-4 py-3"><span className="font-bold">{item.nome}</span><div className="flex items-center gap-3"><button onClick={() => editarItem('financeiro_centros_custo', item.id, item.nome)} className="text-xs font-black text-viva-roxo hover:underline">Editar</button><button onClick={() => alternarAtivo('financeiro_centros_custo', item.id, item.ativo)} className={`h-7 w-12 p-1 transition ${item.ativo ? 'bg-emerald-500' : 'bg-gray-300'}`}><span className={`block h-5 w-5 bg-white transition ${item.ativo ? 'translate-x-5' : ''}`} /></button></div></div>)}</div></section>
        </div>}
      </main>

      {modalLancamento && <LancamentoFinanceiroModal categorias={categorias} centros={centros} fornecedores={fornecedores} onClose={() => setModalLancamento(false)} onSuccess={async mensagem => { setModalLancamento(false); toast(mensagem, 'sucesso'); await carregarDados(); }} />}
      {parcelaPagamento && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"><section className="w-full max-w-md bg-white p-5 shadow-2xl"><h2 className="text-lg font-black">Registrar pagamento</h2><p className="mt-1 text-sm text-gray-500">{parcelaPagamento.lancamento?.descricao} · {formatarMoeda(parcelaPagamento.valor)}</p><label className="mt-4 block text-xs font-black uppercase text-gray-500">Data efetiva<input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} className={`block w-full ${selectClass}`} /></label><label className="mt-3 block text-xs font-black uppercase text-gray-500">Forma de pagamento<select value={formaPagamento} onChange={e => setFormaPagamento(e.target.value as FormaPagamentoFinanceira)} className={`block w-full ${selectClass}`}>{FORMAS_PAGAMENTO_FINANCEIRO.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><div className="mt-5 flex justify-end gap-2"><button onClick={() => setParcelaPagamento(null)} className="h-10 border px-4 text-sm font-black">Cancelar</button><button disabled={salvandoPagamento} onClick={confirmarPagamento} className="h-10 bg-viva-verde px-4 text-sm font-black text-viva-roxo disabled:opacity-50">{salvandoPagamento ? 'Salvando...' : 'Confirmar pagamento'}</button></div></section></div>}
    </div>
  );
}
