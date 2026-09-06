"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../supabase';
import { nomeMeioPagamento } from '../../lib/meiosPagamento';
import { normalizarMeiosPagamento } from '../../lib/paymentConfig';
import { CONFIG_PLANO_INICIAL, PlanoConfig } from '@/lib/planosMarmitas';
import { estoqueDisponivelProduto } from '@/lib/stock';

type AbaAdmin = 'pedidos' | 'balcao' | 'produtos' | 'creditos' | 'treinos' | 'config';
type ToastTipo = 'sucesso' | 'erro' | 'info';

interface ItemPedido {
  id?: number;
  nome: string;
  preco: number;
  quantidade: number;
  subtotal?: number;
}

interface Pedido {
  somente_planos?: boolean;
  checkout_idempotencia?: string;
  id: number | string;
  cliente_id?: string | null;
  endereco_entrega?: string | null;
  endereco?: string;
  valor_total: number;
  total?: number;
  status: string;
  pagamento_status?: string | null;
  mercado_pago_status_detail?: string | null;
  meio_pagamento?: string | null;
  cielo_return_code?: string | null;
  cielo_return_message?: string | null;
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
  tipo_produto?: 'avulso' | 'kit';
  disponivel_kit?: boolean;
  plano_config?: PlanoConfig | null;
  id: number;
  nome: string;
  descricao: string | null;
  preco: number;
  categoria: string;
  imagem_url: string | null;
  estoque: number;
  estoque_reservado?: number;
  estoque_disponivel?: number;
  porcao_g?: number | null;
  kcal: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  ativo: boolean;
  tabela_nutri?: TabelaNutri | null;
}

