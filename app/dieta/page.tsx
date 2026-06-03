"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../../supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '../../components/Logo';

interface DiarioDieta {
  id: number;
  cliente_id: string;
  data: string;
  kcal_consumidas: number;
  proteinas_g: number;
  carbos_g: number;
  gorduras_g: number;
}

interface SugestaoAlimento {
  nome: string;
  kcal: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  fonte: 'produto' | 'taco';
  por100g?: boolean;
}

const METAS_DIARIAS = {
  kcal: 2000,
  proteinas: 150,
  carboidratos: 225,
  gorduras: 65,
};

export default function Dieta() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [clienteId, setClienteId] = useState<string | null>(null);

  const [diario, setDiario] = useState<DiarioDieta | null>(null);
  const [dataAtual] = useState(new Date().toISOString().split('T')[0]);

  const [mostrarModal, setMostrarModal] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ texto: string; tipo: 'sucesso' | 'erro' } | null>(null);

  const [buscaAlimento, setBuscaAlimento] = useState('');
  const [sugestoes, setSugestoes] = useState<SugestaoAlimento[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [quantidadeGramas, setQuantidadeGramas] = useState(100);
  const [alimentoTaco, setAlimentoTaco] = useState(false);
  const buscaRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [formAdicionado, setFormAdicionado] = useState({
    kcal: 0, proteinas: 0, carboidratos: 0, gorduras: 0,
  });

  const carregarDiario = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('diario_dieta')
      .select('*')
      .eq('cliente_id', userId)
      .eq('data', dataAtual)
      .maybeSingle();
    setDiario(data ?? null);
  }, [dataAtual]);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setClienteId(user.id);
      await carregarDiario(user.id);
      setLoading(false);
    }
    init();
  }, [router, carregarDiario]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (buscaRef.current && !buscaRef.current.contains(e.target as Node)) {
        setMostrarSugestoes(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const buscarAlimentos = useCallback(async (termo: string) => {
    if (termo.length < 2) { setSugestoes([]); setMostrarSugestoes(false); return; }
    setBuscando(true);
    setMostrarSugestoes(true);
    try {
      const [produtosRes, tacoRes] = await Promise.all([
        supabase.from('produtos').select('nome, kcal, proteinas, carboidratos, gorduras').ilike('nome', `%${termo}%`).eq('ativo', true).limit(4),
        supabase.from('tabela_taco').select('nome_alimento, kcal_100g, carboidratos_100g, proteinas_100g, gorduras_100g').ilike('nome_alimento', `%${termo}%`).limit(6),
      ]);
      const resultados: SugestaoAlimento[] = [];
      (produtosRes.data ?? []).forEach(p => resultados.push({ nome: p.nome, kcal: p.kcal ?? 0, proteinas: p.proteinas ?? 0, carboidratos: p.carboidratos ?? 0, gorduras: p.gorduras ?? 0, fonte: 'produto' }));
      (tacoRes.data ?? []).forEach(t => resultados.push({ nome: t.nome_alimento, kcal: t.kcal_100g, proteinas: t.proteinas_100g, carboidratos: t.carboidratos_100g, gorduras: t.gorduras_100g, fonte: 'taco', por100g: true }));
      setSugestoes(resultados);
    } catch { setSugestoes([]); } finally { setBuscando(false); }
  }, []);

  const onChangeBusca = (valor: string) => {
    setBuscaAlimento(valor);
    setAlimentoTaco(false);
    setFormAdicionado({ kcal: 0, proteinas: 0, carboidratos: 0, gorduras: 0 });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => buscarAlimentos(valor), 300);
  };

  const selecionarSugestao = (item: SugestaoAlimento) => {
    setBuscaAlimento(item.nome);
    setMostrarSugestoes(false);
    setAlimentoTaco(item.fonte === 'taco');
    setQuantidadeGramas(100);
    setFormAdicionado({ kcal: item.kcal, proteinas: item.proteinas, carboidratos: item.carboidratos, gorduras: item.gorduras });
  };

  const aplicarProporcaoGramas = (gramas: number) => {
    setQuantidadeGramas(gramas);
    const fator = gramas / 100;
    const sugestao = sugestoes.find(s => s.nome === buscaAlimento && s.fonte === 'taco');
    if (sugestao) {
      setFormAdicionado({
        kcal: Math.round(sugestao.kcal * fator),
        proteinas: Math.round(sugestao.proteinas * fator * 10) / 10,
        carboidratos: Math.round(sugestao.carboidratos * fator * 10) / 10,
        gorduras: Math.round(sugestao.gorduras * fator * 10) / 10,
      });
    }
  };

  const adicionarAoDiario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteId) return;
    setSalvando(true);
    const novoTotal = {
      kcal_consumidas: (diario?.kcal_consumidas ?? 0) + formAdicionado.kcal,
      proteinas_g: (diario?.proteinas_g ?? 0) + formAdicionado.proteinas,
      carbos_g: (diario?.carbos_g ?? 0) + formAdicionado.carboidratos,
      gorduras_g: (diario?.gorduras_g ?? 0) + formAdicionado.gorduras,
    };
    try {
      if (diario?.id) {
        const { error } = await supabase.from('diario_dieta').update(novoTotal).eq('id', diario.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('diario_dieta').insert([{ cliente_id: clienteId, data: dataAtual, ...novoTotal }]);
        if (error) throw error;
      }
      setMensagem({ texto: 'Adicionado ao diário!', tipo: 'sucesso' });
      setBuscaAlimento(''); setSugestoes([]); setAlimentoTaco(false);
      setFormAdicionado({ kcal: 0, proteinas: 0, carboidratos: 0, gorduras: 0 });
      setMostrarModal(false);
      await carregarDiario(clienteId);
    } catch (err: any) {
      setMensagem({ texto: 'Erro: ' + err.message, tipo: 'erro' });
    } finally { setSalvando(false); }
  };

  const zerarDiario = async () => {
    if (!clienteId || !diario) return;
    if (!confirm('Zerar os totais de hoje?')) return;
    const { error } = await supabase.from('diario_dieta').update({ kcal_consumidas: 0, proteinas_g: 0, carbos_g: 0, gorduras_g: 0 }).eq('id', diario.id);
    if (!error) { setMensagem({ texto: 'Diário zerado.', tipo: 'sucesso' }); await carregarDiario(clienteId); }
  };

  const percentual = (valor: number, meta: number) => Math.min((valor / meta) * 100, 100);
  const kcal = diario?.kcal_consumidas ?? 0;
  const proteinas = diario?.proteinas_g ?? 0;
  const carbos = diario?.carbos_g ?? 0;
  const gorduras = diario?.gorduras_g ?? 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 animate-pulse">Carregando sua dieta...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans max-w-md mx-auto shadow-2xl relative pb-24">
      <header className="bg-white border-b border-gray-100 p-4 shadow-sm space-y-2">
        <div className="max-w-xs"><Logo /></div>
        <p className="text-sm font-semibold text-gray-600">
          {new Date(dataAtual + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </header>

      <main className="p-5 space-y-5">

        {mensagem && (
          <div className={`p-4 rounded-xl text-sm font-bold text-center cursor-pointer ${mensagem.tipo === 'sucesso' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`} onClick={() => setMensagem(null)}>
            {mensagem.texto}
          </div>
        )}

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Totais de Hoje</h2>
          <div>
            <div className="flex justify-between text-xs font-bold mb-1 text-gray-700">
              <span>Calorias</span>
              <span>{kcal} / {METAS_DIARIAS.kcal} kcal</span>
            </div>
            <div className="w-full bg-gray-200 h-2.5 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${kcal > METAS_DIARIAS.kcal ? 'bg-red-400' : 'bg-gradient-to-r from-viva-verde to-viva-roxo'}`} style={{ width: `${percentual(kcal, METAS_DIARIAS.kcal)}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Proteínas', value: proteinas, meta: METAS_DIARIAS.proteinas, cor: 'bg-red-400' },
              { label: 'Carbos', value: carbos, meta: METAS_DIARIAS.carboidratos, cor: 'bg-blue-400' },
              { label: 'Gorduras', value: gorduras, meta: METAS_DIARIAS.gorduras, cor: 'bg-yellow-400' },
            ].map(({ label, value, meta, cor }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
                <p className="text-base font-extrabold text-gray-800">{value}g</p>
                <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden mt-1.5">
                  <div className={`${cor} h-full rounded-full transition-all duration-500`} style={{ width: `${percentual(value, meta)}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">meta: {meta}g</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={() => setMostrarModal(true)} className="flex-1 bg-viva-roxo text-white font-bold py-3 rounded-xl shadow-lg hover:brightness-110 active:scale-[0.98] transition-all text-sm">
            + Adicionar Alimento
          </button>
          {diario && (
            <button onClick={zerarDiario} className="px-4 bg-gray-100 text-gray-500 font-bold py-3 rounded-xl hover:bg-gray-200 active:scale-[0.98] transition-all text-sm">
              Zerar
            </button>
          )}
        </div>

        {!diario && (
          <div className="text-center py-8 text-gray-400">
            <p className="text-4xl mb-3">🥗</p>
            <p className="text-sm font-semibold">Nenhum registro para hoje.</p>
            <p className="text-xs mt-1">Adicione alimentos para monitorar seus macros.</p>
          </div>
        )}

      </main>

      {mostrarModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center max-w-md mx-auto">
          <div className="bg-white w-full rounded-t-3xl p-6 max-h-[92vh] overflow-y-auto space-y-5">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-lg font-bold text-viva-roxo">Adicionar ao Diário</h3>
              <button onClick={() => { setMostrarModal(false); setBuscaAlimento(''); setSugestoes([]); }} className="text-gray-400 text-lg font-bold">✕</button>
            </div>

            <form onSubmit={adicionarAoDiario} className="space-y-4">
              <div ref={buscaRef} className="relative">
                <label className="block text-xs font-bold text-gray-600 mb-1">Buscar Alimento</label>
                <div className="relative">
                  <input type="text" value={buscaAlimento} onChange={e => onChangeBusca(e.target.value)} onFocus={() => buscaAlimento.length >= 2 && setMostrarSugestoes(true)}
                    className="w-full p-3 pr-10 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-viva-verde transition text-sm text-gray-900"
                    placeholder="Ex: arroz, frango, banana..." autoComplete="off" />
                  {buscando && <div className="absolute right-3 top-1/2 -translate-y-1/2"><div className="w-4 h-4 border-2 border-viva-roxo border-t-transparent rounded-full animate-spin" /></div>}
                </div>
                {mostrarSugestoes && sugestoes.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {sugestoes.map((item, idx) => (
                      <button key={idx} type="button" onClick={() => selecionarSugestao(item)} className="w-full text-left px-4 py-3 hover:bg-gray-50 transition border-b border-gray-100 last:border-0">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{item.nome}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{item.kcal} kcal{item.por100g ? '/100g' : ''} · P: {item.proteinas}g</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${item.fonte === 'produto' ? 'bg-viva-verde text-viva-roxo' : 'bg-blue-100 text-blue-700'}`}>
                            {item.fonte === 'produto' ? 'Viva Leve' : 'TACO'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {mostrarSugestoes && sugestoes.length === 0 && !buscando && buscaAlimento.length >= 2 && (
                  <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3">
                    <p className="text-sm text-gray-500">Nenhum resultado. Preencha os macros manualmente.</p>
                  </div>
                )}
              </div>

              {alimentoTaco && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <label className="block text-xs font-bold text-blue-700 mb-1">Quantidade consumida (gramas)</label>
                  <div className="flex items-center gap-3">
                    <input type="number" value={quantidadeGramas} min={1} onChange={e => aplicarProporcaoGramas(Number(e.target.value))} className="w-24 p-2 bg-white border border-blue-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    <span className="text-xs text-blue-600">g — macros calculados automaticamente</span>
                  </div>
                </div>
              )}

              <div className="bg-gray-50 rounded-xl p-3 space-y-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Macros a Adicionar</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Calorias (kcal)', key: 'kcal' as const },
                    { label: 'Proteínas (g)', key: 'proteinas' as const },
                    { label: 'Carboidratos (g)', key: 'carboidratos' as const },
                    { label: 'Gorduras (g)', key: 'gorduras' as const },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <label className="block text-xs font-bold text-gray-600 mb-1">{label}</label>
                      <input type="number" step="0.1" value={formAdicionado[key]}
                        onChange={e => { setAlimentoTaco(false); setFormAdicionado({ ...formAdicionado, [key]: Number(e.target.value) }); }}
                        className="w-full p-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-viva-verde transition text-sm text-gray-900" placeholder="0" />
                    </div>
                  ))}
                </div>
              </div>

              <button type="submit" disabled={salvando || (formAdicionado.kcal === 0 && formAdicionado.proteinas === 0 && formAdicionado.carboidratos === 0 && formAdicionado.gorduras === 0)}
                className="w-full bg-viva-roxo text-white font-bold py-3.5 rounded-xl shadow-lg hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-70">
                {salvando ? 'Salvando...' : 'Adicionar ao Diário'}
              </button>
            </form>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-200 flex justify-around p-3 pb-5 z-10">
        <Link href="/" className="flex flex-col items-center text-gray-400 hover:text-viva-roxo">
          <span className="text-xl">&#127968;</span>
          <span className="text-[10px] font-bold mt-1">Loja</span>
        </Link>
        <Link href="/pedidos" className="flex flex-col items-center text-gray-400 hover:text-viva-roxo">
          <span className="text-xl">&#128203;</span>
          <span className="text-[10px] font-bold mt-1">Pedidos</span>
        </Link>
        <button className="flex flex-col items-center text-viva-roxo">
          <span className="text-xl">&#128241;</span>
          <span className="text-[10px] font-bold mt-1">Dieta</span>
        </button>
        <Link href="/perfil" className="flex flex-col items-center text-gray-400 hover:text-viva-roxo">
          <span className="text-xl">&#128100;</span>
          <span className="text-[10px] font-bold mt-1">Perfil</span>
        </Link>
      </nav>
    </div>
  );
}
