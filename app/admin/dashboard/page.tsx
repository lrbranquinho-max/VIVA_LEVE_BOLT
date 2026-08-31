'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/supabase';

interface Periodos { total: number; ultimos7Dias: number; ultimas24Horas: number }
interface DashboardDados {
  atualizadoEm: string;
  clientes: Periodos;
  acessosLoja: { ultimas24Horas: number };
  pedidos24h: { pendente: number; recusado: number; concluido: number };
  planoNutri: Periodos;
  plataformaTreino: Periodos;
}

const numero = new Intl.NumberFormat('pt-BR');

function Card({ titulo, valor, detalhe, tom = 'roxo' }: { titulo: string; valor: number; detalhe: string; tom?: 'roxo' | 'verde' | 'azul' | 'amarelo' | 'vermelho' }) {
  const tons = {
    roxo: 'border-viva-roxo bg-purple-50 text-viva-roxo',
    verde: 'border-emerald-500 bg-emerald-50 text-emerald-700',
    azul: 'border-sky-500 bg-sky-50 text-sky-700',
    amarelo: 'border-amber-500 bg-amber-50 text-amber-700',
    vermelho: 'border-red-500 bg-red-50 text-red-700',
  };
  return (
    <article className={`border-l-4 p-4 shadow-sm ${tons[tom]}`}>
      <p className="text-xs font-black uppercase tracking-wide text-gray-500">{titulo}</p>
      <p className="mt-2 text-3xl font-black" aria-label={`${titulo}: ${numero.format(valor)}`}>{numero.format(valor)}</p>
      <p className="mt-1 text-xs font-bold text-gray-500">{detalhe}</p>
    </article>
  );
}

