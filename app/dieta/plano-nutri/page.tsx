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
  kcal: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  produto_id?: number | null;
}

interface DiaPlano {
  dia: string;
  refeicoes: RefeicaoPlano[];
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
      kcal: Number(item.kcal ?? 0),
      proteinas: Number(item.proteinas ?? item.prot ?? 0),
      carboidratos: Number(item.carboidratos ?? item.carb ?? 0),
      gorduras: Number(item.gorduras ?? item.gord ?? 0),
      produto_id: item.produto_id ? Number(item.produto_id) : null,
    })),
  }));
}

export default function PlanoNutriPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [clienteId, setClienteId] = useState('');
  const [plano, setPlano] = useState<PlanoGerado | null>(null);
  const [pendente, setPendente] = useState<PlanoRequisicao | null>(null);
  const [diaAberto, setDiaAberto] = useState(0);
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
    if (!window.confirm('Deseja registrar esta refeicao agora?')) return;

    try {
      const gramas = Number(String(item.porcao).replace(/\D/g, '')) || 100;
      const { error } = await supabase.from('historico_refeicoes').insert([{
        cliente_id: clienteId,
        data_consumo: hojeLocal(),
        tipo_refeicao: item.refeicao,
        nome_alimento: item.nome,
        gramas,
        kcal: item.kcal,
        proteinas: item.proteinas,
        carboidratos: item.carboidratos,
        gorduras: item.gorduras,
      }]);
      if (error) throw error;
      setToast('Refeicao registrada no diario de hoje.');
      window.setTimeout(() => setToast(''), 3500);
    } catch (err: any) {
      setToast(`Erro ao registrar refeicao: ${err.message}`);
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
            <Link href="/dieta" className="mt-4 inline-flex rounded-xl bg-viva-roxo px-4 py-3 text-xs font-black text-white">
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
                        <button key={`${item.nome}-${itemIndex}`} type="button" onClick={() => registrarRefeicao(item)} className="w-full rounded-xl bg-gray-50 p-4 text-left">
                          <p className="text-xs font-black uppercase text-viva-roxo">{item.refeicao}</p>
                          <h3 className="mt-1 text-sm font-black text-gray-900">{item.nome} {item.porcao ? `(${item.porcao})` : ''}</h3>
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

      <nav className="fixed bottom-0 z-10 flex w-full max-w-md justify-around border-t border-gray-200 bg-white p-3 pb-5">
        <Link href="/" className="flex flex-col items-center text-gray-400 hover:text-viva-roxo"><span className="text-xl">&#127968;</span><span className="mt-1 text-[10px] font-bold">Loja</span></Link>
        <Link href="/pedidos" className="flex flex-col items-center text-gray-400 hover:text-viva-roxo"><span className="text-xl">&#128203;</span><span className="mt-1 text-[10px] font-bold">Pedidos</span></Link>
        <Link href="/dieta" className="flex flex-col items-center text-viva-roxo"><span className="text-xl">&#128241;</span><span className="mt-1 text-[10px] font-bold">Dieta</span></Link>
        <Link href="/perfil" className="flex flex-col items-center text-gray-400 hover:text-viva-roxo"><span className="text-xl">&#128100;</span><span className="mt-1 text-[10px] font-bold">Perfil</span></Link>
      </nav>
    </div>
  );
}