interface CreditoPagamento {
  id: number;
  chave: string;
  valor_origem: number;
  valor_disponivel: number;
  valor_reservado: number;
  tipo: 'Devolução' | 'Bonificação' | 'Premiação' | 'Venda Externa';
  email_restricao: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

const TIPOS_CREDITO: CreditoPagamento['tipo'][] = ['Devolução', 'Bonificação', 'Premiação', 'Venda Externa'];

function gerarChaveCredito() {
  const bloco = () => crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
  return `VL-${bloco()}-${bloco()}`;
}

interface TabelaNutri {
  porcao_g: number;
  valor_energetico_kcal: number;
  carboidratos_g: number;
  proteinas_g: number;
  gorduras_totais_g: number;
  gorduras_saturadas_g: number;
  gorduras_trans_g: number;
  fibra_alimentar_g: number;
  sodio_mg: number;
  ingredientes: string;
  alergicos: string;
}

interface ProdutoForm {
  tipo_produto: 'avulso' | 'kit';
  disponivel_kit: boolean;
  ativo: boolean;
  plano_config: PlanoConfig;
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
  tabela_poracao_g: string;
  tabela_valor_energetico_kcal: string;
  tabela_carboidratos_g: string;
  tabela_proteinas_g: string;
  tabela_gorduras_totais_g: string;
  tabela_gorduras_saturadas_g: string;
  tabela_gorduras_trans_g: string;
  tabela_fibra_alimentar_g: string;
  tabela_sodio_mg: string;
  tabela_ingredientes: string;
  tabela_alergicos: string;
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
  meios_pagamento: {
    cielo: boolean;
    mercado_pago: boolean;
    pix: boolean;
  };
}

interface ExercicioCatalogo {
  id: number;
  name: string;
  primary_muscle_group: string;
  environment: string;
  equipment: string | null;
  movement_pattern: string | null;
  technical_level: string | null;
  video_url: string | null;
  video_thumbnail_url: string | null;
  is_active: boolean;
}

const STATUS_FLUXO = ['Pendente', 'Aguardando Pagamento', 'Recebido', 'Em Preparo', 'Saiu para Entrega', 'Entregue'];
const CATEGORIAS = ['Marmitas', 'Lanches Rápidos', 'Proteínas', 'Suplementos', 'Caldos', 'Naturais', 'Moda Fitness', 'Sua Dieta'];
const PRODUTOS_IMAGE_BUCKETS = [
  process.env.NEXT_PUBLIC_SUPABASE_PRODUTOS_BUCKET,
  'produtos-viva-leve',
  'produtos',
  'imagens-produtos',
  'produto-imagens',
  'produtos-imagens',
].filter(Boolean) as string[];

const FORM_VAZIO: ProdutoForm = {
  tipo_produto: 'avulso', disponivel_kit: false, ativo: true, plano_config: { ...CONFIG_PLANO_INICIAL },
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
  tabela_poracao_g: '',
  tabela_valor_energetico_kcal: '',
  tabela_carboidratos_g: '',
  tabela_proteinas_g: '',
  tabela_gorduras_totais_g: '',
  tabela_gorduras_saturadas_g: '',
  tabela_gorduras_trans_g: '',
  tabela_fibra_alimentar_g: '',
  tabela_sodio_mg: '',
  tabela_ingredientes: '',
  tabela_alergicos: '',
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
  meios_pagamento: {
    cielo: true,
    mercado_pago: true,
    pix: true,
  },
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
    meios_pagamento: normalizarMeiosPagamento(bruto),
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

function slugArquivo(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
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

function valorTexto(valor: unknown) {
  const texto = String(valor ?? '').trim();
  return texto || undefined;
}

function mesclarPerfilCliente(atual: PerfilCliente | undefined, novo: PerfilCliente) {
  return {
    ...(atual ?? {}),
    ...novo,
    nome: valorTexto(novo.nome) ?? valorTexto(atual?.nome),
    nome_completo: valorTexto(novo.nome_completo) ?? valorTexto(atual?.nome_completo),
    full_name: valorTexto(novo.full_name) ?? valorTexto(atual?.full_name),
    telefone: valorTexto(novo.telefone) ?? valorTexto(atual?.telefone),
    email: valorTexto(novo.email) ?? valorTexto(atual?.email),
  };
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

function LinhaExercicioAdmin({
  exercicio,
  onSalvarVideo,
  onToggleAtivo,
}: {
  exercicio: ExercicioCatalogo;
  onSalvarVideo: (exercicio: ExercicioCatalogo, videoUrl: string, thumbnailUrl: string) => void;
  onToggleAtivo: (exercicio: ExercicioCatalogo) => void;
}) {
  const [videoUrl, setVideoUrl] = useState(exercicio.video_url ?? '');
  const [thumbnailUrl, setThumbnailUrl] = useState(exercicio.video_thumbnail_url ?? '');

  useEffect(() => {
    setVideoUrl(exercicio.video_url ?? '');
    setThumbnailUrl(exercicio.video_thumbnail_url ?? '');
  }, [exercicio.id, exercicio.video_url, exercicio.video_thumbnail_url]);

  return (
    <tr className={!exercicio.is_active ? 'bg-gray-50 opacity-70' : ''}>
      <td className="px-4 py-4 align-top">
        <p className="font-black text-gray-900">{exercicio.name}</p>
        <p className="mt-1 text-xs font-semibold text-gray-500">{exercicio.movement_pattern || '-'} - {exercicio.equipment || '-'}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">{exercicio.primary_muscle_group}</span>
      </td>
      <td className="px-4 py-4 align-top text-xs font-bold text-gray-600">{exercicio.environment}</td>
      <td className="px-4 py-4 align-top text-xs font-bold text-gray-600">{exercicio.technical_level || '-'}</td>
      <td className="min-w-[340px] px-4 py-4 align-top">
        <div className="grid gap-2">
          <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="URL do video demonstrativo" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-gray-900" />
          <input value={thumbnailUrl} onChange={e => setThumbnailUrl(e.target.value)} placeholder="URL da thumbnail" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
      </td>
      <td className="px-4 py-4 text-center align-top">
        <button onClick={() => onToggleAtivo(exercicio)} className={`inline-flex h-6 w-11 items-center rounded-full p-1 transition ${exercicio.is_active ? 'bg-green-500' : 'bg-gray-300'}`} aria-label={exercicio.is_active ? 'Inativar exercicio' : 'Ativar exercicio'}>
          <span className={`h-4 w-4 rounded-full bg-white shadow transition ${exercicio.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </td>
      <td className="px-4 py-4 text-right align-top">
        <button onClick={() => onSalvarVideo(exercicio, videoUrl, thumbnailUrl)} className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-black text-white hover:bg-gray-800">
          Salvar
        </button>
      </td>
    </tr>
  );
}

function ModalProduto({
  form,
  editando,
  salvando,
  enviandoImagem,
  onClose,
  onSubmit,
  onChange,
  onUploadImagem,
}: {
  form: ProdutoForm;
  editando: Produto | null;
  salvando: boolean;
  enviandoImagem: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onChange: (form: ProdutoForm) => void;
  onUploadImagem: (file: File) => void;
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
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold">Tipo de produto<select value={form.tipo_produto} onChange={e => onChange({ ...form, tipo_produto: e.target.value as 'kit' | 'avulso', disponivel_kit: false })} className="mt-1 h-11 w-full rounded-lg border px-3"><option value="avulso">Produto avulso</option><option value="kit">KIT / PLANO</option></select></label>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.ativo} onChange={e => onChange({ ...form, ativo: e.target.checked })} />Produto ativo</label>
          </div>
          {form.tipo_produto === 'kit' ? <fieldset className="grid gap-3 border-y py-4 sm:grid-cols-2"><legend className="font-black text-viva-roxo">Configuração do plano</legend>
            {([['total_marmitas', 'Total de marmitas'], ['entregas', 'Quantidade de entregas'], ['marmitas_por_entrega', 'Marmitas por entrega'], ['intervalo_dias', 'Intervalo das entregas (dias, múltiplo de 7)'], ['sabores_min', 'Mínimo de sabores'], ['sabores_max', 'Máximo de sabores']] as const).map(([key, label]) => <label key={key} className="text-xs font-bold">{label}<input required type="number" min={key === 'intervalo_dias' ? 7 : 1} step={key === 'intervalo_dias' ? 7 : 1} value={form.plano_config[key]} onChange={e => onChange({ ...form, plano_config: { ...form.plano_config, [key]: Number(e.target.value) } })} className="mt-1 h-11 w-full rounded-lg border px-3 text-sm" /></label>)}
            <label className="flex items-center gap-2 text-sm font-bold sm:col-span-2"><input type="checkbox" checked={form.plano_config.permite_voucher} onChange={e => onChange({ ...form, plano_config: { ...form.plano_config, permite_voucher: e.target.checked } })} />Permite voucher presencial na primeira entrega</label>
          </fieldset> : form.categoria === 'Marmitas' && <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.disponivel_kit} onChange={e => onChange({ ...form, disponivel_kit: e.target.checked })} />Disponível para Kits/Planos</label>}
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

            {form.tipo_produto !== 'kit' && <><label>
              <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Estoque</span>
              <input type="text" inputMode="numeric" value={form.estoque} onChange={e => onChange({ ...form, estoque: e.target.value.replace(/\D/g, '') })} placeholder="0" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-800" />
            </label>

            <label>
              <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Porção em kg</span>
              <input type="text" inputMode="decimal" value={form.porcao_kg} onChange={e => onChange({ ...form, porcao_kg: e.target.value })} onBlur={e => onChange({ ...form, porcao_kg: valorInputBR(e.target.value, 3) })} placeholder="0,350" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-800" />
            </label>

            </>}
            <label>
              <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Imagem URL</span>
              <input type="url" value={form.imagem_url} onChange={e => onChange({ ...form, imagem_url: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-800" />
            </label>

            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 md:col-span-2">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-gray-500">Carregar imagem do produto</p>
                  <p className="mt-1 text-xs text-gray-500">Selecione uma imagem do computador ou celular. O link sera preenchido automaticamente.</p>
                </div>
                <label className={`inline-flex cursor-pointer items-center justify-center rounded-xl px-4 py-3 text-sm font-black text-white shadow-sm ${enviandoImagem ? 'bg-gray-400' : 'bg-gray-900 hover:bg-gray-800'}`}>
                  {enviandoImagem ? 'Enviando...' : 'Escolher imagem'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={enviandoImagem}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) onUploadImagem(file);
                      e.currentTarget.value = '';
                    }}
                    className="hidden"
                  />
                </label>
              </div>
              {form.imagem_url && (
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-gray-100">
                  <img src={form.imagem_url} alt="Previa do produto" className="h-16 w-16 rounded-lg object-cover" />
                  <p className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-500">{form.imagem_url}</p>
                </div>
              )}
            </div>
          </div>

          {form.tipo_produto !== 'kit' && <><div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
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

          <div className="rounded-xl border-2 border-gray-900 bg-white p-4">
            <div className="mb-4">
              <p className="text-sm font-black uppercase text-gray-900">Tabela nutricional da etiqueta</p>
              <p className="mt-1 text-xs text-gray-500">Informe os valores referentes à porção declarada. Use vírgula como separador decimal.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {[
                ['tabela_poracao_g', 'Porção (g)', 0],
                ['tabela_valor_energetico_kcal', 'Valor energético (kcal)', 0],
                ['tabela_carboidratos_g', 'Carboidratos (g)', 1],
                ['tabela_proteinas_g', 'Proteínas (g)', 1],
                ['tabela_gorduras_totais_g', 'Gorduras totais (g)', 1],
                ['tabela_gorduras_saturadas_g', 'Gorduras saturadas (g)', 1],
                ['tabela_gorduras_trans_g', 'Gorduras trans (g)', 1],
                ['tabela_fibra_alimentar_g', 'Fibra alimentar (g)', 1],
                ['tabela_sodio_mg', 'Sódio (mg)', 0],
              ].map(([key, label, casas]) => (
                <label key={String(key)}>
                  <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form[key as keyof ProdutoForm] as string}
                    onChange={e => onChange({ ...form, [key]: e.target.value })}
                    onBlur={e => onChange({ ...form, [key]: valorInputBR(e.target.value, Number(casas)) })}
                    placeholder={Number(casas) === 0 ? '0' : '0,0'}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-800"
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 grid gap-3">
              <label>
                <span className="mb-1 block text-xs font-bold uppercase text-gray-600">Ingredientes</span>
                <textarea value={form.tabela_ingredientes} onChange={e => onChange({ ...form, tabela_ingredientes: e.target.value })} rows={3} placeholder="Liste os ingredientes em ordem decrescente de quantidade." className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-800" />
              </label>
              <label>
                <span className="mb-1 block text-xs font-bold uppercase text-gray-600">Alérgicos e declaração de glúten</span>
                <textarea value={form.tabela_alergicos} onChange={e => onChange({ ...form, tabela_alergicos: e.target.value })} rows={2} placeholder="Ex.: ALÉRGICOS: CONTÉM LEITE. NÃO CONTÉM GLÚTEN." className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-800" />
              </label>
            </div>
          </div>

          </>}
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
  const [menuAberto, setMenuAberto] = useState(false);
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
  const [enviandoImagemProduto, setEnviandoImagemProduto] = useState(false);
  const [carrinhoBalcao, setCarrinhoBalcao] = useState<Record<number, number>>({});
  const [formBalcao, setFormBalcao] = useState<VendaBalcaoForm>({ ...FORM_BALCAO_VAZIO });
  const [salvandoBalcao, setSalvandoBalcao] = useState(false);
  const [formConfig, setFormConfig] = useState<LojaConfigForm>({ ...LOJA_CONFIG_FORM_PADRAO });
  const [carregandoConfig, setCarregandoConfig] = useState(false);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [creditos, setCreditos] = useState<CreditoPagamento[]>([]);
  const [carregandoCreditos, setCarregandoCreditos] = useState(false);
  const [salvandoCredito, setSalvandoCredito] = useState(false);
  const [formCredito, setFormCredito] = useState({
    chave: '',
    valor: '',
    tipo: 'Devolução' as CreditoPagamento['tipo'],
    email: '',
  });
  const [exercicios, setExercicios] = useState<ExercicioCatalogo[]>([]);
  const [carregandoExercicios, setCarregandoExercicios] = useState(false);
  const [filtroExercicio, setFiltroExercicio] = useState('');

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
        .is('plano_id', null)
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
            if (id) mapa[id] = mesclarPerfilCliente(mapa[id], perfil);
          });
        }
        if (clientesRes.error) {
          toast(`Erro ao buscar perfis_clientes: ${clientesRes.error.message}`, 'erro');
        } else {
          (clientesRes.data ?? []).forEach((perfil: PerfilCliente) => {
            const id = idPerfil(perfil);
            if (id) mapa[id] = mesclarPerfilCliente(mapa[id], perfil);
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

  const carregarExercicios = useCallback(async () => {
    setCarregandoExercicios(true);
    try {
      const { data, error } = await supabase
        .from('exercise_catalog')
        .select('id,name,primary_muscle_group,environment,equipment,movement_pattern,technical_level,video_url,video_thumbnail_url,is_active')
        .order('primary_muscle_group', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      setExercicios((data ?? []) as ExercicioCatalogo[]);
    } catch (err: any) {
      toast(`Erro ao carregar exercicios: ${err.message}`, 'erro');
    } finally {
      setCarregandoExercicios(false);
    }
  }, [toast]);

  const carregarCreditos = useCallback(async () => {
    setCarregandoCreditos(true);
    try {
      const { data, error } = await supabase
        .from('creditos_pagamento')
        .select('id,chave,valor_origem,valor_disponivel,valor_reservado,tipo,email_restricao,ativo,criado_em,atualizado_em')
        .order('criado_em', { ascending: false });
      if (error) throw error;
      setCreditos((data ?? []) as CreditoPagamento[]);
    } catch (err: any) {
      toast(`Erro ao carregar créditos: ${err.message}`, 'erro');
    } finally {
      setCarregandoCreditos(false);
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
    carregarCreditos();
    carregarExercicios();
  }, [loading, carregarPedidos, carregarProdutos, carregarConfig, carregarCreditos, carregarExercicios]);

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
      .filter(produto => produto.ativo && produto.tipo_produto !== 'kit')
      .filter(produto => !termo || normalizarBusca(produto.nome).includes(termo));
  }, [filtroProdutoBalcao, produtos]);

  const produtosEstoqueFiltrados = useMemo(() => {
    const termo = normalizarBusca(filtroProdutoEstoque);
    return produtos.filter(produto => !termo || normalizarBusca(produto.nome).includes(termo));
  }, [filtroProdutoEstoque, produtos]);

  const exerciciosFiltrados = useMemo(() => {
    const termo = normalizarBusca(filtroExercicio);
    return exercicios.filter(exercicio => {
      if (!termo) return true;
      return [exercicio.name, exercicio.primary_muscle_group, exercicio.environment, exercicio.equipment, exercicio.movement_pattern, exercicio.technical_level]
        .some(valor => normalizarBusca(valor).includes(termo));
    });
  }, [exercicios, filtroExercicio]);

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
      meios_pagamento: formConfig.meios_pagamento,
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

  const criarCredito = async (event: React.FormEvent) => {
    event.preventDefault();
    const valor = Math.round(parseNumeroBR(formCredito.valor) * 100) / 100;
    const chave = (formCredito.chave.trim() || gerarChaveCredito()).toUpperCase();
    if (valor <= 0) {
      toast('Informe um valor de crédito maior que zero.', 'erro');
      return;
    }

    setSalvandoCredito(true);
    try {
      const { data, error } = await supabase
        .from('creditos_pagamento')
        .insert({
          chave,
          valor_origem: valor,
          valor_disponivel: valor,
          tipo: formCredito.tipo,
          email_restricao: formCredito.email.trim().toLowerCase() || null,
          ativo: true,
        })
        .select('id,chave,valor_origem,valor_disponivel,valor_reservado,tipo,email_restricao,ativo,criado_em,atualizado_em')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('O banco não retornou a chave criada.');
      setCreditos(prev => [data as CreditoPagamento, ...prev]);
      setFormCredito({ chave: '', valor: '', tipo: 'Devolução', email: '' });
      toast(`Chave ${data.chave} criada com sucesso.`, 'sucesso');
    } catch (err: any) {
      const mensagem = err.code === '23505' ? 'Esta chave já existe.' : err.message;
      toast(`Erro ao criar crédito: ${mensagem}`, 'erro');
    } finally {
      setSalvandoCredito(false);
    }
  };

  const alternarCredito = async (credito: CreditoPagamento) => {
    try {
      const { data, error } = await supabase
        .from('creditos_pagamento')
        .update({ ativo: !credito.ativo })
        .eq('id', credito.id)
        .select('id,ativo,atualizado_em')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('A alteração não foi confirmada pelo banco.');
      setCreditos(prev => prev.map(item => item.id === credito.id
        ? { ...item, ativo: Boolean(data.ativo), atualizado_em: data.atualizado_em }
        : item));
      toast(`Chave ${credito.chave} ${data.ativo ? 'ativada' : 'inativada'}.`, 'sucesso');
    } catch (err: any) {
      toast(`Erro ao alterar crédito: ${err.message}`, 'erro');
      await carregarCreditos();
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
    if (!produto.ativo || estoqueDisponivelProduto(produto) <= 0) {
      toast('Produto sem estoque para venda.', 'erro');
      return;
    }

    const quantidadeAtual = carrinhoBalcao[produto.id] ?? 0;
    if (quantidadeAtual >= estoqueDisponivelProduto(produto)) {
      toast(`Limite de estoque atingido: ${estoqueDisponivelProduto(produto)} unidade(s).`, 'erro');
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
        .select('id,nome,preco,estoque,estoque_reservado,estoque_disponivel,ativo')
        .in('id', ids);

      if (estoqueError) throw estoqueError;

      const mapaEstoque = new Map((produtosAtualizados ?? []).map((produto: any) => [Number(produto.id), produto]));
      for (const item of itensBalcao) {
        const produtoAtual = mapaEstoque.get(item.produto.id);
        if (!produtoAtual || !produtoAtual.ativo || estoqueDisponivelProduto(produtoAtual) < item.quantidade) {
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
          .gte('estoque_disponivel', item.quantidade)
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
    const tabela = produto.tabela_nutri ?? null;
    const porcaoTabela = Number(tabela?.porcao_g ?? produto.porcao_g ?? 0);
    const fatorLegado = porcaoTabela > 0 ? porcaoTabela / 100 : 1;
    setProdutoEditando(produto);
    setFormProduto({
      tipo_produto: produto.tipo_produto || 'avulso', disponivel_kit: Boolean(produto.disponivel_kit), ativo: produto.ativo, plano_config: produto.plano_config || { ...CONFIG_PLANO_INICIAL },
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
      tabela_poracao_g: valorInputBR(porcaoTabela, 0),
      tabela_valor_energetico_kcal: valorInputBR(tabela?.valor_energetico_kcal ?? Number(produto.kcal ?? 0) * fatorLegado, 0),
      tabela_carboidratos_g: valorInputBR(tabela?.carboidratos_g ?? Number(produto.carboidratos ?? 0) * fatorLegado, 1),
      tabela_proteinas_g: valorInputBR(tabela?.proteinas_g ?? Number(produto.proteinas ?? 0) * fatorLegado, 1),
      tabela_gorduras_totais_g: valorInputBR(tabela?.gorduras_totais_g ?? Number(produto.gorduras ?? 0) * fatorLegado, 1),
      tabela_gorduras_saturadas_g: valorInputBR(tabela?.gorduras_saturadas_g ?? 0, 1),
      tabela_gorduras_trans_g: valorInputBR(tabela?.gorduras_trans_g ?? 0, 1),
      tabela_fibra_alimentar_g: valorInputBR(tabela?.fibra_alimentar_g ?? 0, 1),
      tabela_sodio_mg: valorInputBR(tabela?.sodio_mg ?? 0, 0),
      tabela_ingredientes: tabela?.ingredientes ?? '',
      tabela_alergicos: tabela?.alergicos ?? '',
    });
    setModalProdutoAberto(true);
  };

  const uploadImagemProduto = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast('Selecione um arquivo de imagem valido.', 'erro');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('A imagem deve ter no maximo 5 MB.', 'erro');
      return;
    }

    setEnviandoImagemProduto(true);
    try {
      const extensaoOriginal = file.name.split('.').pop()?.toLowerCase() || 'png';
      const extensao = ['jpg', 'jpeg', 'png', 'webp'].includes(extensaoOriginal) ? extensaoOriginal : 'png';
      const baseNome = slugArquivo(formProduto.nome || produtoEditando?.nome || 'produto') || 'produto';
      const caminho = `produtos/${baseNome}-${Date.now()}.${extensao}`;
      let ultimoErro: unknown = null;

      for (const bucket of PRODUTOS_IMAGE_BUCKETS) {
        const { error } = await supabase.storage
          .from(bucket)
          .upload(caminho, file, {
            cacheControl: '3600',
            contentType: file.type,
            upsert: false,
          });

        if (!error) {
          const { data } = supabase.storage.from(bucket).getPublicUrl(caminho);
          setFormProduto(prev => ({ ...prev, imagem_url: data.publicUrl }));
          toast('Imagem enviada e URL preenchida.', 'sucesso');
          return;
        }

        ultimoErro = error;
        const mensagem = String(error.message || '').toLowerCase();
        if (!mensagem.includes('bucket') && !mensagem.includes('not found')) {
          break;
        }
      }

      throw ultimoErro instanceof Error ? ultimoErro : new Error('Nao foi possivel enviar a imagem para o Supabase Storage.');
    } catch (err: any) {
      toast(`Erro ao enviar imagem: ${err.message || 'verifique o bucket/policies do Storage.'}`, 'erro');
    } finally {
      setEnviandoImagemProduto(false);
    }
  };

  const salvarProduto = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvandoProduto(true);

    const porcaoProdutoG = parseNumeroBR(formProduto.porcao_kg) > 0 ? parseNumeroBR(formProduto.porcao_kg) * 1000 : null;
    const porcaoTabelaG = parseNumeroBR(formProduto.tabela_poracao_g) || porcaoProdutoG || 0;
    const tabelaNutri: TabelaNutri = {
      porcao_g: porcaoTabelaG,
      valor_energetico_kcal: parseNumeroBR(formProduto.tabela_valor_energetico_kcal),
      carboidratos_g: parseNumeroBR(formProduto.tabela_carboidratos_g),
      proteinas_g: parseNumeroBR(formProduto.tabela_proteinas_g),
      gorduras_totais_g: parseNumeroBR(formProduto.tabela_gorduras_totais_g),
      gorduras_saturadas_g: parseNumeroBR(formProduto.tabela_gorduras_saturadas_g),
      gorduras_trans_g: parseNumeroBR(formProduto.tabela_gorduras_trans_g),
      fibra_alimentar_g: parseNumeroBR(formProduto.tabela_fibra_alimentar_g),
      sodio_mg: parseNumeroBR(formProduto.tabela_sodio_mg),
      ingredientes: formProduto.tabela_ingredientes.trim(),
      alergicos: formProduto.tabela_alergicos.trim(),
    };

    const payload = {
      nome: formProduto.nome.trim(),
      tipo_produto: formProduto.tipo_produto,
      disponivel_kit: formProduto.tipo_produto === 'avulso' && formProduto.categoria === 'Marmitas' && formProduto.disponivel_kit,
      plano_config: formProduto.tipo_produto === 'kit' ? formProduto.plano_config : null,
      ativo: formProduto.ativo,
      descricao: formProduto.descricao.trim(),
      preco: parseNumeroBR(formProduto.preco),
      categoria: formProduto.categoria,
      imagem_url: formProduto.imagem_url.trim() || null,
      estoque: Math.round(parseNumeroBR(formProduto.estoque)),
      porcao_g: porcaoProdutoG,
      kcal: parseNumeroBR(formProduto.kcal),
      proteinas: parseNumeroBR(formProduto.proteinas),
      carboidratos: parseNumeroBR(formProduto.carboidratos),
      gorduras: parseNumeroBR(formProduto.gorduras),
      tabela_nutri: tabelaNutri,
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
          .insert([payload])
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

  const salvarVideoExercicio = async (exercicio: ExercicioCatalogo, videoUrl: string, thumbnailUrl: string) => {
    try {
      const { data, error } = await supabase
        .from('exercise_catalog')
        .update({
          video_url: videoUrl.trim() || null,
          video_thumbnail_url: thumbnailUrl.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', exercicio.id)
        .select('id,name,primary_muscle_group,environment,equipment,movement_pattern,technical_level,video_url,video_thumbnail_url,is_active')
        .maybeSingle();
      if (error) throw error;
      const atualizado = exigirLinhaAtualizada(data, 'A alteracao do video do exercicio') as ExercicioCatalogo;
      setExercicios(prev => prev.map(item => item.id === exercicio.id ? atualizado : item));
      toast('Video do exercicio atualizado.', 'sucesso');
    } catch (err: any) {
      toast(`Erro ao salvar video: ${err.message}`, 'erro');
    }
  };

  const alternarExercicioAtivo = async (exercicio: ExercicioCatalogo) => {
    try {
      const { data, error } = await supabase
        .from('exercise_catalog')
        .update({ is_active: !exercicio.is_active, updated_at: new Date().toISOString() })
        .eq('id', exercicio.id)
        .select('id,name,primary_muscle_group,environment,equipment,movement_pattern,technical_level,video_url,video_thumbnail_url,is_active')
        .maybeSingle();
      if (error) throw error;
      const atualizado = exigirLinhaAtualizada(data, 'A alteracao do exercicio') as ExercicioCatalogo;
      setExercicios(prev => prev.map(item => item.id === exercicio.id ? atualizado : item));
      toast('Status do exercicio atualizado.', 'sucesso');
    } catch (err: any) {
      toast(`Erro ao alterar exercicio: ${err.message}`, 'erro');
    }
  };

  const imprimirEtiqueta = (produto: Produto) => {
    if (produto.tipo_produto === 'kit') { toast('Imprima as etiquetas das marmitas individuais do plano.', 'info'); return; }
    const tabela = produto.tabela_nutri ?? null;
    const gramas = Number(tabela?.porcao_g || produto.porcao_g || 100);
    const fatorLegado = gramas / 100;
    const valorNutri = (valor: number | null | undefined, legado: number) => Number(valor ?? legado * fatorLegado);
    const dadosNutri = {
      valor_energetico_kcal: valorNutri(tabela?.valor_energetico_kcal, Number(produto.kcal || 0)),
      carboidratos_g: valorNutri(tabela?.carboidratos_g, Number(produto.carboidratos || 0)),
      proteinas_g: valorNutri(tabela?.proteinas_g, Number(produto.proteinas || 0)),
      gorduras_totais_g: valorNutri(tabela?.gorduras_totais_g, Number(produto.gorduras || 0)),
      gorduras_saturadas_g: Number(tabela?.gorduras_saturadas_g || 0),
      gorduras_trans_g: Number(tabela?.gorduras_trans_g || 0),
      fibra_alimentar_g: Number(tabela?.fibra_alimentar_g || 0),
      sodio_mg: Number(tabela?.sodio_mg || 0),
    };
    const linhaNutri = (rotulo: string, valor: number, unidade: 'g' | 'mg' | 'kcal', vd?: number, casas = 1) => {
      const por100g = gramas > 0 ? (valor * 100) / gramas : 0;
      const percentualVd = vd ? Math.round((valor / vd) * 100) : null;
      return `<tr><td>${escaparHtml(rotulo)}</td><td>${escaparHtml(formatarNumeroBR(por100g, casas))} ${unidade}</td><td>${escaparHtml(formatarNumeroBR(valor, casas))} ${unidade}</td><td>${percentualVd === null ? '**' : escaparHtml(percentualVd)}</td></tr>`;
    };
    const linhasNutri = [
      linhaNutri('Valor energético', dadosNutri.valor_energetico_kcal, 'kcal', 2000, 0),
      linhaNutri('Carboidratos', dadosNutri.carboidratos_g, 'g', 300),
      linhaNutri('Proteínas', dadosNutri.proteinas_g, 'g', 75),
      linhaNutri('Gorduras totais', dadosNutri.gorduras_totais_g, 'g', 55),
      linhaNutri('Gorduras saturadas', dadosNutri.gorduras_saturadas_g, 'g', 22),
      linhaNutri('Gorduras trans', dadosNutri.gorduras_trans_g, 'g'),
      linhaNutri('Fibra alimentar', dadosNutri.fibra_alimentar_g, 'g', 25),
      linhaNutri('Sódio', dadosNutri.sodio_mg, 'mg', 2000, 0),
    ].join('');
    const ingredientes = tabela?.ingredientes?.trim() || 'Não informado.';
    const alergicos = tabela?.alergicos?.trim() || 'ALÉRGICOS: NÃO INFORMADO.';
    const ehCaldo = normalizarBusca(produto.categoria).includes('caldo');
    const alturaEtiqueta = ehCaldo ? 100 : 150;
    const modoPreparo = ehCaldo
      ? 'Modo de preparo: Retire a película de proteção (tampa), e aqueça no micro-ondas por 6 a 8 minutos, pausando na metade do tempo para mexer.'
      : 'Modo de preparo: Faça 4 a 6 furos na película de proteção (tampa), e aqueça no micro-ondas por 5 a 7 minutos (o tempo pode variar conforme a potência do aparelho). Retire totalmente a película de proteção (tampa) e pronto.';
    const payloadQr = JSON.stringify({ id: produto.id, gramas });
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=0&data=${encodeURIComponent(payloadQr)}`;
    const dataFabricacao = new Date();
    const dataValidade = new Date(dataFabricacao);
    dataValidade.setDate(dataValidade.getDate() + 90);
    const ano = dataFabricacao.getFullYear();
    const mes = String(dataFabricacao.getMonth() + 1).padStart(2, '0');
    const dia = String(dataFabricacao.getDate()).padStart(2, '0');
    const lote = `${produto.id}${ano}${mes}${dia}`;
    const fabricacaoBR = dataFabricacao.toLocaleDateString('pt-BR');
    const validadeBR = dataValidade.toLocaleDateString('pt-BR');
    const logoEtiquetaUrl = `${window.location.origin}/viva-leve-etiqueta-pb.png`;
    const janela = window.open('', '_blank', `width=520,height=${ehCaldo ? 620 : 820}`);

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
    @page { size: 100mm ${alturaEtiqueta}mm; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: 100mm;
      height: ${alturaEtiqueta}mm;
      color: #383838;
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: economy;
      print-color-adjust: economy;
    }
    .label {
      width: 100mm;
      height: ${alturaEtiqueta}mm;
      padding: ${ehCaldo ? '3mm' : '4mm'};
      display: grid;
      grid-template-rows: auto auto 1fr auto;
      gap: ${ehCaldo ? '1.2mm' : '2mm'};
      overflow: hidden;
      border: 0.18mm solid #666;
    }
    .header {
      display: grid;
      grid-template-columns: 1fr 20mm;
      align-items: center;
      gap: 3mm;
      border-bottom: 0.15mm solid #777;
      padding-bottom: 1.5mm;
    }
    .brand img {
      display: block;
      width: auto;
      max-width: 66mm;
      height: ${ehCaldo ? '8mm' : '10mm'};
      object-fit: contain;
      opacity: 0.68;
    }
    .qr { width: 15mm; height: 15mm; object-fit: contain; justify-self: end; }
    .name {
      font-size: ${ehCaldo ? '10pt' : '13pt'};
      line-height: 1.05;
      font-weight: 700;
      text-transform: uppercase;
    }
    .weight { margin-top: 0.7mm; font-size: ${ehCaldo ? '7pt' : '8pt'}; font-weight: 700; }
    .content {
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) ${ehCaldo ? '48mm' : '50mm'};
      gap: ${ehCaldo ? '1.8mm' : '3mm'};
    }
    .details { min-width: 0; font-size: ${ehCaldo ? '6pt' : '7pt'}; line-height: 1.15; overflow: hidden; }
    .details p { margin: 0 0 ${ehCaldo ? '1mm' : '1.7mm'}; }
    .details strong { font-weight: 700; }
    .allergens { text-transform: uppercase; font-weight: 700; }
    .nutrition { align-self: start; border: 0.22mm solid #555; background: #fff; color: #303030; }
    .nutrition h2 { margin: 0; padding: 1mm; border-bottom: 0.3mm solid #555; font-size: ${ehCaldo ? '8pt' : '10pt'}; line-height: 1; font-weight: 700; }
    .nutrition-meta { padding: 0.8mm 1mm; border-bottom: 0.18mm solid #666; font-size: ${ehCaldo ? '6pt' : '6.5pt'}; line-height: 1.1; }
    .nutrition table { width: 100%; border-collapse: collapse; font-size: ${ehCaldo ? '6pt' : '6.2pt'}; line-height: 1.05; }
    .nutrition th, .nutrition td { padding: ${ehCaldo ? '0.45mm' : '0.7mm'} 0.6mm; border-bottom: 0.1mm solid #777; text-align: right; vertical-align: middle; }
    .nutrition th:first-child, .nutrition td:first-child { text-align: left; font-weight: 600; }
    .nutrition th { font-weight: 700; }
    .nutrition-note { margin: 0; padding: 0.7mm; font-size: 6pt; line-height: 1.05; }
    .traceability {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5mm 2mm;
      border-top: 0.15mm solid #777;
      padding-top: 1mm;
      font-size: ${ehCaldo ? '5.5pt' : '6.5pt'};
      line-height: 1.1;
      font-weight: 600;
    }
    .traceability .full { grid-column: 1 / -1; }
    .manufacturer { grid-column: 1 / -1; margin-top: 0.5mm; font-size: ${ehCaldo ? '6pt' : '6.5pt'}; line-height: 1.08; font-weight: 600; }
  </style>
</head>
<body>
  <section class="label">
    <header class="header">
      <div class="brand"><img src="${logoEtiquetaUrl}" alt="Viva Leve" /></div>
      <img class="qr" src="${qrUrl}" alt="QR Code do produto" />
    </header>
    <div>
      <div class="name">${escaparHtml(produto.nome)}</div>
      <div class="weight">Peso Líquido: ${escaparHtml(formatarGramas(gramas))}</div>
    </div>
    <div class="content">
      <div class="details">
        ${produto.descricao ? `<p><strong>Descrição:</strong> ${escaparHtml(produto.descricao)}</p>` : ''}
        <p><strong>Ingredientes:</strong> ${escaparHtml(ingredientes)}</p>
        <p class="allergens">${escaparHtml(alergicos)}</p>
        <p><strong>${escaparHtml(modoPreparo)}</strong></p>
        <p><strong>Conservação:</strong> Mantenha congelado a -18°C ou mais frio. Após descongelar, consumir em até 24h e não recongelar.</p>
      </div>
      <section class="nutrition" aria-label="Informação nutricional">
        <h2>INFORMAÇÃO NUTRICIONAL</h2>
        <div class="nutrition-meta">Porções por embalagem: 1<br />Porção: ${escaparHtml(formatarGramas(gramas))}</div>
        <table>
          <thead><tr><th></th><th>100 g</th><th>${escaparHtml(formatarNumeroBR(gramas, 0))} g</th><th>%VD*</th></tr></thead>
          <tbody>${linhasNutri}</tbody>
        </table>
        <p class="nutrition-note">*Percentual de valores diários fornecidos pela porção. **VD não estabelecido.</p>
      </section>
    </div>
    <footer class="traceability">
      <div class="full">Lote: ${escaparHtml(lote)}</div>
      <div>Fabricação: ${escaparHtml(fabricacaoBR)}</div>
      <div>Validade: ${escaparHtml(validadeBR)}</div>
      <div class="manufacturer">
        Razão Social: 62.496.248 LUIZ RICARDO MENDES BRANQUINHO · CNPJ: 62.496.248/0001-42<br />
        Endereço: RUA 91, QUADRA 51, LOTE 5, LOJA 2 - JARDIM CEU AZUL - VALPARAISO DE GOIAS - GO · WhatsApp: (61) 9129-9996
      </div>
    </footer>
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

      <div className="min-h-screen">
        <main className="mx-auto w-full max-w-screen-2xl p-4 md:p-6">
          <header className="relative mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-viva-roxo">Viva Leve Admin</p>
              <h1 className="text-2xl font-black">
                {aba === 'pedidos' ? 'Gestão de Pedidos' : aba === 'balcao' ? 'Venda Balcão' : aba === 'produtos' ? 'Cardápio e Estoque' : aba === 'creditos' ? 'Gestão de Créditos' : aba === 'treinos' ? 'Exercícios e Treinos' : 'Configurações'}
              </h1>
              <p className="text-sm text-gray-500">Dados ao vivo do Supabase oficial.</p>
            </div>

            <div className="relative z-40 shrink-0">
              <button
                type="button"
                onClick={() => setMenuAberto(aberto => !aberto)}
                aria-label={menuAberto ? 'Fechar menu administrativo' : 'Abrir menu administrativo'}
                aria-expanded={menuAberto}
                className="flex h-12 w-12 flex-col items-center justify-center gap-1 rounded-xl bg-white shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-viva-roxo"
              >
                {[0, 1, 2, 3].map(linha => (
                  <span key={linha} className="block h-0.5 w-6 rounded-full bg-gray-900" />
                ))}
              </button>

              {menuAberto && (
                <nav className="absolute right-0 top-14 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-gray-200 bg-white p-2 shadow-2xl">
                  <div className="border-b border-gray-100 px-3 py-2">
                    <p className="text-sm font-black">Menu administrativo</p>
                    <p className="truncate text-xs text-gray-500">{usuarioEmail}</p>
                  </div>

                  <div className="mt-2 space-y-1">
                    {[
                      { id: 'pedidos' as const, label: 'Gestão de Pedidos', desc: `${pedidos.length} pedidos` },
                      { id: 'balcao' as const, label: 'Venda Balcão', desc: 'Pedido rápido' },
                      { id: 'produtos' as const, label: 'Cardápio/Estoque', desc: `${produtos.length} produtos` },
                      { id: 'creditos' as const, label: 'Créditos', desc: `${creditos.length} chaves` },
                      { id: 'treinos' as const, label: 'Exercícios/Treino', desc: `${exercicios.length} exercícios` },
                      { id: 'config' as const, label: 'Configurações', desc: 'Cupons e frete' },
                    ].map(item => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => {
                          setAba(item.id);
                          setMenuAberto(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition ${
                          aba === item.id ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <span className="text-sm font-black">{item.label}</span>
                        <span className={`text-xs font-bold ${aba === item.id ? 'text-gray-300' : 'text-gray-400'}`}>{item.desc}</span>
                      </button>
                    ))}
                  </div>

                  <div className="my-2 border-t border-gray-100" />
                  <Link href="/admin/dashboard" onClick={() => setMenuAberto(false)} className="block rounded-lg bg-purple-50 px-3 py-2.5 text-sm font-black text-viva-roxo transition hover:bg-purple-100">
                    Dashboard
                  </Link>
                  <Link href="/admin/usuarios" onClick={() => setMenuAberto(false)} className="block rounded-lg px-3 py-2.5 text-sm font-black text-viva-roxo transition hover:bg-purple-50">
                    Usuários e Perfis
                  </Link>
                  <Link href="/admin/premium" onClick={() => setMenuAberto(false)} className="block rounded-lg px-3 py-2.5 text-sm font-black text-viva-roxo transition hover:bg-purple-50">Planos & Benefícios</Link>
                  <Link href="/admin/planos" onClick={() => setMenuAberto(false)} className="block rounded-lg px-3 py-2.5 text-sm font-black text-viva-roxo transition hover:bg-purple-50">Planos / Kits vendidos</Link>
                  <Link href="/admin/entregas" onClick={() => setMenuAberto(false)} className="block rounded-lg px-3 py-2.5 text-sm font-black text-viva-roxo transition hover:bg-purple-50">
                    Entregas
                  </Link>
                  <Link href="/admin/financeiro" onClick={() => setMenuAberto(false)} className="block rounded-lg px-3 py-2.5 text-sm font-black text-viva-roxo transition hover:bg-purple-50">
                    Financeiro
                  </Link>
                  <Link href="/admin/planos-nutri" onClick={() => setMenuAberto(false)} className="block rounded-lg px-3 py-2.5 text-sm font-black text-viva-roxo transition hover:bg-purple-50">
                    Planos Nutri
                  </Link>
                  <Link href="/treinador" onClick={() => setMenuAberto(false)} className="block rounded-lg px-3 py-2.5 text-sm font-black text-viva-roxo transition hover:bg-purple-50">
                    Área do Treinador
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuAberto(false);
                      carregarPedidos();
                      carregarProdutos();
                      carregarConfig();
                      carregarCreditos();
                      carregarExercicios();
                    }}
                    className="mt-2 w-full rounded-lg bg-viva-verde px-3 py-2.5 text-sm font-black text-viva-roxo transition hover:brightness-95"
                  >
                    Atualizar dados
                  </button>
                </nav>
              )}
            </div>
          </header>

          {menuAberto && (
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setMenuAberto(false)}
              className="fixed inset-0 z-30 cursor-default bg-black/10"
            />
          )}

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
                        {(pedido.pagamento_status || pedido.mercado_pago_status_detail || pedido.cielo_return_message) && (
                          <div className="mt-3 rounded-lg border border-orange-100 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-800">
                            {nomeMeioPagamento(pedido.meio_pagamento)}: {pedido.pagamento_status || 'sem status'}
                            {pedido.meio_pagamento?.startsWith('cielo_')
                              ? (pedido.cielo_return_message ? ` - ${pedido.cielo_return_message}` : '')
                              : (pedido.mercado_pago_status_detail ? ` - ${pedido.mercado_pago_status_detail}` : '')}
                          </div>
                        )}
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
                        {pedido.checkout_idempotencia && <Link href="/admin/planos" className="rounded-lg bg-viva-roxo px-3 py-2 text-xs font-bold text-white">Gerenciar entregas do plano</Link>}
                        {!pedido.somente_planos && STATUS_FLUXO.map(status => (
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
                    const semEstoque = estoqueDisponivelProduto(produto) <= 0;

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
                                Disp. {estoqueDisponivelProduto(produto)}
                              </span>
                            </div>
                            <p className="mt-2 text-lg font-black text-gray-900">{formatarMoedaBR(produto.preco)}</p>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-2">
                            {quantidade > 0 ? (
                              <div className="flex items-center gap-2">
                                <button type="button" onClick={() => removerProdutoBalcao(produto.id)} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-black text-gray-700">-</button>
                                <span className="w-8 text-center text-sm font-black">{quantidade}</span>
                                <button type="button" onClick={() => adicionarProdutoBalcao(produto)} disabled={quantidade >= estoqueDisponivelProduto(produto)} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-sm font-black text-white disabled:opacity-40">+</button>
                              </div>
                            ) : (
                              <span className="text-xs font-semibold text-gray-400">Fora do carrinho</span>
                            )}
                            <button type="button" onClick={() => adicionarProdutoBalcao(produto)} disabled={semEstoque || quantidade >= estoqueDisponivelProduto(produto)} className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-black text-white hover:bg-gray-800 disabled:opacity-40">
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

          {aba === 'creditos' && (
            <section className="space-y-5">
              <form onSubmit={criarCredito} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-5">
                  <h2 className="text-lg font-black text-gray-900">Criar chave de crédito</h2>
                  <p className="text-xs text-gray-500">O saldo inicial e o saldo disponível serão gravados com o mesmo valor.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Chave</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formCredito.chave}
                        onChange={e => setFormCredito({ ...formCredito, chave: e.target.value.toUpperCase() })}
                        placeholder="Deixe vazio para gerar"
                        className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-bold uppercase text-gray-900 outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <button type="button" title="Gerar chave aleatória" onClick={() => setFormCredito({ ...formCredito, chave: gerarChaveCredito() })} className="rounded-xl bg-gray-100 px-3 text-lg font-black text-gray-700 hover:bg-gray-200">
                        ↻
                      </button>
                    </div>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Valor de origem</span>
                    <input type="text" inputMode="decimal" value={formCredito.valor} onChange={e => setFormCredito({ ...formCredito, valor: e.target.value })} onBlur={e => setFormCredito({ ...formCredito, valor: valorInputBR(e.target.value, 2) })} placeholder="100,00" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900" />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Tipo</span>
                    <select value={formCredito.tipo} onChange={e => setFormCredito({ ...formCredito, tipo: e.target.value as CreditoPagamento['tipo'] })} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-gray-900">
                      {TIPOS_CREDITO.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase text-gray-500">E-mail restrito (opcional)</span>
                    <input type="email" value={formCredito.email} onChange={e => setFormCredito({ ...formCredito, email: e.target.value })} placeholder="cliente@email.com" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900" />
                  </label>
                </div>

                <button disabled={salvandoCredito} className="mt-5 rounded-xl bg-gray-900 px-5 py-3 text-sm font-black text-white shadow-lg hover:bg-gray-800 disabled:opacity-50">
                  {salvandoCredito ? 'Criando...' : 'Criar chave'}
                </button>
              </form>

              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 p-4">
                  <div>
                    <h2 className="font-black text-gray-900">Chaves cadastradas</h2>
                    <p className="text-xs text-gray-500">Saldo utilizável considera reservas de pagamentos ainda pendentes.</p>
                  </div>
                  <button type="button" onClick={carregarCreditos} className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-black text-gray-700 hover:bg-gray-200">Atualizar</button>
                </div>
                {carregandoCreditos ? (
                  <p className="p-6 text-center text-sm text-gray-500">Carregando créditos...</p>
                ) : creditos.length === 0 ? (
                  <p className="p-6 text-center text-sm text-gray-500">Nenhuma chave cadastrada.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr><th className="p-3">Chave</th><th className="p-3">Origem</th><th className="p-3">Disponível</th><th className="p-3">Reservado</th><th className="p-3">Tipo</th><th className="p-3">E-mail</th><th className="p-3">Status</th></tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {creditos.map(credito => {
                          const utilizavel = Math.max(Number(credito.valor_disponivel || 0) - Number(credito.valor_reservado || 0), 0);
                          return (
                            <tr key={credito.id} className="align-middle">
                              <td className="p-3"><button type="button" title="Copiar chave" onClick={() => navigator.clipboard.writeText(credito.chave).then(() => toast('Chave copiada.', 'sucesso'))} className="font-black text-viva-roxo hover:underline">{credito.chave}</button></td>
                              <td className="p-3 font-semibold">{formatarMoedaBR(credito.valor_origem)}</td>
                              <td className="p-3"><span className="font-black text-green-700">{formatarMoedaBR(utilizavel)}</span><span className="block text-[10px] text-gray-400">Saldo: {formatarMoedaBR(credito.valor_disponivel)}</span></td>
                              <td className="p-3">{formatarMoedaBR(credito.valor_reservado)}</td>
                              <td className="p-3">{credito.tipo}</td>
                              <td className="p-3 text-xs">{credito.email_restricao || 'Livre'}</td>
                              <td className="p-3">
                                <button type="button" onClick={() => alternarCredito(credito)} aria-pressed={credito.ativo} className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${credito.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                  <span className={`h-2 w-2 rounded-full ${credito.ativo ? 'bg-green-500' : 'bg-gray-400'}`} />{credito.ativo ? 'Ativo' : 'Inativo'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
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

                <div className="mt-6 border-t border-gray-200 pt-5">
                  <h3 className="text-sm font-black text-gray-900">Meios de pagamento</h3>
                  <p className="mt-1 text-xs text-gray-500">As alteracoes passam a valer no checkout assim que forem salvas.</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {([
                      ['cielo', 'Cielo'],
                      ['mercado_pago', 'Mercado Pago'],
                      ['pix', 'Pix'],
                    ] as const).map(([chave, titulo]) => {
                      const ativo = formConfig.meios_pagamento[chave];
                      return (
                        <label key={chave} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                          <span>
                            <span className="block text-sm font-black text-gray-800">{titulo}</span>
                            <span className={`mt-0.5 block text-xs font-bold ${ativo ? 'text-green-600' : 'text-gray-400'}`}>{ativo ? 'Ativado' : 'Desativado'}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setFormConfig({ ...formConfig, meios_pagamento: { ...formConfig.meios_pagamento, [chave]: !ativo } })}
                            className={`inline-flex h-7 w-12 items-center rounded-full p-1 transition ${ativo ? 'bg-green-500' : 'bg-gray-300'}`}
                            aria-label={`${ativo ? 'Desativar' : 'Ativar'} ${titulo}`}
                            aria-pressed={ativo}
                          >
                            <span className={`h-5 w-5 rounded-full bg-white shadow transition ${ativo ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                        </label>
                      );
                    })}
                  </div>
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

          {aba === 'treinos' && (
            <section className="space-y-5">
              <div className="rounded-xl border border-viva-verde/30 bg-viva-verde/10 p-4">
                <p className="text-sm font-black text-viva-roxo">Catalogo de exercicios</p>
                <p className="mt-1 text-xs font-semibold text-gray-500">
                  A base foi importada da planilha de musculacao. Cadastre aqui os videos demonstrativos curtos e inative exercicios que nao devem ser usados pela geracao do plano.
                </p>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <input
                  type="search"
                  value={filtroExercicio}
                  onChange={e => setFiltroExercicio(e.target.value)}
                  placeholder="Filtrar por exercicio, grupo, ambiente ou equipamento"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-900 shadow-sm outline-none focus:ring-2 focus:ring-gray-900 md:max-w-lg"
                />
                <button onClick={carregarExercicios} className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-black text-white shadow-lg hover:bg-gray-800">
                  Atualizar catalogo
                </button>
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-black">Exercicio</th>
                        <th className="px-4 py-3 text-left font-black">Grupo</th>
                        <th className="px-4 py-3 text-left font-black">Ambiente</th>
                        <th className="px-4 py-3 text-left font-black">Nivel</th>
                        <th className="px-4 py-3 text-left font-black">Video/Thumbnail</th>
                        <th className="px-4 py-3 text-center font-black">Ativo</th>
                        <th className="px-4 py-3 text-right font-black">Acao</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {exerciciosFiltrados.map(exercicio => (
                        <LinhaExercicioAdmin
                          key={exercicio.id}
                          exercicio={exercicio}
                          onSalvarVideo={salvarVideoExercicio}
                          onToggleAtivo={alternarExercicioAtivo}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                {carregandoExercicios && <div className="p-8 text-center text-gray-400">Carregando exercicios...</div>}
                {!carregandoExercicios && exerciciosFiltrados.length === 0 && (
                  <div className="p-8 text-center text-gray-400">
                    {filtroExercicio ? 'Nenhum exercicio encontrado para esse filtro.' : 'Nenhum exercicio cadastrado.'}
                  </div>
                )}
              </div>
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
                        <th className="px-4 py-3 text-center font-black">Estoque físico / reservado / disponível</th>
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
                            <span className={`rounded-full px-3 py-1 text-xs font-black ${estoqueDisponivelProduto(produto) <= 0 ? 'bg-red-100 text-red-700' : estoqueDisponivelProduto(produto) <= 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                              {produto.estoque} / {Number(produto.estoque_reservado ?? 0)} / {estoqueDisponivelProduto(produto)}
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
          enviandoImagem={enviandoImagemProduto}
          onClose={() => setModalProdutoAberto(false)}
          onSubmit={salvarProduto}
          onChange={setFormProduto}
          onUploadImagem={uploadImagemProduto}
        />
      )}
    </div>
  );
}