function GraficoBarras({ titulo, itens }: { titulo: string; itens: { rotulo: string; valor: number; cor: string }[] }) {
  const maximo = Math.max(1, ...itens.map(item => item.valor));
  const total = itens.reduce((soma, item) => soma + item.valor, 0);
  return (
    <section className="border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-black text-gray-900">{titulo}</h2>
      <div className="mt-5 space-y-4">
        {itens.map(item => (
          <div key={item.rotulo}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
              <span className="font-bold text-gray-600">{item.rotulo}</span>
              <span className="font-black text-gray-900">{numero.format(item.valor)}{total ? ` · ${Math.round(item.valor / total * 100)}%` : ''}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${item.rotulo}: ${numero.format(item.valor)}`}>
              <div className={`h-full rounded-full ${item.cor}`} style={{ width: `${item.valor ? Math.max(4, item.valor / maximo * 100) : 0}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Adocao({ titulo, dados, cor }: { titulo: string; dados: Periodos; cor: string }) {
  const itens = [
    { rotulo: 'Total', valor: dados.total },
    { rotulo: 'Últimos 7 dias', valor: dados.ultimos7Dias },
    { rotulo: 'Últimas 24 horas', valor: dados.ultimas24Horas },
  ];
  const maximo = Math.max(1, ...itens.map(item => item.valor));
  return (
    <section className="border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-black text-gray-900">{titulo}</h2>
      <div className="mt-5 space-y-4">
        {itens.map(item => (
          <div key={item.rotulo} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3 text-xs">
            <span className="font-bold text-gray-600">{item.rotulo}</span>
            <div className="h-3 overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full ${cor}`} style={{ width: `${item.valor ? Math.max(4, item.valor / maximo * 100) : 0}%` }} />
            </div>
            <span className="text-right font-black text-gray-900">{numero.format(item.valor)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function DashboardAdminPage() {
  const router = useRouter();
  const [dados, setDados] = useState<DashboardDados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setErro('');
    setCarregando(true);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao.session?.access_token;
      if (!token) { router.replace('/login'); return; }
      const resposta = await fetch('/api/admin/dashboard', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.error || 'Não foi possível carregar os indicadores.');
      setDados(corpo as DashboardDados);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível carregar os indicadores.');
    } finally { setCarregando(false); }
  }, [router]);

  useEffect(() => {
    async function iniciar() {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) { router.replace('/login'); return; }
      const { data: admin, error: adminError } = await supabase.rpc('is_viva_leve_admin');
      if (adminError || !admin) { router.replace('/login'); return; }
      await carregar();
    }
    void iniciar();
  }, [carregar, router]);

  const totalPedidos = useMemo(() => dados ? Object.values(dados.pedidos24h).reduce((soma, valor) => soma + valor, 0) : 0, [dados]);

  return (
    <main className="min-h-screen bg-gray-50 pb-12">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 md:px-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-viva-roxo">Viva Leve Admin</p>
            <h1 className="mt-1 text-2xl font-black text-gray-950">Dashboard operacional</h1>
            <p className="mt-1 text-sm text-gray-500">Indicadores ao vivo do Supabase oficial.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin" className="border border-gray-300 bg-white px-4 py-2 text-sm font-black text-gray-700 hover:bg-gray-50">Voltar ao admin</Link>
            <button type="button" onClick={() => void carregar()} disabled={carregando} className="bg-viva-roxo px-4 py-2 text-sm font-black text-white disabled:opacity-50">
              {carregando ? 'Atualizando…' : 'Atualizar dados'}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 px-4 py-7 md:px-6">
        {erro && <div className="border-l-4 border-red-500 bg-red-50 p-4 text-sm font-bold text-red-800">{erro}</div>}
        {carregando && !dados && <div className="py-24 text-center text-sm font-bold text-gray-500">Carregando indicadores…</div>}
        {dados && (
          <>
            <section>
              <div className="mb-4 flex items-end justify-between gap-4">
                <div><h2 className="text-lg font-black text-gray-950">Clientes e alcance</h2><p className="text-sm text-gray-500">Perfis cadastrados e sessões da loja.</p></div>
                <p className="text-xs font-bold text-gray-400">Atualizado em {new Date(dados.atualizadoEm).toLocaleString('pt-BR')}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card titulo="Perfis de clientes" valor={dados.clientes.total} detalhe="Total cadastrado" />
                <Card titulo="Novos clientes" valor={dados.clientes.ultimos7Dias} detalhe="Últimos 7 dias" tom="azul" />
                <Card titulo="Novos clientes" valor={dados.clientes.ultimas24Horas} detalhe="Últimas 24 horas" tom="verde" />
                <Card titulo="Acessos à loja" valor={dados.acessosLoja.ultimas24Horas} detalhe="Sessões únicas nas últimas 24 horas" tom="amarelo" />
              </div>
            </section>

            <section>
              <div className="mb-4"><h2 className="text-lg font-black text-gray-950">Pedidos iniciados nas últimas 24 horas</h2><p className="text-sm text-gray-500">Pedidos-raiz da loja online, classificados pelo status do pagamento.</p></div>
              <div className="grid gap-4 md:grid-cols-3">
                <Card titulo="Pagamento pendente" valor={dados.pedidos24h.pendente} detalhe={`de ${numero.format(totalPedidos)} pedidos`} tom="amarelo" />
                <Card titulo="Pagamento recusado" valor={dados.pedidos24h.recusado} detalhe={`de ${numero.format(totalPedidos)} pedidos`} tom="vermelho" />
                <Card titulo="Pagamento concluído" valor={dados.pedidos24h.concluido} detalhe={`de ${numero.format(totalPedidos)} pedidos`} tom="verde" />
              </div>
              <div className="mt-4">
                <GraficoBarras titulo="Distribuição dos pagamentos" itens={[
                  { rotulo: 'Pendente', valor: dados.pedidos24h.pendente, cor: 'bg-amber-500' },
                  { rotulo: 'Recusado', valor: dados.pedidos24h.recusado, cor: 'bg-red-500' },
                  { rotulo: 'Concluído', valor: dados.pedidos24h.concluido, cor: 'bg-emerald-500' },
                ]} />
              </div>
            </section>

            <section>
              <div className="mb-4"><h2 className="text-lg font-black text-gray-950">Uso dos produtos digitais</h2><p className="text-sm text-gray-500">Usuários distintos por período.</p></div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Adocao titulo="Plano Nutri" dados={dados.planoNutri} cor="bg-viva-verde" />
                <Adocao titulo="Plataforma de treino" dados={dados.plataformaTreino} cor="bg-viva-roxo" />
              </div>
            </section>

            <p className="border-t border-gray-200 pt-4 text-xs leading-5 text-gray-500">
              Janelas de 24 horas e 7 dias são móveis. Um acesso corresponde a uma sessão do navegador; não são armazenados IP, localização ou agente do navegador.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
