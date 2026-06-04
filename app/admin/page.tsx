"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';

type AbaAdmin = 'pedidos' | 'produtos';
type ToastTipo = 'sucesso' | 'erro' | 'info';

interface ItemPedido {
  id?: number;
  nome: string;
  preco: number;
  quantidade: number;
  subtotal?: number;
}

interface Pedido {
  id: number | string;
  cliente_id: string;
  endereco_entrega: string;
  endereco?: string;
  valor_total: number;
  total?: number;
  status: string;
  itens: ItemPedido[];
  criado_em?: string;
  created_at?: string;
}

interface PerfilCliente {
  id: string;
  nome?: string;
  telefone?: string;
  nome_completo?: string;
  full_name?: string;
  email?: string;
  [key: string]: unknown;
}

interface Produto {
  id: number;
  nome: string;
  descricao: string | null;
  preco: number;
  categoria: string;
  imagem_url: string | null;
  estoque: number;
  kcal: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  ativo: boolean;
}

interface ProdutoForm {
  nome: string;
  descricao: string;
  preco: string;
  categoria: string;
  imagem_url: string;
  estoque: string;
  kcal: string;
  proteinas: string;
  carboidratos: string;
  gorduras: string;
}

const STATUS_FLUXO = ['Pendente', 'Aguardando Pagamento', 'Recebido', 'Em Preparo', 'Saiu para Entrega', 'Entregue'];
const CATEGORIAS = ['Marmitas', 'Lanches Rápidos', 'Proteínas', 'Suplementos', 'Naturais', 'Moda Fitness', 'Sua Dieta'];

const FORM_VAZIO: ProdutoForm = {
  nome: '',
  descricao: '',
  preco: '',
  categoria: 'Marmitas',
  imagem_url: '',
  estoque: '',
  kcal: '',
  proteinas: '',
  carboidratos: '',
  gorduras: '',
};

let toastId = 0;

function parseNumeroBR(valor: string | number) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  const normalizado = valor
    .trim()
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : 0;
}

