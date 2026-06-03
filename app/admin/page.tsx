"use client";

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../supabase';
import { useRouter } from 'next/navigation';

const ADMIN_EMAILS = [
  'admin@vivaleve.com.br',
  'dono@vivaleve.com.br',
  'gerencia@vivaleve.com.br',
];

interface Pedido {
  id: string;
  cliente_id: string;
  endereco_entrega: string;
  valor_total: number;
  status: string;
  itens: ItemPedido[];
  created_at: string;
}

interface ItemPedido {
  id: number;
  nome: string;
  preco: number;
  quantidade: number;
  subtotal: number;
}

interface Produto {
  id: number;
  nome: string;
  descricao: string;
  preco: number;
  categoria: string;
  estoque: number;
  kcal: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  ativo: boolean;
  imagem_url: string;
}

interface Toast {
  id: number;
  texto: string;
  tipo: 'sucesso' | 'erro' | 'info';
}

interface Perfil {
  id: string;
  nome: string;
  telefone: string;
}

const STATUS_FLUXO = ['Pendente', 'Em Preparo', 'Em Rota', 'Concluído', 'Cancelado'];

const STATUS_CORES: Record<string, string> = {
  'Pendente':   'bg-gray-100 text-gray-600 border-gray-200',
  'Em Preparo': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'Em Rota':    'bg-blue-100 text-blue-700 border-blue-200',
  'Concluído':  'bg-green-100 text-green-700 border-green-200',
  'Cancelado':  'bg-red-100 text-red-600 border-red-200',
};

const STATUS_DOT: Record<string, string> = {
  'Pendente':   'bg-gray-400',
  'Em Preparo': 'bg-yellow-400',
  'Em Rota':    'bg-blue-500',
  'Concluído':  'bg-green-500',
  'Cancelado':  'bg-red-500',
};

