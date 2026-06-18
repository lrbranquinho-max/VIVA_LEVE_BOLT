"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../supabase';

interface RequisicaoPlano {
  id: string;
  user_id: string;
  objetivo: string;
  receita_url?: string | null;
  preferencias: any;
  padrao_refeicoes: any;
  status: string;
  criado_em: string;
}

function formatarData(valor?: string) {
  return valor ? new Date(valor).toLocaleString('pt-BR') : '-';
}

function pretty(valor: any) {
  return JSON.stringify(valor ?? {}, null, 2);
}

function calcularMetaPlano(plano: any) {
  return Number(plano?.kcal_diaria_meta ?? 2000);
}

export default function AdminPlanosNutriPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [usuarioEmail, setUsuarioEmail] = useState('');
  const [requisicoes, setRequisicoes] = useState<RequisicaoPlano[]>([]);
  const [selecionada, setSelecionada] = useState<RequisicaoPlano | null>(null);
  const [perfis, setPerfis] = useState<Record<string, any>>({});
  const [clientes, setClientes] = useState<Record<string, any>>({});
  const [editorJson, setEditorJson] = useState('');
  const [gerando, setGerando] = useState(false);
  const [aprovando, setAprovando] = useState(false);
  const [modoGeracao, setModoGeracao] = useState<'manual' | 'automatico'>('manual');
  const [salvandoModo, setSalvandoModo] = useState(false);
  const [toast, setToast] = useState('');

  const carregar = useCallback(async () => {
    try {
      const [{ data, error }, { data: configData }] = await Promise.all([
        supabase
        .from('planos_requisicoes')
        .select('*')
        .eq('status', 'pendente')
          .order('criado_em', { ascending: false }),
        supabase
          .from('app_config')
          .select('valor')
          .eq('chave', 'plano_nutri_modo')
          .maybeSingle(),
      ]);
      if (error) throw error;
      setModoGeracao((configData?.valor as any)?.modo === 'automatico' ? 'automatico' : 'manual');

      const lista = (data ?? []) as RequisicaoPlano[];
      setRequisicoes(lista);

      const ids = Array.from(new Set(lista.map(item => item.user_id)));
      if (ids.length > 0) {
        const [perfisRes, clientesRes] = await Promise.all([
          supabase.from('perfis').select('*').in('id', ids),
          supabase.from('perfis_clientes').select('*').in('id', ids),
        ]);

        if (!perfisRes.error) {
          setPerfis(Object.fromEntries((perfisRes.data ?? []).map((item: any) => [item.id, item])));
        }
        if (!clientesRes.error) {
          setClientes(Object.fromEntries((clientesRes.data ?? []).map((item: any) => [item.id, item])));
        }
      }
    } catch (err: any) {
      setToast(`Erro ao carregar planos: ${err.message}`);
    }
  }, []);

  useEffect(() => {
    async function proteger() {
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
      await carregar();
    }
    proteger();
  }, [router, carregar]);

  const perfilSelecionado = selecionada ? perfis[selecionada.user_id] : null;
  const clienteSelecionado = selecionada ? clientes[selecionada.user_id] : null;

  const totalPendentes = useMemo(() => requisicoes.length, [requisicoes]);

  const abrirDetalhe = async (req: RequisicaoPlano) => {
    setSelecionada(req);
    setEditorJson('');
    if (req.status === 'pendente') {
      await supabase.from('planos_requisicoes').update({ status: 'em_revisao' }).eq('id', req.id);
      setRequisicoes(prev => prev.filter(item => item.id !== req.id));
      setSelecionada({ ...req, status: 'em_revisao' });
    }
  };

  const alterarModoGeracao = async () => {
    const proximo = modoGeracao === 'manual' ? 'automatico' : 'manual';
    setSalvandoModo(true);
    try {
      const { error } = await supabase
        .from('app_config')
        .update({ valor: { modo: proximo } })
        .eq('chave', 'plano_nutri_modo');
      if (error) throw error;
      setModoGeracao(proximo);
      setToast(proximo === 'automatico' ? 'Modo automatico ativado.' : 'Modo de aprovacao manual ativado.');
    } catch (err: any) {
      setToast(`Erro ao alterar modo: ${err.message}`);
    } finally {
      setSalvandoModo(false);
    }
  };

  const gerarRascunho = async () => {
    if (!selecionada) return;
    setGerando(true);
    setToast('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessao expirada.');

      const resposta = await fetch('/api/gerar-plano-nutri', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ requisicaoId: selecionada.id }),
      });
      const json = await resposta.json();
      if (!resposta.ok) throw new Error(json.error || 'Erro ao gerar rascunho.');

      setEditorJson(pretty(json.plano));
      setToast(json.aviso || 'Rascunho gerado. Revise antes de enviar ao cliente.');
      await carregar();
    } catch (err: any) {
      setToast(`Erro ao gerar rascunho: ${err.message}`);
    } finally {
      setGerando(false);
    }
  };

  const aprovarPlano = async () => {
    if (!selecionada) return;
    setAprovando(true);
    try {
      const plano = JSON.parse(editorJson);
      const { error: insertError } = await supabase.from('planos_gerados').insert([{
        user_id: selecionada.user_id,
        requisicao_id: selecionada.id,
        data_plano: new Date().toISOString().slice(0, 10),
        objetivo_estabelecido: plano.objetivo_estabelecido ?? selecionada.objetivo,
        kcal_diaria_meta: calcularMetaPlano(plano),
        plano_semanal: plano.dias ?? plano.plano_semanal ?? plano,
      }]);
      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from('planos_requisicoes')
        .update({ status: 'concluido' })
        .eq('id', selecionada.id);
      if (updateError) throw updateError;

      setToast('Plano aprovado e enviado para o cliente.');
      setSelecionada(null);
      setEditorJson('');
      await carregar();
    } catch (err: any) {
      setToast(`Erro ao aprovar plano: ${err.message}`);
    } finally {
      setAprovando(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-gray-100 text-sm font-bold text-gray-500">Carregando admin...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      {toast && (
        <button onClick={() => setToast('')} className="fixed right-4 top-4 z-50 max-w-sm rounded-xl bg-gray-900 px-4 py-3 text-left text-sm font-bold text-white shadow-xl">
          {toast}
        </button>
      )}

      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <Link href="/admin" className="text-xs font-black uppercase text-viva-roxo">Voltar ao admin</Link>
            <h1 className="mt-1 text-3xl font-black">Planos Nutri</h1>
            <p className="text-sm text-gray-500">{usuarioEmail}</p>
          </div>
          <button onClick={carregar} className="rounded-xl bg-white px-4 py-3 text-sm font-black text-gray-700 shadow-sm ring-1 ring-gray-200">
            Atualizar
          </button>
        </header>

        <section className="mb-6 rounded-xl bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Modo de Geracao</p>
              <p className="mt-1 text-lg font-black">{modoGeracao === 'automatico' ? 'Automatico na hora' : 'Aprovacao Manual'}</p>
              <p className="mt-1 text-xs font-semibold text-gray-500">
                {modoGeracao === 'automatico'
                  ? 'O cliente recebe o plano assim que solicita, sem passar pela fila.'
                  : 'A tela lista somente pedidos ainda pendentes de revisao.'}
              </p>
            </div>
            <button
              type="button"
              onClick={alterarModoGeracao}
              disabled={salvandoModo}
              className={`flex w-full items-center justify-between rounded-full p-1 text-xs font-black md:w-64 ${modoGeracao === 'automatico' ? 'bg-viva-verde text-viva-roxo' : 'bg-gray-200 text-gray-700'} disabled:opacity-60`}
            >
              <span className={`rounded-full px-4 py-2 ${modoGeracao === 'manual' ? 'bg-white shadow-sm' : ''}`}>Manual</span>
              <span className={`rounded-full px-4 py-2 ${modoGeracao === 'automatico' ? 'bg-white shadow-sm' : ''}`}>Automatico</span>
            </button>
          </div>
          <div className="mt-4 border-t border-gray-100 pt-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Fila de solicitacoes pendentes</p>
            <p className="mt-1 text-2xl font-black">{totalPendentes}</p>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left font-black">Cliente</th>
                  <th className="px-4 py-3 text-left font-black">Objetivo</th>
                  <th className="px-4 py-3 text-left font-black">Status</th>
                  <th className="px-4 py-3 text-left font-black">Data</th>
                  <th className="px-4 py-3 text-right font-black">Acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requisicoes.map(req => (
                  <tr key={req.id}>
                    <td className="px-4 py-3 font-bold">{perfis[req.user_id]?.nome ?? clientes[req.user_id]?.nome_completo ?? req.user_id.slice(0, 8)}</td>
                    <td className="px-4 py-3">{req.objetivo}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black">{req.status}</span></td>
                    <td className="px-4 py-3 text-gray-500">{formatarData(req.criado_em)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => abrirDetalhe(req)} className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-black text-white">Revisar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {requisicoes.length === 0 && <div className="p-10 text-center text-sm font-bold text-gray-400">Nenhuma solicitacao encontrada.</div>}
          </section>

          <aside className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            {!selecionada ? (
              <div className="py-16 text-center text-gray-400">
                <p className="text-3xl">VL</p>
                <p className="mt-2 text-sm font-bold">Selecione uma solicitacao para revisar.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-black uppercase text-gray-400">Cliente</p>
                  <h2 className="text-xl font-black">{perfilSelecionado?.nome ?? clienteSelecionado?.nome_completo ?? selecionada.user_id}</h2>
                  <p className="text-xs text-gray-500">{perfilSelecionado?.telefone ?? clienteSelecionado?.telefone ?? 'Telefone nao informado'}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-gray-50 p-3"><p className="font-black text-gray-400">Objetivo</p><p className="font-bold">{selecionada.objetivo}</p></div>
                  <div className="rounded-xl bg-gray-50 p-3"><p className="font-black text-gray-400">Status</p><p className="font-bold">{selecionada.status}</p></div>
                  <div className="rounded-xl bg-gray-50 p-3"><p className="font-black text-gray-400">Peso</p><p className="font-bold">{clienteSelecionado?.peso_kg ?? '-'}</p></div>
                  <div className="rounded-xl bg-gray-50 p-3"><p className="font-black text-gray-400">Altura</p><p className="font-bold">{clienteSelecionado?.altura_cm ?? '-'}</p></div>
                </div>

                {selecionada.receita_url && (
                  <a href={selecionada.receita_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-gray-100">
                    <img src={selecionada.receita_url} alt="Receita anexada" className="max-h-64 w-full object-cover" />
                  </a>
                )}

                <details className="rounded-xl bg-gray-50 p-3 text-xs">
                  <summary className="cursor-pointer font-black text-gray-600">Preferencias e refeicoes</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-[11px] text-gray-600">{pretty({ preferencias: selecionada.preferencias, padrao_refeicoes: selecionada.padrao_refeicoes })}</pre>
                </details>

                <button onClick={gerarRascunho} disabled={gerando} className="w-full rounded-xl bg-viva-roxo px-4 py-3 text-sm font-black text-white disabled:opacity-60">
                  {gerando ? 'Gerando rascunho...' : 'Gerar Rascunho com IA'}
                </button>

                <label>
                  <span className="mb-1 block text-xs font-black uppercase text-gray-500">Editor JSON do plano</span>
                  <textarea value={editorJson} onChange={e => setEditorJson(e.target.value)} rows={18} className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-800 outline-none focus:ring-2 focus:ring-viva-roxo" placeholder="Gere um rascunho com IA ou cole o JSON revisado aqui." />
                </label>

                <button onClick={aprovarPlano} disabled={aprovando || !editorJson.trim()} className="w-full rounded-xl bg-viva-verde px-4 py-3 text-sm font-black text-viva-roxo disabled:opacity-60">
                  {aprovando ? 'Enviando...' : 'Aprovar e Enviar para o Cliente'}
                </button>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
