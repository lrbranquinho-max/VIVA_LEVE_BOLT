"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../supabase';

type AbaAdmin = 'pedidos' | 'balcao' | 'produtos' | 'config';
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
  cliente_id?: string | null;
  endereco_entrega?: string | null;
  endereco?: string;
  valor_total: number;
  total?: number;
  status: string;
  itens: ItemPedido[];
  criado_em?: string;
  created_at?: string;
  tipo_venda?: 'online' | 'balcao';
  cliente_nome_balcao?: string | null;
  cliente_telefone_balcao?: string | null;
  observacoes_balcao?: string | null;
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
  porcao_g?: number | null;
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
  porcao_kg: string;
  kcal: string;
  proteinas: string;
  carboidratos: string;
  gorduras: string;
}

interface VendaBalcaoForm {
  cliente_nome: string;
  cliente_telefone: string;
  endereco_entrega: string;
  taxa_entrega: string;
  desconto_percentual: string;
  observacoes: string;
}

interface LojaConfigForm {
  cupom_boas_vindas_percentual: string;
  taxa_entrega_padrao: string;
  cupom_dia_d_percentual: string;
  cupom_dia_d_ativo: boolean;
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
  porcao_kg: '',
  kcal: '',
  proteinas: '',
  carboidratos: '',
  gorduras: '',
};

const FORM_BALCAO_VAZIO: VendaBalcaoForm = {
  cliente_nome: '',
  cliente_telefone: '',
  endereco_entrega: '',
  taxa_entrega: '',
  desconto_percentual: '',
  observacoes: '',
};

const LOJA_CONFIG_FORM_PADRAO: LojaConfigForm = {
  cupom_boas_vindas_percentual: '30,00',
  taxa_entrega_padrao: '10,00',
  cupom_dia_d_percentual: '0,00',
  cupom_dia_d_ativo: false,
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

function percentualLimitado(valor: string | number) {
  return Math.min(100, Math.max(0, parseNumeroBR(valor)));
}

function configParaForm(valor: unknown): LojaConfigForm {
  const bruto = (valor && typeof valor === 'object' ? valor : {}) as Record<string, unknown>;
  const boasVindas = Number(bruto.cupom_boas_vindas_percentual ?? 30);
  const taxaEntrega = Number(bruto.taxa_entrega_padrao ?? 10);
  const diaD = Number(bruto.cupom_dia_d_percentual ?? 0);

  return {
    cupom_boas_vindas_percentual: formatarNumeroBR(Math.min(100, Math.max(0, Number.isFinite(boasVindas) ? boasVindas : 30)), 2),
    taxa_entrega_padrao: formatarNumeroBR(Math.max(0, Number.isFinite(taxaEntrega) ? taxaEntrega : 10), 2),
    cupom_dia_d_percentual: formatarNumeroBR(Math.min(100, Math.max(0, Number.isFinite(diaD) ? diaD : 0)), 2),
    cupom_dia_d_ativo: Boolean(bruto.cupom_dia_d_ativo),
  };
}

function formatarPorcaoKg(porcaoG?: number | null) {
  const gramas = Number(porcaoG || 0);
  return gramas > 0 ? `${formatarNumeroBR(gramas / 1000, 3)} kg` : '-';
}

function formatarGramas(porcaoG?: number | null) {
  const gramas = Number(porcaoG || 0);
  return gramas > 0 ? `${formatarNumeroBR(gramas, 0)} g` : '-';
}

function escaparHtml(valor: string | number | null | undefined) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
  return pedido.endereco_entrega || pedido.endereco || 'Retirada no balcão';
}

function telefoneWhatsApp(telefone?: string) {
  const digitos = String(telefone ?? '').replace(/\D/g, '');
  if (!digitos) return '';
  return digitos.startsWith('55') ? digitos : `55${digitos}`;
}

function normalizarBusca(valor: string | null | undefined) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function idPerfil(perfil: PerfilCliente) {
  return String(perfil.id ?? perfil.cliente_id ?? perfil.user_id ?? '');
}

function nomePerfil(perfil?: PerfilCliente) {
  if (!perfil) return 'Cliente não identificado';
  return String(perfil.nome_completo || perfil.nome || perfil.full_name || perfil.email || 'Cliente não identificado');
}

