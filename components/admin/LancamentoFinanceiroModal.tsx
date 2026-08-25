'use client';

import { FormEvent, useMemo, useState } from 'react';
import { supabase } from '@/supabase';
import {
  CategoriaFinanceira,
  CentroCustoFinanceiro,
  dataISO,
  FORMAS_PAGAMENTO_FINANCEIRO,
  FornecedorFinanceiro,
  normalizarValorBR,
  TipoFinanceiro,
  TIPOS_FINANCEIROS,
} from '@/lib/financeiro';

interface Props {
  categorias: CategoriaFinanceira[];
  centros: CentroCustoFinanceiro[];
  fornecedores: FornecedorFinanceiro[];
  onClose: () => void;
  onSuccess: (mensagem: string) => void;
}

const inputClass = 'mt-1 h-11 w-full border border-gray-300 bg-white px-3 text-sm outline-none transition focus:border-viva-roxo focus:ring-1 focus:ring-viva-roxo';
const labelClass = 'text-xs font-black uppercase text-gray-600';

export default function LancamentoFinanceiroModal({ categorias, centros, fornecedores, onClose, onSuccess }: Props) {
  const [tipo, setTipo] = useState<TipoFinanceiro>('insumo');
  const [categoriaId, setCategoriaId] = useState('');
  const [centroId, setCentroId] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [novoFornecedor, setNovoFornecedor] = useState(false);
  const [fornecedorNome, setFornecedorNome] = useState('');
  const [fornecedorDocumento, setFornecedorDocumento] = useState('');
  const [fornecedorTelefone, setFornecedorTelefone] = useState('');
  const [fornecedorObservacao, setFornecedorObservacao] = useState('');
  const [descricao, setDescricao] = useState('');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [dataCompra, setDataCompra] = useState(dataISO());
  const [primeiroVencimento, setPrimeiroVencimento] = useState(dataISO());
  const [dataPagamento, setDataPagamento] = useState(dataISO());
  const [valor, setValor] = useState('');
  const [forma, setForma] = useState('pix');
  const [condicao, setCondicao] = useState<'avista' | 'parcelado'>('avista');
  const [parcelas, setParcelas] = useState('2');
  const [status, setStatus] = useState<'pendente' | 'pago'>('pendente');
  const [observacoes, setObservacoes] = useState('');
  const [recorrente, setRecorrente] = useState(false);
  const [frequencia, setFrequencia] = useState<'semanal' | 'mensal' | 'anual'>('mensal');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const categoriasDisponiveis = useMemo(
    () => categorias.filter(item => item.ativo && item.tipo === tipo),
    [categorias, tipo],
  );

  async function salvar(event: FormEvent) {
    event.preventDefault();
    setErro('');
    const valorNumerico = normalizarValorBR(valor);
    const categoria = categoriaId || categoriasDisponiveis[0]?.id;

    if (!descricao.trim() || !categoria || valorNumerico <= 0) {
      setErro('Preencha descrição, categoria e um valor maior que zero.');
      return;
    }

    setSalvando(true);
    let anexoPath: string | null = null;

    try {
      let fornecedorSelecionado = fornecedorId || null;
      if (novoFornecedor) {
        if (!fornecedorNome.trim()) throw new Error('Informe o nome ou razão social do fornecedor.');
        const { data, error } = await supabase
          .from('financeiro_fornecedores')
          .insert({
            nome_razao_social: fornecedorNome.trim(),
            cpf_cnpj: fornecedorDocumento.trim() || null,
            telefone: fornecedorTelefone.trim() || null,
            observacao: fornecedorObservacao.trim() || null,
          })
          .select('id')
          .single();
        if (error) throw error;
        fornecedorSelecionado = data.id;
      }

      if (arquivo) {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw authError ?? new Error('Sessão expirada.');
        const nomeSeguro = arquivo.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-');
        anexoPath = `${authData.user.id}/${crypto.randomUUID()}-${nomeSeguro}`;
        const { error } = await supabase.storage.from('financeiro-documentos').upload(anexoPath, arquivo, { upsert: false });
        if (error) throw error;
      }

      const { error } = await supabase.rpc('criar_lancamento_financeiro', {
        p_tipo: tipo,
        p_categoria_id: categoria,
        p_centro_custo_id: centroId || null,
        p_fornecedor_id: fornecedorSelecionado,
        p_descricao: descricao.trim(),
        p_numero_documento: numeroDocumento.trim() || null,
        p_data_compra: dataCompra,
        p_primeiro_vencimento: primeiroVencimento,
        p_data_pagamento: status === 'pago' ? dataPagamento : null,
        p_valor_total: valorNumerico,
        p_forma_pagamento: forma,
        p_condicao_pagamento: condicao,
        p_quantidade_parcelas: condicao === 'parcelado' ? Math.max(2, Number(parcelas) || 2) : 1,
        p_status: status,
        p_observacoes: observacoes.trim() || null,
        p_anexo_path: anexoPath,
        p_recorrente: recorrente,
        p_frequencia_recorrencia: recorrente ? frequencia : null,
      });
      if (error) throw error;

      onSuccess(condicao === 'parcelado' ? 'Lançamento e parcelas criados com sucesso.' : 'Lançamento criado com sucesso.');
    } catch (err) {
      if (anexoPath) await supabase.storage.from('financeiro-documentos').remove([anexoPath]);
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar o lançamento.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/55 p-3 md:p-8" role="dialog" aria-modal="true" aria-label="Novo lançamento financeiro">
      <form onSubmit={salvar} className="mx-auto w-full max-w-4xl bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-4 md:px-6">
          <div>
            <p className="text-xs font-black uppercase text-viva-roxo">Financeiro</p>
            <h2 className="text-xl font-black">Novo lançamento</h2>
          </div>
          <button type="button" onClick={onClose} className="h-10 w-10 text-2xl font-bold text-gray-500 hover:bg-gray-100" aria-label="Fechar">×</button>
        </header>

        <div className="space-y-6 p-4 md:p-6">
          {erro && <p className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{erro}</p>}

          <div className="grid gap-4 md:grid-cols-3">
            <label className={labelClass}>Tipo
              <select value={tipo} onChange={e => { setTipo(e.target.value as TipoFinanceiro); setCategoriaId(''); }} className={inputClass}>
                {TIPOS_FINANCEIROS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className={labelClass}>Categoria
              <select required value={categoriaId} onChange={e => setCategoriaId(e.target.value)} className={inputClass}>
                <option value="">Selecione</option>
                {categoriasDisponiveis.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}
              </select>
            </label>
            <label className={labelClass}>Centro de custo
              <select value={centroId} onChange={e => setCentroId(e.target.value)} className={inputClass}>
                <option value="">Não informado</option>
                {centros.filter(item => item.ativo).map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className={labelClass}>Descrição
              <input required value={descricao} onChange={e => setDescricao(e.target.value)} className={inputClass} placeholder="Ex.: Compra de embalagens" />
            </label>
            <label className={labelClass}>Nota ou documento
              <input value={numeroDocumento} onChange={e => setNumeroDocumento(e.target.value)} className={inputClass} placeholder="Opcional" />
            </label>
          </div>

          <section className="border-y border-gray-200 py-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black">Fornecedor</p>
              <button type="button" onClick={() => setNovoFornecedor(valor => !valor)} className="text-sm font-black text-viva-roxo hover:underline">
                {novoFornecedor ? 'Selecionar existente' : '+ Cadastro rápido'}
              </button>
            </div>
            {novoFornecedor ? (
              <div className="grid gap-4 md:grid-cols-2">
                <label className={labelClass}>Nome / Razão social<input value={fornecedorNome} onChange={e => setFornecedorNome(e.target.value)} className={inputClass} /></label>
                <label className={labelClass}>CPF / CNPJ<input value={fornecedorDocumento} onChange={e => setFornecedorDocumento(e.target.value)} className={inputClass} /></label>
                <label className={labelClass}>Telefone<input value={fornecedorTelefone} onChange={e => setFornecedorTelefone(e.target.value)} className={inputClass} /></label>
                <label className={labelClass}>Observação<input value={fornecedorObservacao} onChange={e => setFornecedorObservacao(e.target.value)} className={inputClass} /></label>
              </div>
            ) : (
              <select value={fornecedorId} onChange={e => setFornecedorId(e.target.value)} className={inputClass}>
                <option value="">Sem fornecedor</option>
                {fornecedores.filter(item => item.ativo).map(item => <option key={item.id} value={item.id}>{item.nome_razao_social}</option>)}
              </select>
            )}
          </section>

          <div className="grid gap-4 md:grid-cols-4">
            <label className={labelClass}>Data da compra<input type="date" value={dataCompra} onChange={e => setDataCompra(e.target.value)} className={inputClass} /></label>
            <label className={labelClass}>Primeiro vencimento<input type="date" value={primeiroVencimento} onChange={e => setPrimeiroVencimento(e.target.value)} className={inputClass} /></label>
            <label className={labelClass}>Valor total<input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} className={inputClass} placeholder="0,00" /></label>
            <label className={labelClass}>Forma de pagamento
              <select value={forma} onChange={e => setForma(e.target.value)} className={inputClass}>
                {FORMAS_PAGAMENTO_FINANCEIRO.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <label className={labelClass}>Condição
              <select value={condicao} onChange={e => setCondicao(e.target.value as 'avista' | 'parcelado')} className={inputClass}>
                <option value="avista">À vista</option><option value="parcelado">Parcelado</option>
              </select>
            </label>
            {condicao === 'parcelado' && <label className={labelClass}>Quantidade de parcelas<input type="number" min="2" max="120" value={parcelas} onChange={e => setParcelas(e.target.value)} className={inputClass} /></label>}
            <label className={labelClass}>Status
              <select value={status} onChange={e => setStatus(e.target.value as 'pendente' | 'pago')} className={inputClass}>
                <option value="pendente">Pendente</option><option value="pago">Pago</option>
              </select>
            </label>
            {status === 'pago' && <label className={labelClass}>Data do pagamento<input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} className={inputClass} /></label>}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className={labelClass}>Comprovante / nota fiscal
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setArquivo(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm file:mr-3 file:border-0 file:bg-gray-900 file:px-4 file:py-3 file:font-bold file:text-white" />
            </label>
            <label className={labelClass}>Observações<textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={3} className="mt-1 w-full border border-gray-300 p-3 text-sm outline-none focus:border-viva-roxo" /></label>
          </div>

          <div className="flex flex-wrap items-center gap-4 border-y border-gray-200 py-4">
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={recorrente} onChange={e => setRecorrente(e.target.checked)} className="h-5 w-5 accent-viva-roxo" />Despesa recorrente</label>
            {recorrente && (
              <select value={frequencia} onChange={e => setFrequencia(e.target.value as 'semanal' | 'mensal' | 'anual')} className="h-10 border border-gray-300 px-3 text-sm">
                <option value="semanal">Semanal</option><option value="mensal">Mensal</option><option value="anual">Anual</option>
              </select>
            )}
            <p className="text-xs text-gray-500">A próxima recorrência fica registrada para automação em uma segunda fase.</p>
          </div>
        </div>

        <footer className="sticky bottom-0 flex justify-end gap-3 border-t border-gray-200 bg-white px-4 py-4 md:px-6">
          <button type="button" onClick={onClose} className="h-11 border border-gray-300 px-5 text-sm font-black text-gray-700">Cancelar</button>
          <button disabled={salvando} className="h-11 bg-viva-verde px-6 text-sm font-black text-viva-roxo disabled:opacity-50">{salvando ? 'Salvando...' : 'Salvar lançamento'}</button>
        </footer>
      </form>
    </div>
  );
}