let _toastId = 0;
const FORM_VAZIO = {
  nome: '', descricao: '', preco: 0, categoria: '',
  estoque: 0, kcal: 0, proteinas: 0, carboidratos: 0, gorduras: 0, imagem_url: '',
};

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed top-5 right-5 z-[200] space-y-2 w-72">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-xl text-sm font-semibold shadow-xl border ${
            t.tipo === 'sucesso' ? 'bg-green-500 text-white border-green-600' :
            t.tipo === 'erro'   ? 'bg-red-500 text-white border-red-600' :
                                  'bg-gray-800 text-white border-gray-700'
          }`}
        >
          {t.texto}
        </div>
      ))}
    </div>
  );
}

function ModalRecibo({
  pedido,
  perfil,
  onClose,
}: {
  pedido: Pedido;
  perfil?: Perfil;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl flex flex-col gap-0 overflow-hidden" style={{ width: 320 }}>
        <div className="p-5 space-y-4" id="recibo-print">
          <div className="text-center border-b-2 border-dashed border-gray-300 pb-4">
            <p className="text-2xl font-black tracking-tight text-gray-900">VIVA LEVE</p>
            <p className="text-xs text-gray-500">Saúde e Praticidade</p>
            <p className="text-xs text-gray-500 mt-1">{new Date(pedido.created_at).toLocaleString('pt-BR')}</p>
          </div>

          <div className="text-xs space-y-1 border-b border-dashed border-gray-300 pb-3">
            <p className="font-bold text-gray-500 uppercase tracking-wide text-[10px]">Pedido</p>
            <p className="font-mono font-bold text-gray-800">#{pedido.id.toString().slice(0, 12).toUpperCase()}</p>
            {perfil && (
              <>
                <p className="font-semibold text-gray-800">{perfil.nome}</p>
                <p className="text-gray-600">{perfil.telefone}</p>
              </>
            )}
            <p className="text-gray-600">{pedido.endereco_entrega}</p>
          </div>

          <div className="text-xs border-b border-dashed border-gray-300 pb-3 space-y-1.5">
            <p className="font-bold text-gray-500 uppercase tracking-wide text-[10px]">Itens</p>
            {(pedido.itens ?? []).map((item, i) => (
              <div key={i} className="flex justify-between text-gray-700">
                <span>{item.quantidade}x {item.nome}</span>
                <span className="font-semibold">R$ {(item.preco * item.quantidade).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center font-black text-base text-gray-900">
            <span>TOTAL</span>
            <span>R$ {Number(pedido.valor_total).toFixed(2)}</span>
          </div>

          <p className="text-center text-[10px] text-gray-400 border-t border-dashed border-gray-300 pt-3">
            Obrigado pela preferência!<br />Viva leve, viva bem.
          </p>
        </div>

        <div className="flex border-t border-gray-100">
          <button
            onClick={() => window.print()}
            className="flex-1 py-3 bg-gray-800 text-white font-bold text-sm hover:bg-gray-700 transition"
          >
            Imprimir
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold text-sm hover:bg-gray-200 transition"
          >
            Fechar
          </button>
        </div>
      </div>

      <style>{`
        @media print {
          body > * { display: none !important; }
          #recibo-print { display: block !important; }
        }
      `}</style>
    </div>
  );
}

function ModalProduto({
  editando,
  form,
  setForm,
  salvando,
  onSalvar,
  onFechar,
}: {
  editando: Produto | null;
  form: typeof FORM_VAZIO;
  setForm: (f: typeof FORM_VAZIO) => void;
  salvando: boolean;
  onSalvar: (e: React.FormEvent) => void;
  onFechar: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">
            {editando ? 'Editar Produto' : 'Novo Produto'}
          </h3>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">✕</button>
        </div>

        <form onSubmit={onSalvar} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-600 mb-1">Nome *</label>
              <input
                required
                type="text"
                value={form.nome}
                onChange={e => setForm({ ...form, nome: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Ex: Marmita Frango Grelhado"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-600 mb-1">Descrição</label>
              <textarea
                rows={2}
                value={form.descricao}
                onChange={e => setForm({ ...form, descricao: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                placeholder="Descrição do produto..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Categoria *</label>
              <input
                required
                type="text"
                value={form.categoria}
                onChange={e => setForm({ ...form, categoria: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Ex: Almoço"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Preço (R$) *</label>
              <input
                required
                type="number"
                min={0}
                step="0.01"
                value={form.preco}
                onChange={e => setForm({ ...form, preco: Number(e.target.value) })}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Estoque *</label>
              <input
                required
                type="number"
                min={0}
                value={form.estoque}
                onChange={e => setForm({ ...form, estoque: Number(e.target.value) })}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-600 mb-1">URL da Imagem</label>
              <input
                type="url"
                value={form.imagem_url}
                onChange={e => setForm({ ...form, imagem_url: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="https://images.pexels.com/..."
              />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Informações Nutricionais (por porção)</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Calorias (kcal)', key: 'kcal' as const },
                { label: 'Proteínas (g)', key: 'proteinas' as const },
                { label: 'Carboidratos (g)', key: 'carboidratos' as const },
                { label: 'Gorduras (g)', key: 'gorduras' as const },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-xs font-bold text-gray-600 mb-1">{label}</label>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={form[key]}
                    onChange={e => setForm({ ...form, [key]: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={salvando}
              className="flex-1 py-3 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-700 transition disabled:opacity-60"
            >
              {salvando ? 'Salvando...' : editando ? 'Salvar Alterações' : 'Criar Produto'}
            </button>
            <button
              type="button"
              onClick={onFechar}
              className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Admin() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [acesso, setAcesso] = useState(false);
  const [emailAdmin, setEmailAdmin] = useState('');
  const [aba, setAba] = useState<'pedidos' | 'produtos'>('pedidos');

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [perfisMap, setPerfisMap] = useState<Record<string, Perfil>>({});
  const [carregandoPedidos, setCarregandoPedidos] = useState(false);

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregandoProdutos, setCarregandoProdutos] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);

  const [pedidoRecibo, setPedidoRecibo] = useState<Pedido | null>(null);
  const [mostrarModalProduto, setMostrarModalProduto] = useState(false);
  const [editandoProduto, setEditandoProduto] = useState<Produto | null>(null);
  const [formProduto, setFormProduto] = useState<typeof FORM_VAZIO>({ ...FORM_VAZIO });
  const [salvandoProduto, setSalvandoProduto] = useState(false);

  const [filtroPedido, setFiltroPedido] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');

  const toast = useCallback((texto: string, tipo: Toast['tipo'] = 'info') => {
    const id = ++_toastId;
    setToasts(p => [...p, { id, texto, tipo }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4500);
  }, []);

  useEffect(() => {
    async function verificarAcesso() {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) { router.replace('/login'); return; }

      const emailNormalizado = (user.email ?? '').toLowerCase();
      if (!ADMIN_EMAILS.includes(emailNormalizado)) {
        router.replace('/');
        return;
      }

      setEmailAdmin(emailNormalizado);
      setAcesso(true);
      setLoading(false);
    }
    verificarAcesso();
  }, [router]);

  const carregarPedidos = useCallback(async () => {
    setCarregandoPedidos(true);
    try {
      const { data, error } = await supabase
        .from('pedidos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPedidos(data ?? []);

      const ids = Array.from(new Set((data ?? []).map((p: Pedido) => p.cliente_id)));
      if (ids.length > 0) {
        const { data: perfis } = await supabase
          .from('perfis')
          .select('id, nome, telefone')
          .in('id', ids);

        const mapa: Record<string, Perfil> = {};
        (perfis ?? []).forEach((p: Perfil) => { mapa[p.id] = p; });
        setPerfisMap(mapa);
      }
    } catch (err: any) {
      toast('Erro ao carregar pedidos: ' + err.message, 'erro');
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
        .order('categoria', { ascending: true });

      if (error) throw error;
      setProdutos(data ?? []);
    } catch (err: any) {
      toast('Erro ao carregar produtos: ' + err.message, 'erro');
    } finally {
      setCarregandoProdutos(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!acesso) return;
    carregarPedidos();
    carregarProdutos();
  }, [acesso, carregarPedidos, carregarProdutos]);

  const atualizarStatus = async (pedidoId: string, novoStatus: string) => {
    try {
      const { error } = await supabase
        .from('pedidos')
        .update({ status: novoStatus })
        .eq('id', pedidoId);

      if (error) throw error;

      setPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, status: novoStatus } : p));
      toast(`Status atualizado para "${novoStatus}"`, 'sucesso');
    } catch (err: any) {
      toast('Erro ao atualizar status: ' + err.message, 'erro');
    }
  };

  const abrirNovoProduto = () => {
    setEditandoProduto(null);
    setFormProduto({ ...FORM_VAZIO });
    setMostrarModalProduto(true);
  };

  const abrirEditarProduto = (produto: Produto) => {
    setEditandoProduto(produto);
    setFormProduto({
      nome: produto.nome,
      descricao: produto.descricao ?? '',
      preco: produto.preco,
      categoria: produto.categoria ?? '',
      estoque: produto.estoque ?? 0,
      kcal: produto.kcal ?? 0,
      proteinas: produto.proteinas ?? 0,
      carboidratos: produto.carboidratos ?? 0,
      gorduras: produto.gorduras ?? 0,
      imagem_url: produto.imagem_url ?? '',
    });
    setMostrarModalProduto(true);
  };

  const salvarProduto = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvandoProduto(true);

    try {
      const payload = {
        nome: formProduto.nome,
        descricao: formProduto.descricao,
        preco: formProduto.preco,
        categoria: formProduto.categoria,
        estoque: formProduto.estoque,
        kcal: formProduto.kcal,
        proteinas: formProduto.proteinas,
        carboidratos: formProduto.carboidratos,
        gorduras: formProduto.gorduras,
        imagem_url: formProduto.imagem_url || null,
      };

      if (editandoProduto) {
        const { error } = await supabase.from('produtos').update(payload).eq('id', editandoProduto.id);
        if (error) throw error;
        toast('Produto atualizado com sucesso!', 'sucesso');
      } else {
        const { error } = await supabase.from('produtos').insert([{ ...payload, ativo: true }]);
        if (error) throw error;
        toast('Produto criado com sucesso!', 'sucesso');
      }

      setMostrarModalProduto(false);
      await carregarProdutos();
    } catch (err: any) {
      toast('Erro ao salvar produto: ' + err.message, 'erro');
    } finally {
      setSalvandoProduto(false);
    }
  };

  const toggleAtivo = async (produto: Produto) => {
    try {
      const { error } = await supabase.from('produtos').update({ ativo: !produto.ativo }).eq('id', produto.id);
      if (error) throw error;
      setProdutos(prev => prev.map(p => p.id === produto.id ? { ...p, ativo: !p.ativo } : p));
      toast(`Produto ${!produto.ativo ? 'ativado' : 'inativado'}!`, !produto.ativo ? 'sucesso' : 'info');
    } catch (err: any) {
      toast('Erro: ' + err.message, 'erro');
    }
  };

  const pedidosFiltrados = pedidos.filter(p => {
    const matchStatus = !filtroStatus || p.status === filtroStatus;
    const matchBusca = !filtroPedido ||
      p.id.toString().toLowerCase().includes(filtroPedido.toLowerCase()) ||
      (perfisMap[p.cliente_id]?.nome ?? '').toLowerCase().includes(filtroPedido.toLowerCase());
    return matchStatus && matchBusca;
  });

  const hoje = new Date().toDateString();
  const pedidosHoje = pedidos.filter(p => new Date(p.created_at).toDateString() === hoje);
  const receitaHoje = pedidosHoje.filter(p => p.status === 'Concluído').reduce((a, p) => a + Number(p.valor_total), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-gray-700 rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">Verificando acesso...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <ToastStack toasts={toasts} />

      <header className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black text-gray-800">VIVA LEVE</h1>
            <p className="text-xs text-gray-500 mt-0.5">Painel Administrativo · {emailAdmin}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { carregarPedidos(); carregarProdutos(); }}
              className="px-3 py-2 text-xs font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              ↻ Atualizar
            </button>
            <button
              onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login'; }}
              className="px-3 py-2 text-xs font-bold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 space-y-6">

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Pedidos Hoje', valor: pedidosHoje.length, cor: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Pendentes', valor: pedidos.filter(p => p.status === 'Pendente').length, cor: 'text-yellow-600', bg: 'bg-yellow-50' },
            { label: 'Em Rota', valor: pedidos.filter(p => p.status === 'Em Rota').length, cor: 'text-blue-700', bg: 'bg-blue-50' },
            { label: 'Receita Hoje', valor: `R$ ${receitaHoje.toFixed(2)}`, cor: 'text-green-700', bg: 'bg-green-50' },
          ].map(kpi => (
            <div key={kpi.label} className={`${kpi.bg} rounded-2xl p-4 border border-white shadow-sm`}>
              <p className="text-xs text-gray-500 font-medium">{kpi.label}</p>
              <p className={`text-2xl font-black mt-1 ${kpi.cor}`}>{kpi.valor}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-200 w-fit">
          {(['pedidos', 'produtos'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setAba(tab)}
              className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${
                aba === tab
                  ? 'bg-gray-800 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab === 'pedidos' ? `Fila de Pedidos (${pedidos.length})` : `Cardápio (${produtos.length})`}
            </button>
          ))}
        </div>

        {aba === 'pedidos' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex flex-wrap gap-3">
              <input
                type="text"
                value={filtroPedido}
                onChange={e => setFiltroPedido(e.target.value)}
                placeholder="Buscar por ID ou cliente..."
                className="flex-1 min-w-48 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
              <select
                value={filtroStatus}
                onChange={e => setFiltroStatus(e.target.value)}
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                <option value="">Todos os status</option>
                {STATUS_FLUXO.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={carregarPedidos} className="px-4 py-2 bg-gray-800 text-white text-sm font-bold rounded-lg hover:bg-gray-700 transition">
                Atualizar
              </button>
            </div>

            {carregandoPedidos ? (
              <div className="bg-white rounded-xl p-10 text-center text-gray-500 animate-pulse shadow-sm border border-gray-200">
                Carregando pedidos...
              </div>
            ) : pedidosFiltrados.length === 0 ? (
              <div className="bg-white rounded-xl p-10 text-center text-gray-400 shadow-sm border border-gray-200">
                Nenhum pedido encontrado.
              </div>
            ) : (
              <div className="space-y-3">
                {pedidosFiltrados.map(pedido => {
                  const perfil = perfisMap[pedido.cliente_id];
                  return (
                    <div key={pedido.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                      <div className={`h-1 ${STATUS_DOT[pedido.status] ?? 'bg-gray-300'}`} />

                      <div className="p-5">
                        <div className="flex flex-wrap justify-between gap-4">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-gray-500">
                                #{pedido.id.toString().slice(0, 8).toUpperCase()}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${STATUS_CORES[pedido.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                {pedido.status}
                              </span>
                            </div>
                            <p className="font-semibold text-gray-800 text-sm">{perfil?.nome ?? 'Cliente'}</p>
                            <p className="text-xs text-gray-500">{perfil?.telefone}</p>
                            <p className="text-xs text-gray-600 truncate max-w-xs">{pedido.endereco_entrega}</p>
                            <p className="text-xs text-gray-400">{new Date(pedido.created_at).toLocaleString('pt-BR')}</p>
                          </div>

                          <div className="flex flex-col items-end justify-between gap-3">
                            <p className="text-2xl font-black text-gray-800">R$ {Number(pedido.valor_total).toFixed(2)}</p>
                            <button
                              onClick={() => setPedidoRecibo(pedido)}
                              className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                            >
                              Recibo
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {(pedido.itens ?? []).map((item, i) => (
                              <span key={i} className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-gray-700">
                                {item.quantidade}× {item.nome}
                              </span>
                            ))}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {STATUS_FLUXO.map(s => (
                              <button
                                key={s}
                                onClick={() => atualizarStatus(pedido.id, s)}
                                disabled={pedido.status === s}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition ${
                                  pedido.status === s
                                    ? `${STATUS_CORES[s]} cursor-default`
                                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700'
                                }`}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {aba === 'produtos' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                onClick={abrirNovoProduto}
                className="px-5 py-2.5 bg-gray-800 text-white font-bold text-sm rounded-xl hover:bg-gray-700 transition shadow-sm"
              >
                + Novo Produto
              </button>
            </div>

            {carregandoProdutos ? (
              <div className="bg-white rounded-xl p-10 text-center text-gray-500 animate-pulse shadow-sm border border-gray-200">
                Carregando produtos...
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Produto</th>
                      <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Categoria</th>
                      <th className="px-4 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Preço</th>
                      <th className="px-4 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Estoque</th>
                      <th className="px-4 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {produtos.map(produto => (
                      <tr key={produto.id} className={`hover:bg-gray-50 transition ${!produto.ativo ? 'opacity-50' : ''}`}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            {produto.imagem_url ? (
                              <img src={produto.imagem_url} alt={produto.nome} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-lg flex-shrink-0">🥗</div>
                            )}
                            <div>
                              <p className="font-semibold text-gray-800">{produto.nome}</p>
                              <p className="text-xs text-gray-400 line-clamp-1">{produto.descricao}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-gray-600 hidden md:table-cell">
                          <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs font-medium">{produto.categoria}</span>
                        </td>
                        <td className="px-4 py-4 text-right font-bold text-gray-800">
                          R$ {Number(produto.preco).toFixed(2)}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            produto.estoque === 0 ? 'bg-red-100 text-red-600' :
                            produto.estoque <= 3 ? 'bg-orange-100 text-orange-600' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {produto.estoque}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <button
                            onClick={() => toggleAtivo(produto)}
                            className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors ${produto.ativo ? 'bg-green-400' : 'bg-gray-300'}`}
                          >
                            <span className={`inline-block w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${produto.ativo ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                          </button>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <button
                            onClick={() => abrirEditarProduto(produto)}
                            className="px-3 py-1.5 bg-gray-800 text-white text-xs font-bold rounded-lg hover:bg-gray-700 transition"
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {produtos.length === 0 && (
                  <div className="p-10 text-center text-gray-400">
                    Nenhum produto cadastrado. Clique em &quot;Novo Produto&quot; para começar.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {pedidoRecibo && (
        <ModalRecibo
          pedido={pedidoRecibo}
          perfil={perfisMap[pedidoRecibo.cliente_id]}
          onClose={() => setPedidoRecibo(null)}
        />
      )}

      {mostrarModalProduto && (
        <ModalProduto
          editando={editandoProduto}
          form={formProduto}
          setForm={setFormProduto}
          salvando={salvandoProduto}
          onSalvar={salvarProduto}
          onFechar={() => { setMostrarModalProduto(false); setEditandoProduto(null); }}
        />
      )}
    </div>
  );
}