function nomeClientePedido(pedido: Pedido, perfil?: PerfilCliente) {
  if (pedido.tipo_venda === 'balcao') {
    return pedido.cliente_nome_balcao || 'Venda balcão';
  }
  return nomePerfil(perfil);
}

function telefoneClientePedido(pedido: Pedido, perfil?: PerfilCliente) {
  if (pedido.tipo_venda === 'balcao') return pedido.cliente_telefone_balcao || '';
  return perfil?.telefone || '';
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
              <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Porção em kg</span>
              <input type="text" inputMode="decimal" value={form.porcao_kg} onChange={e => onChange({ ...form, porcao_kg: e.target.value })} onBlur={e => onChange({ ...form, porcao_kg: valorInputBR(e.target.value, 3) })} placeholder="0,350" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-800" />
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
  const [filtroProdutoBalcao, setFiltroProdutoBalcao] = useState('');
  const [filtroProdutoEstoque, setFiltroProdutoEstoque] = useState('');
  const [modalProdutoAberto, setModalProdutoAberto] = useState(false);
  const [produtoEditando, setProdutoEditando] = useState<Produto | null>(null);
  const [formProduto, setFormProduto] = useState<ProdutoForm>({ ...FORM_VAZIO });
  const [salvandoProduto, setSalvandoProduto] = useState(false);
  const [carrinhoBalcao, setCarrinhoBalcao] = useState<Record<number, number>>({});
  const [formBalcao, setFormBalcao] = useState<VendaBalcaoForm>({ ...FORM_BALCAO_VAZIO });
  const [salvandoBalcao, setSalvandoBalcao] = useState(false);
  const [formConfig, setFormConfig] = useState<LojaConfigForm>({ ...LOJA_CONFIG_FORM_PADRAO });
  const [carregandoConfig, setCarregandoConfig] = useState(false);
  const [salvandoConfig, setSalvandoConfig] = useState(false);

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

      const ids = Array.from(new Set(lista.map(pedido => pedido.cliente_id).filter(Boolean))) as string[];
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

  const carregarConfig = useCallback(async () => {
    setCarregandoConfig(true);
    try {
      const { data, error } = await supabase
        .from('app_config')
        .select('valor')
        .eq('chave', 'loja_config')
        .maybeSingle();

      if (error) throw error;
      setFormConfig(configParaForm(data?.valor ?? {}));
    } catch (err: any) {
      toast(`Erro ao carregar configuraÃ§Ãµes: ${err.message}`, 'erro');
    } finally {
      setCarregandoConfig(false);
    }
  }, [toast]);

  useEffect(() => {
    async function protegerRota() {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        router.replace('/login');
        return;
      }
      const { data: isAdmin, error: adminError } = await supabase.rpc('is_viva_leve_admin');
      if (adminError || !isAdmin) {
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
    carregarConfig();
  }, [loading, carregarPedidos, carregarProdutos, carregarConfig]);

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

  const produtosBalcaoFiltrados = useMemo(() => {
    const termo = normalizarBusca(filtroProdutoBalcao);
    return produtos
      .filter(produto => produto.ativo)
      .filter(produto => !termo || normalizarBusca(produto.nome).includes(termo));
  }, [filtroProdutoBalcao, produtos]);

  const produtosEstoqueFiltrados = useMemo(() => {
    const termo = normalizarBusca(filtroProdutoEstoque);
    return produtos.filter(produto => !termo || normalizarBusca(produto.nome).includes(termo));
  }, [filtroProdutoEstoque, produtos]);

  const itensBalcao = useMemo(() => Object.entries(carrinhoBalcao)
    .map(([idTexto, quantidade]) => {
      const produto = produtos.find(item => item.id === Number(idTexto));
      if (!produto) return null;
      return {
        produto,
        quantidade,
        subtotal: Number(produto.preco || 0) * quantidade,
      };
    })
    .filter(Boolean) as Array<{ produto: Produto; quantidade: number; subtotal: number }>, [carrinhoBalcao, produtos]);

  const subtotalBalcao = useMemo(() => itensBalcao.reduce((total, item) => total + item.subtotal, 0), [itensBalcao]);
  const freteBalcao = Math.max(0, parseNumeroBR(formBalcao.taxa_entrega));
  const descontoPercentualBalcao = Math.min(100, Math.max(0, parseNumeroBR(formBalcao.desconto_percentual)));
  const descontoValorBalcao = subtotalBalcao * (descontoPercentualBalcao / 100);
  const totalBalcao = Math.max(0, subtotalBalcao - descontoValorBalcao + freteBalcao);

  const salvarConfig = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvandoConfig(true);

    const payload = {
      cupom_boas_vindas_percentual: percentualLimitado(formConfig.cupom_boas_vindas_percentual),
      taxa_entrega_padrao: Math.max(0, parseNumeroBR(formConfig.taxa_entrega_padrao)),
      cupom_dia_d_percentual: percentualLimitado(formConfig.cupom_dia_d_percentual),
      cupom_dia_d_ativo: Boolean(formConfig.cupom_dia_d_ativo) && percentualLimitado(formConfig.cupom_dia_d_percentual) > 0,
    };

    try {
      const { data, error } = await supabase
        .from('app_config')
        .upsert({ chave: 'loja_config', valor: payload }, { onConflict: 'chave' })
        .select('valor')
        .maybeSingle();

      if (error) throw error;
      const configuracao = exigirLinhaAtualizada(data, 'A configuraÃ§Ã£o da loja');
      setFormConfig(configParaForm(configuracao.valor));
      toast('ConfiguraÃ§Ãµes da loja salvas com sucesso.', 'sucesso');
    } catch (err: any) {
      toast(`Erro ao salvar configuraÃ§Ãµes: ${err.message}`, 'erro');
    } finally {
      setSalvandoConfig(false);
    }
  };

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

  const adicionarProdutoBalcao = (produto: Produto) => {
    if (!produto.ativo || Number(produto.estoque || 0) <= 0) {
      toast('Produto sem estoque para venda.', 'erro');
      return;
    }

    const quantidadeAtual = carrinhoBalcao[produto.id] ?? 0;
    if (quantidadeAtual >= Number(produto.estoque || 0)) {
      toast(`Limite de estoque atingido: ${produto.estoque} unidade(s).`, 'erro');
      return;
    }

    setCarrinhoBalcao(prev => ({ ...prev, [produto.id]: quantidadeAtual + 1 }));
  };

  const removerProdutoBalcao = (produtoId: number) => {
    setCarrinhoBalcao(prev => {
      const atual = prev[produtoId] ?? 0;
      const proximo = { ...prev };
      if (atual <= 1) {
        delete proximo[produtoId];
      } else {
        proximo[produtoId] = atual - 1;
      }
      return proximo;
    });
  };

  const limparVendaBalcao = () => {
    setCarrinhoBalcao({});
    setFormBalcao({ ...FORM_BALCAO_VAZIO });
  };

  const finalizarVendaBalcao = async (event: React.FormEvent) => {
    event.preventDefault();

    if (itensBalcao.length === 0) {
      toast('Adicione pelo menos um produto na venda balcão.', 'erro');
      return;
    }

    setSalvandoBalcao(true);

    try {
      const ids = itensBalcao.map(item => item.produto.id);
      const { data: produtosAtualizados, error: estoqueError } = await supabase
        .from('produtos')
        .select('id,nome,preco,estoque,ativo')
        .in('id', ids);

      if (estoqueError) throw estoqueError;

      const mapaEstoque = new Map((produtosAtualizados ?? []).map((produto: any) => [Number(produto.id), produto]));
      for (const item of itensBalcao) {
        const produtoAtual = mapaEstoque.get(item.produto.id);
        if (!produtoAtual || !produtoAtual.ativo || Number(produtoAtual.estoque || 0) < item.quantidade) {
          throw new Error(`Estoque insuficiente para "${item.produto.nome}".`);
        }
      }

      const listaItens = itensBalcao.map(item => {
        const produtoAtual = mapaEstoque.get(item.produto.id);
        const preco = Number(produtoAtual?.preco ?? item.produto.preco ?? 0);
        return {
          id: item.produto.id,
          nome: item.produto.nome,
          preco,
          quantidade: item.quantidade,
          subtotal: preco * item.quantidade,
        };
      });

      const subtotalValidado = listaItens.reduce((total, item) => total + item.subtotal, 0);
      const descontoPercentual = Math.min(100, Math.max(0, parseNumeroBR(formBalcao.desconto_percentual)));
      const descontoValor = subtotalValidado * (descontoPercentual / 100);
      const valorFrete = Math.max(0, parseNumeroBR(formBalcao.taxa_entrega));
      const valorTotal = Math.max(0, subtotalValidado - descontoValor + valorFrete);
      const endereco = formBalcao.endereco_entrega.trim();
      const temEntrega = Boolean(endereco || valorFrete > 0);

      const { data: pedidoCriado, error: pedidoError } = await supabase
        .from('pedidos')
        .insert([{
          cliente_id: null,
          tipo_venda: 'balcao',
          cliente_nome_balcao: formBalcao.cliente_nome.trim() || null,
          cliente_telefone_balcao: formBalcao.cliente_telefone.trim() || null,
          observacoes_balcao: formBalcao.observacoes.trim() || null,
          endereco_entrega: endereco || null,
          endereco: endereco || '',
          subtotal_produtos: subtotalValidado,
          valor_frete: valorFrete,
          desconto_percentual: descontoPercentual,
          desconto_valor: descontoValor,
          valor_total: valorTotal,
          total: valorTotal,
          itens: listaItens,
          status: temEntrega ? 'Recebido' : 'Entregue',
          pagamento_status: 'balcao',
        }])
        .select('id')
        .maybeSingle();

      if (pedidoError) throw pedidoError;
      const pedidoValidado = exigirLinhaAtualizada(pedidoCriado, 'A venda balcão');

      for (const item of itensBalcao) {
        const produtoAtual = mapaEstoque.get(item.produto.id);
        const novoEstoque = Math.max(0, Number(produtoAtual.estoque || 0) - item.quantidade);
        const { data, error } = await supabase
          .from('produtos')
          .update({ estoque: novoEstoque })
          .eq('id', item.produto.id)
          .gte('estoque', item.quantidade)
          .select('id')
          .maybeSingle();

        if (error) throw error;
        exigirLinhaAtualizada(data, `Baixa de estoque de ${item.produto.nome}`);
      }

      toast(`Venda balcão #${pedidoValidado.id} registrada com sucesso.`, 'sucesso');
      limparVendaBalcao();
      await Promise.all([carregarPedidos(), carregarProdutos()]);
    } catch (err: any) {
      toast(`Erro ao registrar venda balcão: ${err.message}`, 'erro');
      await carregarProdutos();
    } finally {
      setSalvandoBalcao(false);
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
      porcao_kg: valorInputBR(Number(produto.porcao_g ?? 0) / 1000, 3),
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
      porcao_g: parseNumeroBR(formProduto.porcao_kg) > 0 ? parseNumeroBR(formProduto.porcao_kg) * 1000 : null,
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

  const imprimirEtiqueta = (produto: Produto) => {
    const gramas = Number(produto.porcao_g || 100);
    const payloadQr = JSON.stringify({ id: produto.id, gramas });
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(payloadQr)}`;
    const dataFabricacao = new Date();
    const dataValidade = new Date(dataFabricacao);
    dataValidade.setDate(dataValidade.getDate() + 90);
    const ano = dataFabricacao.getFullYear();
    const mes = String(dataFabricacao.getMonth() + 1).padStart(2, '0');
    const dia = String(dataFabricacao.getDate()).padStart(2, '0');
    const lote = `${produto.id}${ano}${mes}${dia}`;
    const fabricacaoBR = dataFabricacao.toLocaleDateString('pt-BR');
    const validadeBR = dataValidade.toLocaleDateString('pt-BR');
    const janela = window.open('', '_blank', 'width=520,height=760');

    if (!janela) {
      toast('O navegador bloqueou a janela de impressão. Permita pop-ups para imprimir a etiqueta.', 'erro');
      return;
    }

    janela.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Etiqueta ${escaparHtml(produto.nome)}</title>
  <style>
    @page { size: 100mm 150mm; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: 100mm;
      height: 150mm;
      color: #000;
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
    }
    .label {
      width: 100mm;
      height: 150mm;
      padding: 5mm;
      display: grid;
      grid-template-columns: 1fr 34mm;
      grid-template-rows: auto auto 1fr auto auto;
      gap: 3mm 4mm;
      overflow: hidden;
      border: 1px solid #000;
    }
    .brand {
      grid-column: 1 / -1;
      font-size: 24px;
      line-height: 1;
      font-weight: 900;
      letter-spacing: 0;
      text-align: center;
      border-bottom: 1px solid #000;
      padding-bottom: 3mm;
    }
    .name {
      grid-column: 1 / -1;
      font-size: 19px;
      line-height: 1.08;
      font-weight: 900;
      text-transform: uppercase;
    }
    .desc {
      font-size: 11px;
      line-height: 1.25;
      overflow: hidden;
    }
    .qr {
      width: 34mm;
      height: 34mm;
      object-fit: contain;
      align-self: start;
      justify-self: end;
    }
    .meta {
      grid-column: 1 / -1;
      border-top: 1px solid #000;
      padding-top: 3mm;
      font-size: 11px;
      line-height: 1.35;
      font-weight: 700;
    }
    .dates {
      grid-column: 1 / -1;
      border-top: 1px solid #000;
      padding-top: 3mm;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2mm 4mm;
      font-size: 11px;
      line-height: 1.3;
      font-weight: 800;
    }
    .dates .full { grid-column: 1 / -1; }
    .small { font-weight: 400; }
  </style>
</head>
<body>
  <section class="label">
    <div class="brand">VIVA LEVE</div>
    <div class="name">${escaparHtml(produto.nome)}</div>
    <div class="desc">
      <strong>${escaparHtml(produto.categoria || 'Produto')}</strong><br />
      ${escaparHtml(produto.descricao || '')}
    </div>
    <img class="qr" src="${qrUrl}" alt="QR Code" />
    <div class="dates">
      <div class="full">Lote: ${escaparHtml(lote)}</div>
      <div>Fabricação: ${escaparHtml(fabricacaoBR)}</div>
      <div>Validade: ${escaparHtml(validadeBR)}</div>
    </div>
    <div class="meta">
      Porção: ${escaparHtml(formatarGramas(produto.porcao_g))}<br />
      Macros por 100g:
      ${escaparHtml(formatarNumeroBR(produto.kcal, 0))} kcal |
      P ${escaparHtml(formatarNumeroBR(produto.proteinas, 1))}g |
      C ${escaparHtml(formatarNumeroBR(produto.carboidratos, 1))}g |
      G ${escaparHtml(formatarNumeroBR(produto.gorduras, 1))}g<br />
      <span class="small">QR dieta: ${escaparHtml(payloadQr)}</span>
    </div>
  </section>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.print();
      }, 250);
    });
  </script>
</body>
</html>`);
    janela.document.close();
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
              { id: 'balcao' as const, label: 'Venda Balcão', desc: 'Pedido rápido' },
              { id: 'produtos' as const, label: 'Cardápio/Estoque', desc: `${produtos.length} produtos` },
              { id: 'config' as const, label: 'Configuracoes', desc: 'Cupons e frete' },
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
            <Link
              href="/admin/planos-nutri"
              className="min-w-48 rounded-xl bg-viva-verde px-4 py-3 text-left text-viva-roxo transition hover:brightness-95 lg:min-w-0"
            >
              <span className="block text-sm font-black">Planos Nutri</span>
              <span className="mt-1 block text-xs font-bold text-viva-roxo/70">IA e revisao humana</span>
            </Link>
          </nav>
        </aside>

        <main className="flex-1 p-4 md:p-6">
          <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-black">
                {aba === 'pedidos' ? 'Gestão de Pedidos' : aba === 'balcao' ? 'Venda Balcão' : aba === 'produtos' ? 'Cardápio e Estoque' : 'Configuracoes'}
              </h1>
              <p className="text-sm text-gray-500">Dados ao vivo do Supabase oficial.</p>
            </div>
            <button onClick={() => { carregarPedidos(); carregarProdutos(); carregarConfig(); }} className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50">
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
                  const perfil = pedido.cliente_id ? perfis[pedido.cliente_id] : undefined;
                  const nomeCliente = nomeClientePedido(pedido, perfil);
                  const telefoneCliente = telefoneClientePedido(pedido, perfil);
                  const whatsappCliente = telefoneWhatsApp(telefoneCliente);

                  return (
                    <article key={pedido.id} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                      <div className="border-b border-gray-100 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-mono text-xs font-bold text-gray-400">#{String(pedido.id).slice(0, 10).toUpperCase()}</p>
                            <h2 className="mt-1 text-lg font-black">{nomeCliente}</h2>
                            <p className="text-xs text-gray-500">{telefoneCliente || 'Telefone não informado'}</p>
                            {pedido.tipo_venda === 'balcao' && (
                              <span className="mt-2 inline-flex rounded-full bg-gray-900 px-3 py-1 text-[11px] font-black uppercase text-white">
                                Venda balcão
                              </span>
                            )}
                            {whatsappCliente && (
                              <a
                                href={`https://wa.me/${whatsappCliente}`}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-flex rounded-lg bg-green-500 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-green-600"
                              >
                                Falar com cliente
                              </a>
                            )}
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

          {aba === 'balcao' && (
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="space-y-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-lg font-black text-gray-900">Produtos disponíveis</h2>
                      <p className="text-xs text-gray-500">A quantidade é limitada pelo estoque atual.</p>
                    </div>
                    {carregandoProdutos && <span className="text-xs font-bold text-gray-400">Carregando...</span>}
                  </div>
                  <input
                    type="search"
                    value={filtroProdutoBalcao}
                    onChange={e => setFiltroProdutoBalcao(e.target.value)}
                    placeholder="Filtrar por nome do produto"
                    className="mt-4 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {produtosBalcaoFiltrados.map(produto => {
                    const quantidade = carrinhoBalcao[produto.id] ?? 0;
                    const semEstoque = Number(produto.estoque || 0) <= 0;

                    return (
                      <article key={produto.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="flex min-h-[92px] flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="text-sm font-black text-gray-900">{produto.nome}</h3>
                                <p className="mt-1 text-xs text-gray-500">{produto.categoria}</p>
                              </div>
                              <span className={`rounded-full px-2 py-1 text-[11px] font-black ${semEstoque ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                Est. {produto.estoque}
                              </span>
                            </div>
                            <p className="mt-2 text-lg font-black text-gray-900">{formatarMoedaBR(produto.preco)}</p>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-2">
                            {quantidade > 0 ? (
                              <div className="flex items-center gap-2">
                                <button type="button" onClick={() => removerProdutoBalcao(produto.id)} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-black text-gray-700">-</button>
                                <span className="w-8 text-center text-sm font-black">{quantidade}</span>
                                <button type="button" onClick={() => adicionarProdutoBalcao(produto)} disabled={quantidade >= Number(produto.estoque || 0)} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-sm font-black text-white disabled:opacity-40">+</button>
                              </div>
                            ) : (
                              <span className="text-xs font-semibold text-gray-400">Fora do carrinho</span>
                            )}
                            <button type="button" onClick={() => adicionarProdutoBalcao(produto)} disabled={semEstoque || quantidade >= Number(produto.estoque || 0)} className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-black text-white hover:bg-gray-800 disabled:opacity-40">
                              Adicionar
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {!carregandoProdutos && produtosBalcaoFiltrados.length === 0 && (
                  <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-400">
                    {filtroProdutoBalcao ? 'Nenhum produto encontrado para esse filtro.' : 'Nenhum produto ativo para venda.'}
                  </div>
                )}
              </div>

              <form onSubmit={finalizarVendaBalcao} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm xl:sticky xl:top-5 xl:self-start">
                <div>
                  <h2 className="text-lg font-black text-gray-900">Fechamento</h2>
                  <p className="text-xs text-gray-500">Cliente, entrega, frete e desconto são opcionais.</p>
                </div>

                <div className="space-y-2">
                  {itensBalcao.length === 0 ? (
                    <p className="rounded-xl bg-gray-50 p-4 text-center text-sm font-semibold text-gray-400">Nenhum item adicionado.</p>
                  ) : (
                    itensBalcao.map(item => (
                      <div key={item.produto.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2 text-sm">
                        <div>
                          <p className="font-black text-gray-800">{item.quantidade}x {item.produto.nome}</p>
                          <p className="text-xs text-gray-500">{formatarMoedaBR(item.produto.preco)} un.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-gray-900">{formatarMoedaBR(item.subtotal)}</span>
                          <button type="button" onClick={() => removerProdutoBalcao(item.produto.id)} className="rounded-lg bg-white px-2 py-1 text-xs font-black text-gray-500 ring-1 ring-gray-200">-</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Nome do cliente</span>
                    <input value={formBalcao.cliente_nome} onChange={e => setFormBalcao({ ...formBalcao, cliente_nome: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900" />
                  </label>

                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Telefone</span>
                    <input value={formBalcao.cliente_telefone} onChange={e => setFormBalcao({ ...formBalcao, cliente_telefone: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900" />
                  </label>

                  <label className="md:col-span-2 xl:col-span-1">
                    <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Endereço de entrega</span>
                    <input value={formBalcao.endereco_entrega} onChange={e => setFormBalcao({ ...formBalcao, endereco_entrega: e.target.value })} placeholder="Opcional" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900" />
                  </label>

                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Taxa de entrega</span>
                    <input type="text" inputMode="decimal" value={formBalcao.taxa_entrega} onChange={e => setFormBalcao({ ...formBalcao, taxa_entrega: e.target.value })} onBlur={e => setFormBalcao({ ...formBalcao, taxa_entrega: valorInputBR(e.target.value, 2) })} placeholder="0,00" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900" />
                  </label>

                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Desconto %</span>
                    <input type="text" inputMode="decimal" value={formBalcao.desconto_percentual} onChange={e => setFormBalcao({ ...formBalcao, desconto_percentual: e.target.value })} onBlur={e => setFormBalcao({ ...formBalcao, desconto_percentual: valorInputBR(e.target.value, 2) })} placeholder="0,00" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900" />
                  </label>

                  <label className="md:col-span-2 xl:col-span-1">
                    <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Observações</span>
                    <textarea value={formBalcao.observacoes} onChange={e => setFormBalcao({ ...formBalcao, observacoes: e.target.value })} rows={3} className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900" />
                  </label>
                </div>

                <div className="space-y-2 rounded-xl bg-gray-50 p-4 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>{formatarMoedaBR(subtotalBalcao)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Entrega</span>
                    <span>{formatarMoedaBR(freteBalcao)}</span>
                  </div>
                  <div className="flex justify-between text-green-700">
                    <span>Desconto ({formatarNumeroBR(descontoPercentualBalcao, 2)}%)</span>
                    <span>- {formatarMoedaBR(descontoValorBalcao)}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-2 text-lg font-black text-gray-900">
                    <span>Total</span>
                    <span>{formatarMoedaBR(totalBalcao)}</span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button type="submit" disabled={salvandoBalcao || itensBalcao.length === 0} className="rounded-xl bg-gray-900 px-4 py-3 text-sm font-black text-white shadow-lg hover:bg-gray-800 disabled:opacity-50">
                    {salvandoBalcao ? 'Registrando...' : 'Registrar venda'}
                  </button>
                  <button type="button" onClick={limparVendaBalcao} className="rounded-xl bg-gray-100 px-4 py-3 text-sm font-black text-gray-700 hover:bg-gray-200">
                    Limpar
                  </button>
                </div>
              </form>
            </section>
          )}

          {aba === 'config' && (
            <section className="space-y-5">
              <form onSubmit={salvarConfig} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-lg font-black text-gray-900">Cupons e entrega</h2>
                    <p className="text-xs text-gray-500">Valores gravados em app_config e usados pela loja sem alterar codigo.</p>
                  </div>
                  {carregandoConfig && <span className="text-xs font-bold text-gray-400">Carregando...</span>}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Cupom de boas-vindas (%)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formConfig.cupom_boas_vindas_percentual}
                      onChange={e => setFormConfig({ ...formConfig, cupom_boas_vindas_percentual: e.target.value })}
                      onBlur={e => setFormConfig({ ...formConfig, cupom_boas_vindas_percentual: formatarNumeroBR(percentualLimitado(e.target.value), 2) })}
                      placeholder="30,00"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900"
                    />
                    <span className="mt-1 block text-xs text-gray-400">Use 0,00 para desativar o cupom automatico de primeiro cadastro.</span>
                  </label>

                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Taxa de entrega padrao</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formConfig.taxa_entrega_padrao}
                      onChange={e => setFormConfig({ ...formConfig, taxa_entrega_padrao: e.target.value })}
                      onBlur={e => setFormConfig({ ...formConfig, taxa_entrega_padrao: valorInputBR(e.target.value, 2) || '0,00' })}
                      placeholder="10,00"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900"
                    />
                    <span className="mt-1 block text-xs text-gray-400">Aplicada em compras abaixo do limite de frete gratis.</span>
                  </label>

                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Cupom Dia D (%)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formConfig.cupom_dia_d_percentual}
                      onChange={e => setFormConfig({ ...formConfig, cupom_dia_d_percentual: e.target.value })}
                      onBlur={e => setFormConfig({ ...formConfig, cupom_dia_d_percentual: formatarNumeroBR(percentualLimitado(e.target.value), 2) })}
                      placeholder="0,00"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900"
                    />
                    <span className="mt-1 block text-xs text-gray-400">Padrao 0,00. A loja considera este desconto quando ativo.</span>
                  </label>

                  <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <span>
                      <span className="block text-xs font-bold uppercase text-gray-500">Ativar Dia D</span>
                      <span className="mt-1 block text-xs text-gray-400">Se desativado ou em 0%, o beneficio nao aparece nem entra no pedido.</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setFormConfig({ ...formConfig, cupom_dia_d_ativo: !formConfig.cupom_dia_d_ativo })}
                      className={`inline-flex h-7 w-12 items-center rounded-full p-1 transition ${formConfig.cupom_dia_d_ativo ? 'bg-green-500' : 'bg-gray-300'}`}
                      aria-pressed={formConfig.cupom_dia_d_ativo}
                    >
                      <span className={`h-5 w-5 rounded-full bg-white shadow transition ${formConfig.cupom_dia_d_ativo ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </label>
                </div>

                <div className="mt-5 flex gap-3">
                  <button disabled={salvandoConfig} className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-black text-white shadow-lg hover:bg-gray-800 disabled:opacity-50">
                    {salvandoConfig ? 'Salvando...' : 'Salvar configuracoes'}
                  </button>
                  <button type="button" onClick={carregarConfig} className="rounded-xl bg-gray-100 px-5 py-3 text-sm font-black text-gray-700 hover:bg-gray-200">
                    Recarregar
                  </button>
                </div>
              </form>
            </section>
          )}

          {aba === 'produtos' && (
            <section className="space-y-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <input
                  type="search"
                  value={filtroProdutoEstoque}
                  onChange={e => setFiltroProdutoEstoque(e.target.value)}
                  placeholder="Filtrar por nome do produto"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-900 shadow-sm outline-none focus:ring-2 focus:ring-gray-900 md:max-w-md"
                />
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
                        <th className="px-4 py-3 text-center font-black">Porção</th>
                        <th className="px-4 py-3 text-center font-black">Estoque</th>
                        <th className="px-4 py-3 text-center font-black">Status</th>
                        <th className="px-4 py-3 text-right font-black">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {produtosEstoqueFiltrados.map(produto => (
                        <tr key={produto.id} className={!produto.ativo ? 'bg-gray-50 opacity-70' : ''}>
                          <td className="px-4 py-4">
                            <p className="font-black text-gray-900">{produto.nome}</p>
                            <p className="max-w-sm truncate text-xs text-gray-500">{produto.descricao}</p>
                          </td>
                          <td className="px-4 py-4">
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">{produto.categoria}</span>
                          </td>
                          <td className="px-4 py-4 text-right font-black">{formatarMoedaBR(produto.preco)}</td>
                          <td className="px-4 py-4 text-center font-bold text-gray-600">{formatarPorcaoKg(produto.porcao_g)}</td>
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
                            <button onClick={() => imprimirEtiqueta(produto)} className="mr-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-black text-gray-700 hover:border-gray-900 hover:text-gray-900">
                              Etiqueta
                            </button>
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
                {!carregandoProdutos && produtosEstoqueFiltrados.length === 0 && (
                  <div className="p-8 text-center text-gray-400">
                    {filtroProdutoEstoque ? 'Nenhum produto encontrado para esse filtro.' : 'Nenhum produto cadastrado.'}
                  </div>
                )}
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