function formatarNumeroBR(valor: number | string, casas = 2) {
  return parseNumeroBR(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

function formatarMoedaBR(valor: number | string) {
  return parseNumeroBR(valor).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function valorInputBR(valor: number | string, casas = 2) {
  const numero = parseNumeroBR(valor);
  return numero ? formatarNumeroBR(numero, casas) : '';
}

function exigirLinhaAtualizada<T>(data: T | null, acao: string) {
  if (!data) {
    throw new Error(`${acao} não foi gravada. O Supabase não retornou linha alterada; verifique se seu e-mail está cadastrado como administrador nas policies RLS.`);
  }
  return data;
}

function dataPedido(pedido: Pedido) {
  return pedido.criado_em ?? pedido.created_at ?? '';
}

function totalPedido(pedido: Pedido) {
  return Number(pedido.valor_total ?? pedido.total ?? 0);
}

function enderecoPedido(pedido: Pedido) {
  return pedido.endereco_entrega || pedido.endereco || 'Endereço não informado';
}

function idPerfil(perfil: PerfilCliente) {
  return String(perfil.id ?? perfil.cliente_id ?? perfil.user_id ?? '');
}

function nomePerfil(perfil?: PerfilCliente) {
  if (!perfil) return 'Cliente não identificado';
  return String(perfil.nome_completo || perfil.nome || perfil.full_name || perfil.email || 'Cliente não identificado');
}

function statusClasse(status: string) {
  const mapa: Record<string, string> = {
    'Pendente': 'bg-gray-100 text-gray-700 border-gray-200',
    'Aguardando Pagamento': 'bg-orange-100 text-orange-700 border-orange-200',
    'Recebido': 'bg-blue-100 text-blue-700 border-blue-200',
    'Em Preparo': 'bg-yellow-100 text-yellow-700 border-yellow-200',
    'Saiu para Entrega': 'bg-purple-100 text-purple-700 border-purple-200',
    'Entregue': 'bg-green-100 text-green-700 border-green-200',
    'Pagamento Recusado': 'bg-red-100 text-red-700 border-red-200',
  };
  return mapa[status] ?? 'bg-gray-100 text-gray-700 border-gray-200';
}

function ToastStack({ toasts }: { toasts: Array<{ id: number; texto: string; tipo: ToastTipo }> }) {
  return (
    <div className="fixed right-4 top-4 z-[200] w-80 max-w-[calc(100vw-2rem)] space-y-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`rounded-xl border px-4 py-3 text-sm font-semibold shadow-xl ${
            toast.tipo === 'sucesso' ? 'border-green-200 bg-green-100 text-green-800' :
            toast.tipo === 'erro' ? 'border-red-200 bg-red-100 text-red-800' :
            'border-blue-200 bg-blue-100 text-blue-800'
          }`}
        >
          {toast.texto}
        </div>
      ))}
    </div>
  );
}

function ModalProduto({
  form,
  editando,
  salvando,
  onClose,
  onSubmit,
  onChange,
}: {
  form: ProdutoForm;
  editando: Produto | null;
  salvando: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onChange: (form: ProdutoForm) => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-gray-900">{editando ? 'Editar produto' : 'Novo produto'}</h2>
            <p className="text-xs text-gray-500">Dados gravados diretamente no Supabase.</p>
          </div>
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" type="button">×</button>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Nome</span>
              <input required value={form.nome} onChange={e => onChange({ ...form, nome: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-800" />
            </label>

            <label className="md:col-span-2">
              <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Descrição</span>
              <textarea value={form.descricao} onChange={e => onChange({ ...form, descricao: e.target.value })} rows={3} className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-800" />
            </label>

            <label>
              <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Categoria</span>
              <select value={form.categoria} onChange={e => onChange({ ...form, categoria: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-800">
                {CATEGORIAS.map(categoria => <option key={categoria} value={categoria}>{categoria}</option>)}
              </select>
            </label>

            <label>
              <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Preço</span>
              <input required type="text" inputMode="decimal" value={form.preco} onChange={e => onChange({ ...form, preco: e.target.value })} onBlur={e => onChange({ ...form, preco: valorInputBR(e.target.value, 2) })} placeholder="0,00" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-800" />
            </label>

            <label>
              <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Estoque</span>
              <input type="text" inputMode="numeric" value={form.estoque} onChange={e => onChange({ ...form, estoque: e.target.value.replace(/\D/g, '') })} placeholder="0" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-800" />
            </label>

            <label>
              <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Imagem URL</span>
              <input type="url" value={form.imagem_url} onChange={e => onChange({ ...form, imagem_url: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-800" />
            </label>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="mb-3 text-xs font-bold uppercase text-gray-500">Macros por 100g</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ['kcal', 'Kcal'],
                ['proteinas', 'Proteínas'],
                ['carboidratos', 'Carbos'],
                ['gorduras', 'Gorduras'],
              ].map(([key, label]) => (
                <label key={key}>
                  <span className="mb-1 block text-xs font-semibold text-gray-500">{label}</span>
                  <input type="text" inputMode="decimal" value={form[key as keyof ProdutoForm] as string} onChange={e => onChange({ ...form, [key]: e.target.value })} onBlur={e => onChange({ ...form, [key]: valorInputBR(e.target.value, key === 'kcal' ? 0 : 1) })} placeholder={key === 'kcal' ? '0' : '0,0'} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-800" />
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button disabled={salvando} className="flex-1 rounded-xl bg-gray-900 px-4 py-3 text-sm font-bold text-white hover:bg-gray-800 disabled:opacity-60">
              {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Cadastrar produto'}
            </button>
            <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-gray-100 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-200">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [usuarioEmail, setUsuarioEmail] = useState('');
  const [aba, setAba] = useState<AbaAdmin>('pedidos');
  const [toasts, setToasts] = useState<Array<{ id: number; texto: string; tipo: ToastTipo }>>([]);

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [perfis, setPerfis] = useState<Record<string, PerfilCliente>>({});
  const [carregandoPedidos, setCarregandoPedidos] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('');

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregandoProdutos, setCarregandoProdutos] = useState(false);
  const [modalProdutoAberto, setModalProdutoAberto] = useState(false);
  const [produtoEditando, setProdutoEditando] = useState<Produto | null>(null);
  const [formProduto, setFormProduto] = useState<ProdutoForm>({ ...FORM_VAZIO });
  const [salvandoProduto, setSalvandoProduto] = useState(false);

  const toast = useCallback((texto: string, tipo: ToastTipo = 'info') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, texto, tipo }]);
    window.setTimeout(() => setToasts(prev => prev.filter(item => item.id !== id)), 5000);
  }, []);

  const carregarPedidos = useCallback(async () => {
    setCarregandoPedidos(true);
    try {
      const { data, error } = await supabase
        .from('pedidos')
        .select('*')
        .order('criado_em', { ascending: false });

      if (error) throw error;
      const lista = (data ?? []) as Pedido[];
      setPedidos(lista);

      const ids = Array.from(new Set(lista.map(pedido => pedido.cliente_id).filter(Boolean)));
      if (ids.length > 0) {
        const [perfisRes, clientesRes] = await Promise.all([
          supabase.from('perfis').select('*').in('id', ids),
          supabase.from('perfis_clientes').select('*').in('id', ids),
        ]);

        const mapa: Record<string, PerfilCliente> = {};
        if (perfisRes.error) {
          toast(`Erro ao buscar perfis: ${perfisRes.error.message}`, 'erro');
        } else {
          (perfisRes.data ?? []).forEach((perfil: PerfilCliente) => {
            const id = idPerfil(perfil);
            if (id) mapa[id] = { ...mapa[id], ...perfil };
          });
        }
        if (clientesRes.error) {
          toast(`Erro ao buscar perfis_clientes: ${clientesRes.error.message}`, 'erro');
        } else {
          (clientesRes.data ?? []).forEach((perfil: PerfilCliente) => {
            const id = idPerfil(perfil);
            if (id) mapa[id] = { ...mapa[id], ...perfil };
          });
        }
        setPerfis(mapa);
      } else {
        setPerfis({});
      }
    } catch (err: any) {
      toast(`Erro ao carregar pedidos: ${err.message}`, 'erro');
    } finally {
      setCarregandoPedidos(false);
    }
  }, [toast]);

  const carregarProdutos = useCallback(async () => {
    setCarregandoProdutos(true);
    try {
      const { data, error } = await supabase
        .from('produtos')
        .select('*')
        .order('categoria', { ascending: true })
        .order('nome', { ascending: true });

      if (error) throw error;
      setProdutos((data ?? []) as Produto[]);
    } catch (err: any) {
      toast(`Erro ao carregar produtos: ${err.message}`, 'erro');
    } finally {
      setCarregandoProdutos(false);
    }
  }, [toast]);

  useEffect(() => {
    async function protegerRota() {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        router.replace('/login');
        return;
      }
      setUsuarioEmail(user.email ?? '');
      setLoading(false);
    }
    protegerRota();
  }, [router]);

  useEffect(() => {
    if (loading) return;
    carregarPedidos();
    carregarProdutos();
  }, [loading, carregarPedidos, carregarProdutos]);

  useEffect(() => {
    if (loading) return;
    let ativo = true;
    const channel = supabase
      .channel(`admin-pedidos-realtime-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        if (ativo) carregarPedidos();
      })
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(channel);
    };
  }, [loading, carregarPedidos]);

  const pedidosFiltrados = useMemo(() => {
    return filtroStatus ? pedidos.filter(pedido => pedido.status === filtroStatus) : pedidos;
  }, [filtroStatus, pedidos]);

  const resumo = useMemo(() => ({
    pendentes: pedidos.filter(p => ['Pendente', 'Aguardando Pagamento'].includes(p.status)).length,
    preparo: pedidos.filter(p => p.status === 'Em Preparo').length,
    entrega: pedidos.filter(p => p.status === 'Saiu para Entrega').length,
    receita: pedidos.filter(p => p.status === 'Entregue').reduce((acc, pedido) => acc + totalPedido(pedido), 0),
  }), [pedidos]);

  const atualizarStatus = async (pedido: Pedido, status: string) => {
    try {
      const { data, error } = await supabase
        .from('pedidos')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', pedido.id)
        .select('id,status')
        .maybeSingle();
      if (error) throw error;
      const pedidoAtualizado = exigirLinhaAtualizada(data, 'A alteração de status');
      setPedidos(prev => prev.map(item => item.id === pedido.id ? { ...item, status: pedidoAtualizado.status } : item));
      toast(`Pedido #${pedido.id} atualizado para ${status}.`, 'sucesso');
    } catch (err: any) {
      toast(`Erro ao atualizar status: ${err.message}`, 'erro');
      await carregarPedidos();
    }
  };

  const abrirNovoProduto = () => {
    setProdutoEditando(null);
    setFormProduto({ ...FORM_VAZIO });
    setModalProdutoAberto(true);
  };

  const abrirEditarProduto = (produto: Produto) => {
    setProdutoEditando(produto);
    setFormProduto({
      nome: produto.nome ?? '',
      descricao: produto.descricao ?? '',
      preco: valorInputBR(produto.preco ?? 0, 2),
      categoria: produto.categoria || 'Marmitas',
      imagem_url: produto.imagem_url ?? '',
      estoque: String(Number(produto.estoque ?? 0)),
      kcal: valorInputBR(produto.kcal ?? 0, 0),
      proteinas: valorInputBR(produto.proteinas ?? 0, 1),
      carboidratos: valorInputBR(produto.carboidratos ?? 0, 1),
      gorduras: valorInputBR(produto.gorduras ?? 0, 1),
    });
    setModalProdutoAberto(true);
  };

  const salvarProduto = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvandoProduto(true);

    const payload = {
      nome: formProduto.nome.trim(),
      descricao: formProduto.descricao.trim(),
      preco: parseNumeroBR(formProduto.preco),
      categoria: formProduto.categoria,
      imagem_url: formProduto.imagem_url.trim() || null,
      estoque: Math.round(parseNumeroBR(formProduto.estoque)),
      kcal: parseNumeroBR(formProduto.kcal),
      proteinas: parseNumeroBR(formProduto.proteinas),
      carboidratos: parseNumeroBR(formProduto.carboidratos),
      gorduras: parseNumeroBR(formProduto.gorduras),
    };

    try {
      if (produtoEditando) {
        const { data, error } = await supabase
          .from('produtos')
          .update(payload)
          .eq('id', produtoEditando.id)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        exigirLinhaAtualizada(data, 'A alteração do produto');
        toast('Produto atualizado com sucesso.', 'sucesso');
      } else {
        const { data, error } = await supabase
          .from('produtos')
          .insert([{ ...payload, ativo: true }])
          .select('id')
          .maybeSingle();
        if (error) throw error;
        exigirLinhaAtualizada(data, 'O cadastro do produto');
        toast('Produto cadastrado com sucesso.', 'sucesso');
      }
      setModalProdutoAberto(false);
      await carregarProdutos();
    } catch (err: any) {
      toast(`Erro ao salvar produto: ${err.message}`, 'erro');
    } finally {
      setSalvandoProduto(false);
    }
  };

  const alternarAtivo = async (produto: Produto) => {
    try {
      const novoValor = !produto.ativo;
      const { data, error } = await supabase
        .from('produtos')
        .update({ ativo: novoValor })
        .eq('id', produto.id)
        .select('id,ativo')
        .maybeSingle();
      if (error) throw error;
      const produtoAtualizado = exigirLinhaAtualizada(data, 'A alteração de status do produto');
      setProdutos(prev => prev.map(item => item.id === produto.id ? { ...item, ativo: produtoAtualizado.ativo } : item));
      toast(`Produto ${produtoAtualizado.ativo ? 'ativado' : 'inativado'} com sucesso.`, 'sucesso');
    } catch (err: any) {
      toast(`Erro ao alterar produto: ${err.message}`, 'erro');
      await carregarProdutos();
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <ToastStack toasts={toasts} />

      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-gray-200 bg-white lg:w-72 lg:border-b-0 lg:border-r">
          <div className="p-5">
            <p className="text-2xl font-black tracking-tight">VIVA LEVE</p>
            <p className="mt-1 text-xs text-gray-500">{usuarioEmail}</p>
          </div>
          <nav className="flex gap-2 overflow-x-auto px-4 pb-4 lg:flex-col">
            {[
              { id: 'pedidos' as const, label: 'Gestão de Pedidos', desc: `${pedidos.length} pedidos` },
              { id: 'produtos' as const, label: 'Cardápio/Estoque', desc: `${produtos.length} produtos` },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setAba(item.id)}
                className={`min-w-48 rounded-xl px-4 py-3 text-left transition lg:min-w-0 ${
                  aba === item.id ? 'bg-gray-900 text-white shadow-lg' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="block text-sm font-black">{item.label}</span>
                <span className={`mt-1 block text-xs ${aba === item.id ? 'text-gray-300' : 'text-gray-400'}`}>{item.desc}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-4 md:p-6">
          <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-black">{aba === 'pedidos' ? 'Gestão de Pedidos' : 'Cardápio e Estoque'}</h1>
              <p className="text-sm text-gray-500">Dados ao vivo do Supabase oficial.</p>
            </div>
            <button onClick={() => { carregarPedidos(); carregarProdutos(); }} className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50">
              Atualizar dados
            </button>
          </header>

          {aba === 'pedidos' && (
            <section className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Pendentes', resumo.pendentes, 'bg-orange-50 text-orange-700'],
                  ['Em preparo', resumo.preparo, 'bg-yellow-50 text-yellow-700'],
                  ['Em entrega', resumo.entrega, 'bg-purple-50 text-purple-700'],
                  ['Receita entregue', formatarMoedaBR(resumo.receita), 'bg-green-50 text-green-700'],
                ].map(([label, value, classe]) => (
                  <div key={label} className={`rounded-xl border border-white p-4 shadow-sm ${classe}`}>
                    <p className="text-xs font-bold uppercase opacity-70">{label}</p>
                    <p className="mt-1 text-2xl font-black">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-gray-900">
                    <option value="">Todos os status</option>
                    {STATUS_FLUXO.map(status => <option key={status} value={status}>{status}</option>)}
                  </select>
                  {carregandoPedidos && <span className="text-xs font-semibold text-gray-400">Carregando pedidos...</span>}
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {pedidosFiltrados.map(pedido => {
                  const perfil = perfis[pedido.cliente_id];
                  const nomeCliente = nomePerfil(perfil);

                  return (
                    <article key={pedido.id} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                      <div className="border-b border-gray-100 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-mono text-xs font-bold text-gray-400">#{String(pedido.id).slice(0, 10).toUpperCase()}</p>
                            <h2 className="mt-1 text-lg font-black">{nomeCliente}</h2>
                            <p className="text-xs text-gray-500">{perfil?.telefone || 'Telefone não informado'}</p>
                          </div>
                          <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClasse(pedido.status)}`}>
                            {pedido.status}
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-gray-600">{enderecoPedido(pedido)}</p>
                        <p className="mt-1 text-xs text-gray-400">{dataPedido(pedido) ? new Date(dataPedido(pedido)).toLocaleString('pt-BR') : 'Data não informada'}</p>
                      </div>

                      <div className="space-y-2 p-4">
                        {(pedido.itens ?? []).map((item, index) => (
                          <div key={`${item.nome}-${index}`} className="flex justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                            <span className="font-semibold text-gray-700">{item.quantidade}x {item.nome}</span>
                            <span className="font-bold text-gray-900">{formatarMoedaBR(item.subtotal ?? item.preco * item.quantidade)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between pt-2 text-lg font-black">
                          <span>Total</span>
                          <span>{formatarMoedaBR(totalPedido(pedido))}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 border-t border-gray-100 p-4">
                        {STATUS_FLUXO.map(status => (
                          <button
                            key={status}
                            onClick={() => atualizarStatus(pedido, status)}
                            disabled={pedido.status === status}
                            className={`rounded-lg border px-3 py-2 text-xs font-black transition ${
                              pedido.status === status ? `${statusClasse(status)} cursor-default` : 'border-gray-200 bg-white text-gray-600 hover:border-gray-900 hover:text-gray-900'
                            }`}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>

              {!carregandoPedidos && pedidosFiltrados.length === 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-400">Nenhum pedido encontrado.</div>
              )}
            </section>
          )}

          {aba === 'produtos' && (
            <section className="space-y-5">
              <div className="flex justify-end">
                <button onClick={abrirNovoProduto} className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-black text-white shadow-lg hover:bg-gray-800">
                  Novo produto
                </button>
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-black">Nome</th>
                        <th className="px-4 py-3 text-left font-black">Categoria</th>
                        <th className="px-4 py-3 text-right font-black">Preço</th>
                        <th className="px-4 py-3 text-center font-black">Estoque</th>
                        <th className="px-4 py-3 text-center font-black">Status</th>
                        <th className="px-4 py-3 text-right font-black">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {produtos.map(produto => (
                        <tr key={produto.id} className={!produto.ativo ? 'bg-gray-50 opacity-70' : ''}>
                          <td className="px-4 py-4">
                            <p className="font-black text-gray-900">{produto.nome}</p>
                            <p className="max-w-sm truncate text-xs text-gray-500">{produto.descricao}</p>
                          </td>
                          <td className="px-4 py-4">
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">{produto.categoria}</span>
                          </td>
                          <td className="px-4 py-4 text-right font-black">{formatarMoedaBR(produto.preco)}</td>
                          <td className="px-4 py-4 text-center">
                            <span className={`rounded-full px-3 py-1 text-xs font-black ${produto.estoque <= 0 ? 'bg-red-100 text-red-700' : produto.estoque <= 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                              {produto.estoque}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <button onClick={() => alternarAtivo(produto)} className={`inline-flex h-6 w-11 items-center rounded-full p-1 transition ${produto.ativo ? 'bg-green-500' : 'bg-gray-300'}`} aria-label={produto.ativo ? 'Inativar produto' : 'Ativar produto'}>
                              <span className={`h-4 w-4 rounded-full bg-white shadow transition ${produto.ativo ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <button onClick={() => abrirEditarProduto(produto)} className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-black text-white hover:bg-gray-800">
                              Editar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {carregandoProdutos && <div className="p-8 text-center text-gray-400">Carregando produtos...</div>}
                {!carregandoProdutos && produtos.length === 0 && <div className="p-8 text-center text-gray-400">Nenhum produto cadastrado.</div>}
              </div>
            </section>
          )}
        </main>
      </div>

      {modalProdutoAberto && (
        <ModalProduto
          form={formProduto}
          editando={produtoEditando}
          salvando={salvandoProduto}
          onClose={() => setModalProdutoAberto(false)}
          onSubmit={salvarProduto}
          onChange={setFormProduto}
        />
      )}
    </div>
  );
}
