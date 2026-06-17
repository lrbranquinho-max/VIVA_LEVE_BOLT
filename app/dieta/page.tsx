"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '../../components/Logo';

type ToastTipo = 'sucesso' | 'erro' | 'info';
type FonteAlimento = 'produto' | 'taco';

interface HistoricoRefeicao {
  id: string;
  cliente_id: string;
  data_consumo: string;
  tipo_refeicao: string;
  nome_alimento: string;
  gramas: number;
  kcal: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  created_at: string;
}

interface SugestaoAlimento {
  id?: number;
  nome: string;
  fonte: FonteAlimento;
  kcal100g: number;
  proteinas100g: number;
  carboidratos100g: number;
  gorduras100g: number;
}

interface FormRefeicao {
  tipo_refeicao: string;
  nome_alimento: string;
  gramas: number;
  kcal: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  fonte?: FonteAlimento;
  produto_id?: number;
}

interface PerfilCaloricoForm {
  sexo: string;
  peso_kg: string;
  altura_cm: string;
  idade: string;
  nivel_atividade: string;
}

interface PlanoNutriForm {
  objetivo: string;
  frutas: string[];
  principais: string[];
  saladas: string[];
  lanches: string[];
  outros: {
    frutas: string;
    principais: string;
    saladas: string;
    lanches: string;
  };
  refeicoes: Record<string, boolean>;
}

const TIPOS_REFEICAO = ['Café da Manhã', 'Almoço', 'Lanche', 'Jantar'];
const FATORES_ATIVIDADE = [
  { valor: 'sedentario', label: 'Sedentário', fator: 1.2 },
  { valor: 'leve', label: 'Levemente ativo', fator: 1.375 },
  { valor: 'moderado', label: 'Moderadamente ativo', fator: 1.55 },
  { valor: 'muito_ativo', label: 'Muito ativo', fator: 1.725 },
  { valor: 'extremo', label: 'Extremamente ativo', fator: 1.9 },
];
const FORM_INICIAL: FormRefeicao = {
  tipo_refeicao: '',
  nome_alimento: '',
  gramas: 100,
  kcal: 0,
  proteinas: 0,
  carboidratos: 0,
  gorduras: 0,
};
const PERFIL_CALORICO_INICIAL: PerfilCaloricoForm = {
  sexo: '',
  peso_kg: '',
  altura_cm: '',
  idade: '',
  nivel_atividade: 'sedentario',
};
const OPCOES_PLANO_NUTRI = {
  frutas: ['Banana', 'Maca', 'Morango', 'Mamao', 'Melancia', 'Uva', 'Abacaxi', 'Abacate', 'Laranja', 'Kiwi', 'Melao'],
  principais: [
    'Arroz branco', 'Arroz integral', 'Macarrao integral', 'Macarrao', 'Batata Inglesa', 'Batata doce',
    'Mandioca', 'Pure de batata', 'Feijao carioca', 'Feijao preto', 'Lentilha', 'Grao de bico',
    'File de frango', 'Patinho moido', 'File de peixe', 'Iscas de carne', 'Ovos', 'Mix de legumes',
    'Cenoura', 'Beterraba', 'Brocolis', 'Abobora',
  ],
  saladas: ['Alface', 'Tomate', 'Couve', 'Rucula', 'Agriao', 'Pepino', 'Cebola'],
  lanches: ['Pao de forma', 'Pao integral', 'Tapioca', 'Aveia', 'Iogurte integral', 'Iogurte desnatado', 'Leite', 'Whey Protein', 'Castanhas', 'Pasta de amendoim', 'Queijo branco'],
};
const REFEICOES_PLANO_NUTRI = ['Cafe da Manha', 'Lanche da Manha', 'Almoco', 'Lanche da Tarde', 'Jantar', 'Ceia'];
const PLANO_NUTRI_INICIAL: PlanoNutriForm = {
  objetivo: 'Perda de Peso',
  frutas: [],
  principais: [],
  saladas: [],
  lanches: [],
  outros: {
    frutas: '',
    principais: '',
    saladas: '',
    lanches: '',
  },
  refeicoes: REFEICOES_PLANO_NUTRI.reduce((acc, item) => ({
    ...acc,
    [item]: ['Cafe da Manha', 'Almoco', 'Jantar'].includes(item),
  }), {}),
};

function hojeLocal() {
  const data = new Date();
  data.setMinutes(data.getMinutes() - data.getTimezoneOffset());
  return data.toISOString().slice(0, 10);
}

function deslocarData(dataISO: string, dias: number) {
  const data = new Date(`${dataISO}T12:00:00`);
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

function periodoMes(dataISO: string) {
  const base = new Date(`${dataISO}T12:00:00`);
  const inicio = new Date(base.getFullYear(), base.getMonth(), 1, 12);
  const fim = new Date(base.getFullYear(), base.getMonth() + 1, 0, 12);
  return {
    inicio: inicio.toISOString().slice(0, 10),
    fim: fim.toISOString().slice(0, 10),
    diasNoMes: fim.getDate(),
    rotulo: base.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  };
}

function arredondar(valor: number, casas = 1) {
  const fator = 10 ** casas;
  return Math.round((Number(valor) || 0) * fator) / fator;
}

function calcularMacros(item: SugestaoAlimento, gramas: number) {
  const fator = Math.max(Number(gramas) || 0, 0) / 100;
  return {
    kcal: Math.round(item.kcal100g * fator),
    proteinas: arredondar(item.proteinas100g * fator),
    carboidratos: arredondar(item.carboidratos100g * fator),
    gorduras: arredondar(item.gorduras100g * fator),
  };
}

function percentual(valor: number, meta: number) {
  if (!meta) return 0;
  return Math.min((valor / meta) * 100, 100);
}

function mensagemKcal(consumo: number, meta: number) {
  const pct = meta > 0 ? (consumo / meta) * 100 : 0;
  if (pct < 75) return 'Kcal muito abaixo do ideal';
  if (pct <= 95) return 'Kcal ideal para dietas de emagrecimento';
  if (pct <= 105) return 'Kcal ideal para dietas de manutencao de peso';
  if (pct <= 125) return 'Kcal ideal para dietas de ganho de massa muscular';
  return 'Kcal muito acima';
}

function parseNumero(valor: string) {
  const numero = Number(valor.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(numero) ? numero : 0;
}

function calcularMetaCalorias({ sexo, peso_kg, altura_cm, idade, nivel_atividade }: PerfilCaloricoForm) {
  const peso = parseNumero(peso_kg);
  const altura = parseNumero(altura_cm);
  const anos = parseNumero(idade);
  if (!sexo || !peso || !altura || !anos) return 2000;

  const ajusteSexo = sexo === 'masculino' ? 5 : -161;
  const tmb = (10 * peso) + (6.25 * altura) - (5 * anos) + ajusteSexo;
  const fator = FATORES_ATIVIDADE.find(item => item.valor === nivel_atividade)?.fator ?? 1.2;
  return Math.max(Math.round(tmb * fator), 1000);
}

function parseQrPayload(texto: string): { id: number; gramas?: number } | null {
  try {
    const json = JSON.parse(texto);
    const id = Number(json.id ?? json.produto_id);
    if (!Number.isFinite(id)) return null;
    return { id, gramas: Number(json.gramas) || undefined };
  } catch {
    const id = Number(texto);
    return Number.isFinite(id) ? { id } : null;
  }
}

export default function Dieta() {
  const router = useRouter();
  const buscaRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrRef = useRef<any>(null);

  const [loading, setLoading] = useState(true);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [dataSelecionada, setDataSelecionada] = useState(hojeLocal());
  const [metaCalorias, setMetaCalorias] = useState(2000);
  const [refeicoes, setRefeicoes] = useState<HistoricoRefeicao[]>([]);
  const [refeicoesMes, setRefeicoesMes] = useState<HistoricoRefeicao[]>([]);
  const [carregandoDia, setCarregandoDia] = useState(false);
  const [carregandoMes, setCarregandoMes] = useState(false);
  const [dashboardAberto, setDashboardAberto] = useState(false);
  const [perfilAberto, setPerfilAberto] = useState(false);
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);
  const [perfilCalorico, setPerfilCalorico] = useState<PerfilCaloricoForm>({ ...PERFIL_CALORICO_INICIAL });
  const [planoNutri, setPlanoNutri] = useState<PlanoNutriForm>({ ...PLANO_NUTRI_INICIAL });
  const [receitaNutri, setReceitaNutri] = useState<File | null>(null);
  const [solicitandoPlano, setSolicitandoPlano] = useState(false);
  const [planoNutriAberto, setPlanoNutriAberto] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [scannerAberto, setScannerAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<{ texto: string; tipo: ToastTipo } | null>(null);
  const [erroModal, setErroModal] = useState<string | null>(null);

  const [form, setForm] = useState<FormRefeicao>({ ...FORM_INICIAL });
  const [sugestoes, setSugestoes] = useState<SugestaoAlimento[]>([]);
  const [sugestaoSelecionada, setSugestaoSelecionada] = useState<SugestaoAlimento | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);

  const mostrarToast = useCallback((texto: string, tipo: ToastTipo = 'info') => {
    setToast({ texto, tipo });
    window.setTimeout(() => setToast(null), 4200);
  }, []);

  const abrirModal = useCallback((prefill?: Partial<FormRefeicao>, sugestao?: SugestaoAlimento) => {
    const proximo = { ...FORM_INICIAL, data_consumo: dataSelecionada, ...prefill };
    setForm(proximo);
    setSugestaoSelecionada(sugestao ?? null);
    setSugestoes([]);
    setMostrarSugestoes(false);
    setModalAberto(true);
  }, [dataSelecionada]);

  const fecharModal = () => {
    setModalAberto(false);
    setErroModal(null);
    setSugestaoSelecionada(null);
    setSugestoes([]);
    setMostrarSugestoes(false);
    setForm({ ...FORM_INICIAL });
  };

  const carregarDia = useCallback(async (userId: string, dataISO: string) => {
    setCarregandoDia(true);
    try {
      const { data, error } = await supabase
        .from('historico_refeicoes')
        .select('*')
        .eq('cliente_id', userId)
        .eq('data_consumo', dataISO)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setRefeicoes(data ?? []);
    } catch (err: any) {
      mostrarToast(`Erro ao carregar histórico: ${err.message}`, 'erro');
      setRefeicoes([]);
    } finally {
      setCarregandoDia(false);
    }
  }, [mostrarToast]);

  const carregarMes = useCallback(async (userId: string, dataISO: string) => {
    const periodo = periodoMes(dataISO);
    setCarregandoMes(true);
    try {
      const { data, error } = await supabase
        .from('historico_refeicoes')
        .select('*')
        .eq('cliente_id', userId)
        .gte('data_consumo', periodo.inicio)
        .lte('data_consumo', periodo.fim)
        .order('data_consumo', { ascending: true });

      if (error) throw error;
      setRefeicoesMes(data ?? []);
    } catch (err: any) {
      mostrarToast(`Erro ao carregar dashboard mensal: ${err.message}`, 'erro');
      setRefeicoesMes([]);
    } finally {
      setCarregandoMes(false);
    }
  }, [mostrarToast]);

  useEffect(() => {
    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login');
          return;
        }

        setClienteId(user.id);

        const { data: perfil, error: perfilError } = await supabase
          .from('perfis')
          .select('meta_calorias')
          .eq('id', user.id)
          .maybeSingle();

        if (!perfilError && perfil?.meta_calorias) {
          setMetaCalorias(Number(perfil.meta_calorias));
        }

        const { data: perfilCliente } = await supabase
          .from('perfis_clientes')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (perfilCliente) {
          setPerfilCalorico({
            sexo: perfilCliente.sexo ?? '',
            peso_kg: perfilCliente.peso_kg ? String(perfilCliente.peso_kg).replace('.', ',') : '',
            altura_cm: perfilCliente.altura_cm ? String(perfilCliente.altura_cm).replace('.', ',') : '',
            idade: perfilCliente.idade ? String(perfilCliente.idade) : '',
            nivel_atividade: perfilCliente.nivel_atividade ?? 'sedentario',
          });
        }

        await carregarDia(user.id, dataSelecionada);
        await carregarMes(user.id, dataSelecionada);
      } catch (err: any) {
        mostrarToast(`Erro ao iniciar dieta: ${err.message}`, 'erro');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router, carregarDia, carregarMes, dataSelecionada, mostrarToast]);

  useEffect(() => {
    if (!clienteId) return;
    carregarDia(clienteId, dataSelecionada);
    carregarMes(clienteId, dataSelecionada);
  }, [clienteId, dataSelecionada, carregarDia, carregarMes]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (buscaRef.current && !buscaRef.current.contains(event.target as Node)) {
        setMostrarSugestoes(false);
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const totais = useMemo(() => refeicoes.reduce((acc, item) => ({
    kcal: acc.kcal + Number(item.kcal ?? 0),
    proteinas: acc.proteinas + Number(item.proteinas ?? 0),
    carboidratos: acc.carboidratos + Number(item.carboidratos ?? 0),
    gorduras: acc.gorduras + Number(item.gorduras ?? 0),
  }), { kcal: 0, proteinas: 0, carboidratos: 0, gorduras: 0 }), [refeicoes]);

  const metasMacros = useMemo(() => {
    const peso = parseNumero(perfilCalorico.peso_kg);
    const metaProteinas = peso > 0 ? peso * 2 : 150;
    const metaGorduras = peso > 0 ? peso : 65;
    const kcalProteinas = metaProteinas * 4;
    const kcalGorduras = metaGorduras * 9;
    const kcalCarboidratos = Math.max(metaCalorias - kcalProteinas - kcalGorduras, 0);

    return {
      proteinas: arredondar(metaProteinas, 0),
      gorduras: arredondar(metaGorduras, 0),
      carboidratos: arredondar(kcalCarboidratos / 4, 0),
    };
  }, [metaCalorias, perfilCalorico.peso_kg]);

  const dashboardMes = useMemo(() => {
    const periodo = periodoMes(dataSelecionada);
    const diasComRegistro = Array.from(new Set(refeicoesMes.map(item => item.data_consumo))).sort();
    const diasMeta = diasComRegistro.length;
    const totaisMes = refeicoesMes.reduce((acc, item) => ({
      kcal: acc.kcal + Number(item.kcal ?? 0),
      proteinas: acc.proteinas + Number(item.proteinas ?? 0),
      carboidratos: acc.carboidratos + Number(item.carboidratos ?? 0),
      gorduras: acc.gorduras + Number(item.gorduras ?? 0),
    }), { kcal: 0, proteinas: 0, carboidratos: 0, gorduras: 0 });

    const metasMes = {
      kcal: metaCalorias * diasMeta,
      proteinas: metasMacros.proteinas * diasMeta,
      carboidratos: metasMacros.carboidratos * diasMeta,
      gorduras: metasMacros.gorduras * diasMeta,
    };

    const porDia = new Map<string, number>();
    refeicoesMes.forEach(item => {
      porDia.set(item.data_consumo, (porDia.get(item.data_consumo) ?? 0) + Number(item.kcal ?? 0));
    });

    const grafico = diasComRegistro.map(iso => {
      const data = new Date(`${iso}T12:00:00`);
      return {
        dia: data.getDate(),
        kcal: porDia.get(iso) ?? 0,
      };
    });

    return {
      periodo,
      diasMeta,
      totaisMes,
      metasMes,
      saldoKcal: Math.round(totaisMes.kcal - metasMes.kcal),
      grafico,
    };
  }, [dataSelecionada, refeicoesMes, metaCalorias, metasMacros]);

  const refeicoesPorTipo = useMemo(() => TIPOS_REFEICAO.map(tipo => ({
    tipo,
    itens: refeicoes.filter(item => item.tipo_refeicao === tipo),
  })).filter(grupo => grupo.itens.length > 0), [refeicoes]);

  const buscarAlimentos = useCallback(async (termo: string) => {
    const busca = termo.trim();
    if (busca.length < 2) {
      setSugestoes([]);
      setMostrarSugestoes(false);
      return;
    }

    setBuscando(true);
    setMostrarSugestoes(true);

    try {
      const [produtosRes, tacoRes] = await Promise.all([
        supabase
          .from('produtos')
          .select('id, nome, kcal, proteinas, carboidratos, gorduras')
          .eq('ativo', true)
          .ilike('nome', `%${busca}%`)
          .limit(6),
        supabase
          .from('tabela_taco')
          .select('id, nome_alimento, kcal_100g, carboidratos_100g, proteinas_100g, gorduras_100g')
          .ilike('nome_alimento', `%${busca}%`)
          .limit(8),
      ]);

      if (produtosRes.error) throw produtosRes.error;
      if (tacoRes.error) throw tacoRes.error;

      const produtos: SugestaoAlimento[] = (produtosRes.data ?? []).map((produto: any) => ({
        id: Number(produto.id),
        nome: produto.nome,
        fonte: 'produto',
        kcal100g: Number(produto.kcal ?? 0),
        proteinas100g: Number(produto.proteinas ?? 0),
        carboidratos100g: Number(produto.carboidratos ?? 0),
        gorduras100g: Number(produto.gorduras ?? 0),
      }));

      const taco: SugestaoAlimento[] = (tacoRes.data ?? []).map((alimento: any) => ({
        id: Number(alimento.id),
        nome: alimento.nome_alimento,
        fonte: 'taco',
        kcal100g: Number(alimento.kcal_100g ?? 0),
        proteinas100g: Number(alimento.proteinas_100g ?? 0),
        carboidratos100g: Number(alimento.carboidratos_100g ?? 0),
        gorduras100g: Number(alimento.gorduras_100g ?? 0),
      }));

      setSugestoes([...produtos, ...taco]);
    } catch (err: any) {
      mostrarToast(`Erro na busca: ${err.message}`, 'erro');
      setSugestoes([]);
    } finally {
      setBuscando(false);
    }
  }, [mostrarToast]);

  const alterarNomeAlimento = (valor: string) => {
    setForm(prev => ({ ...prev, nome_alimento: valor }));
    setSugestaoSelecionada(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => buscarAlimentos(valor), 300);
  };

  const selecionarSugestao = (item: SugestaoAlimento) => {
    const macros = calcularMacros(item, form.gramas);
    setSugestaoSelecionada(item);
    setForm(prev => ({
      ...prev,
      ...macros,
      nome_alimento: item.nome,
      fonte: item.fonte,
      produto_id: item.fonte === 'produto' ? item.id : undefined,
    }));
    setMostrarSugestoes(false);
  };

  const alterarGramas = (gramas: number) => {
    const gramasValidas = Math.max(Number(gramas) || 0, 0);
    setForm(prev => ({
      ...prev,
      gramas: gramasValidas,
      ...(sugestaoSelecionada ? calcularMacros(sugestaoSelecionada, gramasValidas) : {}),
    }));
  };

  const salvarPerfilCalorico = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!clienteId) return;

    const novaMeta = calcularMetaCalorias(perfilCalorico);
    setSalvandoPerfil(true);

    try {
      const payloadPerfilCliente = {
        sexo: perfilCalorico.sexo || null,
        peso_kg: perfilCalorico.peso_kg ? parseNumero(perfilCalorico.peso_kg) : null,
        altura_cm: perfilCalorico.altura_cm ? parseNumero(perfilCalorico.altura_cm) : null,
        idade: perfilCalorico.idade ? Math.round(parseNumero(perfilCalorico.idade)) : null,
        nivel_atividade: perfilCalorico.nivel_atividade || 'sedentario',
      };

      const { data: perfilExistente, error: buscaPerfilError } = await supabase
        .from('perfis_clientes')
        .select('id')
        .eq('id', clienteId)
        .maybeSingle();
      if (buscaPerfilError) throw buscaPerfilError;

      const perfilClientePayload = perfilExistente ? payloadPerfilCliente : {
        id: clienteId,
        nome_completo: '',
        telefone: '',
        endereco_rua: '',
        endereco_numero: '',
        endereco_complemento: '',
        bairro: '',
        regiao_df: '',
        ...payloadPerfilCliente,
      };

      const { error: perfilClienteError } = perfilExistente
        ? await supabase.from('perfis_clientes').update(payloadPerfilCliente).eq('id', clienteId)
        : await supabase.from('perfis_clientes').insert([perfilClientePayload]);
      if (perfilClienteError) throw perfilClienteError;

      const { error: metaError } = await supabase
        .from('perfis')
        .update({ meta_calorias: novaMeta })
        .eq('id', clienteId);
      if (metaError) throw metaError;

      setMetaCalorias(novaMeta);
      setPerfilAberto(false);
      mostrarToast(`Meta atualizada para ${novaMeta} kcal.`, 'sucesso');
    } catch (err: any) {
      mostrarToast(`Erro ao completar cadastro: ${err.message}`, 'erro');
    } finally {
      setSalvandoPerfil(false);
    }
  };

  const alternarPreferenciaPlano = (grupo: keyof Pick<PlanoNutriForm, 'frutas' | 'principais' | 'saladas' | 'lanches'>, valor: string) => {
    setPlanoNutri(prev => ({
      ...prev,
      [grupo]: prev[grupo].includes(valor)
        ? prev[grupo].filter(item => item !== valor)
        : [...prev[grupo], valor],
    }));
  };

  const solicitarPlanoNutri = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!clienteId) return;

    setSolicitandoPlano(true);
    try {
      let receitaUrl: string | null = null;

      if (receitaNutri) {
        const extensao = receitaNutri.name.split('.').pop()?.toLowerCase() || 'jpg';
        const caminho = `${clienteId}/${Date.now()}-receita.${extensao}`;
        const { error: uploadError } = await supabase.storage
          .from('receitas_nutri')
          .upload(caminho, receitaNutri, { upsert: false });
        if (uploadError) throw uploadError;

        const { data: publicUrl } = supabase.storage.from('receitas_nutri').getPublicUrl(caminho);
        receitaUrl = publicUrl.publicUrl;
      }

      const { error } = await supabase.from('planos_requisicoes').insert([{
        user_id: clienteId,
        objetivo: planoNutri.objetivo,
        receita_url: receitaUrl,
        preferencias: {
          frutas: planoNutri.frutas,
          principais: planoNutri.principais,
          saladas: planoNutri.saladas,
          lanches: planoNutri.lanches,
          outros: planoNutri.outros,
        },
        padrao_refeicoes: planoNutri.refeicoes,
        status: 'pendente',
      }]);
      if (error) throw error;

      setReceitaNutri(null);
      setPlanoNutri({
        ...PLANO_NUTRI_INICIAL,
        refeicoes: { ...PLANO_NUTRI_INICIAL.refeicoes },
      });
      setPlanoNutriAberto(false);
      mostrarToast('Recebemos seus dados! Em ate 24hs seu plano estara disponivel.', 'sucesso');
    } catch (err: any) {
      mostrarToast(`Erro ao solicitar plano: ${err.message}`, 'erro');
    } finally {
      setSolicitandoPlano(false);
    }
  };

  const salvarRefeicao = async (event: React.FormEvent) => {
    event.preventDefault();
    setErroModal(null);
    if (!clienteId) return;
    if (!form.tipo_refeicao) {
      setErroModal('Selecione o tipo de refeição.');
      return;
    }
    if (!form.nome_alimento.trim()) {
      setErroModal('Informe o alimento consumido.');
      return;
    }

    setSalvando(true);

    try {
      const payload = {
        cliente_id: clienteId,
        data_consumo: dataSelecionada,
        tipo_refeicao: form.tipo_refeicao,
        nome_alimento: form.nome_alimento.trim(),
        gramas: form.gramas,
        kcal: form.kcal,
        proteinas: form.proteinas,
        carboidratos: form.carboidratos,
        gorduras: form.gorduras,
      };

      const { error } = await supabase.from('historico_refeicoes').insert([payload]);
      if (error?.code === 'PGRST204' || error?.code === '42703' || error?.message?.toLowerCase().includes('gramas')) {
        const { gramas, ...payloadSemGramas } = payload;
        const { error: retryError } = await supabase.from('historico_refeicoes').insert([payloadSemGramas]);
        if (retryError) throw retryError;
        mostrarToast('Refeição salva. Execute a migration para registrar gramas no histórico.', 'info');
      } else if (error) {
        throw error;
      } else {
        mostrarToast('Refeição adicionada ao histórico.', 'sucesso');
      }
      fecharModal();
      await carregarDia(clienteId, dataSelecionada);
      await carregarMes(clienteId, dataSelecionada);
    } catch (err: any) {
      const mensagem = `Erro ao salvar refeição: ${err.message}`;
      setErroModal(mensagem);
      mostrarToast(mensagem, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const buscarProdutoQr = useCallback(async (produtoId: number, gramas = 100) => {
    try {
      const { data, error } = await supabase
        .from('produtos')
        .select('id, nome, kcal, proteinas, carboidratos, gorduras, porcao_g')
        .eq('id', produtoId)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Produto não encontrado no cardápio.');

      const sugestao: SugestaoAlimento = {
        id: Number(data.id),
        nome: data.nome,
        fonte: 'produto',
        kcal100g: Number(data.kcal ?? 0),
        proteinas100g: Number(data.proteinas ?? 0),
        carboidratos100g: Number(data.carboidratos ?? 0),
        gorduras100g: Number(data.gorduras ?? 0),
      };

      const gramasCalculadas = Number(gramas || data.porcao_g || 100);
      abrirModal({
        nome_alimento: data.nome,
        gramas: gramasCalculadas,
        fonte: 'produto',
        produto_id: Number(data.id),
        ...calcularMacros(sugestao, gramasCalculadas),
      }, sugestao);
      mostrarToast('Produto lido pelo QR Code. Selecione a refeição e salve.', 'sucesso');
    } catch (err: any) {
      mostrarToast(`QR Code inválido: ${err.message}`, 'erro');
    } finally {
      setScannerAberto(false);
    }
  }, [abrirModal, mostrarToast]);

  useEffect(() => {
    if (!scannerAberto) return;
    let cancelado = false;

    async function iniciarScanner() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Seu dispositivo nao disponibilizou acesso a camera para este app.');
        }

        const permissao = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
        permissao.getTracks().forEach(track => track.stop());

        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelado) return;

        const scanner = new Html5Qrcode('qr-reader');
        qrRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          async decodedText => {
            const payload = parseQrPayload(decodedText);
            if (!payload) {
              mostrarToast('QR Code não contém um produto válido.', 'erro');
              return;
            }
            await scanner.stop().catch(() => undefined);
            await buscarProdutoQr(payload.id, payload.gramas);
          },
          () => undefined,
        );
      } catch (err: any) {
        mostrarToast(`Não foi possível acessar a câmera: ${err.message}`, 'erro');
        setScannerAberto(false);
      }
    }

    iniciarScanner();

    return () => {
      cancelado = true;
      if (qrRef.current?.isScanning) {
        qrRef.current.stop().catch(() => undefined);
      }
    };
  }, [scannerAberto, buscarProdutoQr, mostrarToast]);

  const removerRefeicao = async (id: string) => {
    if (!clienteId) return;
    try {
      const { error } = await supabase.from('historico_refeicoes').delete().eq('id', id);
      if (error) throw error;
      mostrarToast('Registro removido.', 'sucesso');
      await carregarDia(clienteId, dataSelecionada);
      await carregarMes(clienteId, dataSelecionada);
    } catch (err: any) {
      mostrarToast(`Erro ao remover: ${err.message}`, 'erro');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 animate-pulse">Carregando sua dieta...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans max-w-md mx-auto shadow-2xl relative pb-24">
      <header className="bg-white border-b border-gray-100 p-4 shadow-sm space-y-4">
        <div className="max-w-xs"><Logo /></div>
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setDataSelecionada(d => deslocarData(d, -1))} className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-bold text-gray-600 hover:bg-gray-200">
            Anterior
          </button>
          <div className="text-center">
            <p className="text-sm font-black text-gray-800 capitalize">
              {new Date(`${dataSelecionada}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' })}
            </p>
            <p className="text-xs text-gray-500">
              {new Date(`${dataSelecionada}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button onClick={() => setDataSelecionada(d => deslocarData(d, 1))} className="px-3 py-2 rounded-xl bg-gray-100 text-xs font-bold text-gray-600 hover:bg-gray-200">
            Próximo
          </button>
        </div>
      </header>

      <main className="p-5 space-y-5">
        {toast && (
          <button onClick={() => setToast(null)} className={`fixed left-1/2 top-4 z-[120] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 p-4 rounded-xl text-sm font-bold text-center shadow-xl ${toast.tipo === 'sucesso' ? 'bg-green-100 text-green-700' : toast.tipo === 'erro' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
            {toast.texto}
          </button>
        )}

        <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-viva-roxo to-gray-900 p-5 text-white shadow-sm">
          <p className="text-xs font-black uppercase tracking-wider text-viva-verde">Plano Nutri com IA</p>
          <h2 className="mt-1 text-xl font-black">Nao sabe o que comer?</h2>
          <p className="mt-2 text-sm font-semibold text-white/85">
            Deixe nossa Inteligencia Artificial criar um plano alimentar para voce e seu objetivo, usando nossas refeicoes.
          </p>
          <Link href="/dieta/plano-nutri" className="mt-4 inline-flex rounded-xl bg-viva-verde px-4 py-2 text-xs font-black text-viva-roxo shadow-sm">
            Ver meu Plano Nutri
          </Link>
        </section>

        <section className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Resumo do Dia</h2>
            {carregandoDia && <span className="text-xs text-gray-400 animate-pulse">atualizando...</span>}
          </div>

          <div>
            <div className="flex justify-between text-xs font-bold mb-1 text-gray-700">
              <span>Calorias</span>
              <span>{Math.round(totais.kcal)} / {metaCalorias} kcal</span>
            </div>
            <div className="w-full bg-gray-200 h-3 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${totais.kcal > metaCalorias ? 'bg-red-400' : 'bg-gradient-to-r from-viva-verde to-viva-roxo'}`} style={{ width: `${percentual(totais.kcal, metaCalorias)}%` }} />
            </div>
            <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-center text-xs font-bold text-viva-roxo">
              {mensagemKcal(totais.kcal, metaCalorias)}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Proteínas', value: totais.proteinas, meta: metasMacros.proteinas, cor: 'bg-red-400' },
              { label: 'Carbos', value: totais.carboidratos, meta: metasMacros.carboidratos, cor: 'bg-blue-400' },
              { label: 'Gorduras', value: totais.gorduras, meta: metasMacros.gorduras, cor: 'bg-yellow-400' },
            ].map(({ label, value, meta, cor }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
                <p className="text-base font-extrabold text-gray-800">{arredondar(value)}g</p>
                <p className="mt-0.5 text-[10px] font-bold text-gray-500">{arredondar(value)} / {meta} gr</p>
                <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden mt-1.5">
                  <div className={`${cor} h-full rounded-full transition-all duration-500`} style={{ width: `${percentual(value, meta)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-viva-verde/40 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setDashboardAberto(valor => !valor)}
            className="flex w-full items-center justify-between gap-3 bg-viva-roxo px-4 py-4 text-left text-white"
          >
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-viva-verde">Dashboard mensal</p>
              <h2 className="text-lg font-black">Resultados da dieta 🏆</h2>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{dashboardAberto ? 'Ocultar' : 'Ver mês'}</span>
          </button>

          {dashboardAberto && (
            <div className="space-y-4 p-4">
              <div className="rounded-xl bg-gray-50 p-3">
                <div className="mx-auto max-w-[190px]">
                  <Logo />
                </div>
                <p className="mt-2 text-center text-xs font-bold uppercase tracking-wider text-gray-500">{dashboardMes.periodo.rotulo}</p>
                <p className="mt-1 text-center text-[11px] font-semibold text-gray-400">
                  {dashboardMes.diasMeta > 0
                    ? `${dashboardMes.diasMeta} dia(s) com registro considerados nas metas`
                    : 'Nenhum registro no mes selecionado'}
                </p>
              </div>

              {carregandoMes ? (
                <p className="rounded-xl bg-gray-50 p-4 text-center text-xs font-bold text-gray-400">Carregando resultados do mês...</p>
              ) : dashboardMes.diasMeta === 0 ? (
                <div className="rounded-2xl bg-gray-50 p-5 text-center">
                  <p className="text-3xl">VL</p>
                  <p className="mt-2 text-sm font-black text-gray-700">Sem registros para calcular este mes.</p>
                  <p className="mt-1 text-xs font-semibold text-gray-500">Inclua pelo menos uma refeicao para visualizar saldo, metas e evolucao.</p>
                </div>
              ) : (
                <>
                  <div className={`rounded-2xl p-4 text-center ${dashboardMes.saldoKcal <= 0 ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                    <p className="text-xs font-black uppercase tracking-wider">Saldo calórico acumulado</p>
                    <p className="mt-1 text-3xl font-black">
                      {dashboardMes.saldoKcal > 0 ? '+' : ''}{dashboardMes.saldoKcal.toLocaleString('pt-BR')} kcal
                    </p>
                    <p className="mt-1 text-xs font-semibold">
                      {dashboardMes.saldoKcal <= 0 ? 'Déficit acumulado no mês. Excelente consistência! 🎯' : 'Ganho calórico acumulado no mês. Ajuste fino para seguir evoluindo. 💪'}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Proteínas', valor: dashboardMes.totaisMes.proteinas, meta: dashboardMes.metasMes.proteinas, cor: 'bg-red-400' },
                      { label: 'Carbos', valor: dashboardMes.totaisMes.carboidratos, meta: dashboardMes.metasMes.carboidratos, cor: 'bg-blue-400' },
                      { label: 'Gorduras', valor: dashboardMes.totaisMes.gorduras, meta: dashboardMes.metasMes.gorduras, cor: 'bg-yellow-400' },
                    ].map(item => (
                      <div key={item.label} className="rounded-xl bg-gray-50 p-3 text-center">
                        <p className="text-[10px] font-black uppercase text-gray-500">{item.label}</p>
                        <p className="mt-1 text-sm font-black text-gray-800">{arredondar(item.valor, 0)}g</p>
                        <p className="text-[10px] font-bold text-gray-500">meta {arredondar(item.meta, 0)}g</p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
                          <div className={`${item.cor} h-full rounded-full`} style={{ width: `${percentual(item.valor, item.meta)}%` }} />
                        </div>
                        <p className="mt-1 text-[10px] font-bold text-viva-roxo">{arredondar(percentual(item.valor, item.meta), 0)}%</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl bg-gray-50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase tracking-wider text-gray-500">Evolução diária de kcal</h3>
                      <span className="text-xs font-bold text-viva-roxo">meta {metaCalorias} kcal</span>
                    </div>
                    <div className="flex h-28 items-end gap-1 overflow-hidden rounded-xl bg-white p-2">
                      {dashboardMes.grafico.map(dia => (
                        <div key={dia.dia} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                          <div
                            title={`Dia ${dia.dia}: ${Math.round(dia.kcal)} kcal`}
                            className={`w-full rounded-t ${dia.kcal > metaCalorias ? 'bg-yellow-400' : 'bg-viva-roxo'}`}
                            style={{ height: `${Math.max(4, percentual(dia.kcal, metaCalorias))}%` }}
                          />
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-center text-xs font-semibold text-gray-500">🌱 Cada registro aproxima você do próximo resultado.</p>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            type="button"
            onClick={() => setPerfilAberto(valor => !valor)}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div>
              <h2 className="text-sm font-bold text-gray-700">Completar cadastro</h2>
              <p className="text-xs text-gray-500">Opcional para calcular sua meta calórica.</p>
            </div>
            <span className="text-xs font-bold text-viva-roxo">{perfilAberto ? 'Fechar' : 'Editar'}</span>
          </button>

          {perfilAberto && (
            <form onSubmit={salvarPerfilCalorico} className="space-y-4 border-t border-gray-100 p-4">
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="block text-xs font-bold text-gray-600 mb-1">Sexo</span>
                  <select value={perfilCalorico.sexo} onChange={e => setPerfilCalorico(prev => ({ ...prev, sexo: e.target.value }))} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900">
                    <option value="">Selecione</option>
                    <option value="masculino">Masculino</option>
                    <option value="feminino">Feminino</option>
                  </select>
                </label>

                <label>
                  <span className="block text-xs font-bold text-gray-600 mb-1">Idade</span>
                  <input inputMode="numeric" value={perfilCalorico.idade} onChange={e => setPerfilCalorico(prev => ({ ...prev, idade: e.target.value.replace(/\D/g, '') }))} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900" placeholder="anos" />
                </label>

                <label>
                  <span className="block text-xs font-bold text-gray-600 mb-1">Peso</span>
                  <input inputMode="decimal" value={perfilCalorico.peso_kg} onChange={e => setPerfilCalorico(prev => ({ ...prev, peso_kg: e.target.value }))} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900" placeholder="kg" />
                </label>

                <label>
                  <span className="block text-xs font-bold text-gray-600 mb-1">Altura</span>
                  <input inputMode="decimal" value={perfilCalorico.altura_cm} onChange={e => setPerfilCalorico(prev => ({ ...prev, altura_cm: e.target.value }))} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900" placeholder="cm" />
                </label>
              </div>

              <label>
                <span className="block text-xs font-bold text-gray-600 mb-1">Nível de atividade</span>
                <select value={perfilCalorico.nivel_atividade} onChange={e => setPerfilCalorico(prev => ({ ...prev, nivel_atividade: e.target.value }))} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900">
                  {FATORES_ATIVIDADE.map(item => <option key={item.valor} value={item.valor}>{item.label}</option>)}
                </select>
              </label>

              <div className="rounded-xl bg-viva-verde/20 p-3 text-center">
                <p className="text-xs font-semibold text-viva-roxo">Meta estimada: {calcularMetaCalorias(perfilCalorico)} kcal/dia</p>
              </div>

              <button disabled={salvandoPerfil} className="w-full rounded-xl bg-gray-900 py-3 text-sm font-bold text-white disabled:opacity-60">
                {salvandoPerfil ? 'Salvando...' : 'Salvar meta calórica'}
              </button>
            </form>
          )}
        </section>

        <section className="rounded-2xl border border-viva-verde/40 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-viva-roxo">Plano Nutri Inteligente</p>
              <h2 className="mt-1 text-lg font-black text-gray-800">Plano semanal com IA e revisao humana</h2>
              <p className="mt-1 text-xs font-semibold text-gray-500">O formulario fica oculto para manter a dieta leve. Abra quando quiser solicitar um novo plano.</p>
            </div>
            <button
              type="button"
              onClick={() => setPlanoNutriAberto(prev => !prev)}
              className="shrink-0 rounded-xl bg-viva-roxo px-4 py-3 text-xs font-black text-white shadow-sm"
            >
              {planoNutriAberto ? 'Ocultar' : 'Solicitar'}
            </button>
          </div>

          {planoNutriAberto && <form onSubmit={solicitarPlanoNutri} className="mt-4 space-y-4 border-t border-gray-100 pt-4">
            <label>
              <span className="mb-1 block text-xs font-bold text-gray-600">Objetivo</span>
              <select value={planoNutri.objetivo} onChange={e => setPlanoNutri(prev => ({ ...prev, objetivo: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm font-semibold text-gray-900">
                <option>Perda de Peso</option>
                <option>Manutencao</option>
                <option>Ganho de Massa</option>
              </select>
            </label>

            <label>
              <span className="mb-1 block text-xs font-bold text-gray-600">Possui receita do nutricionista? Anexe aqui</span>
              <input type="file" accept="image/*" onChange={e => setReceitaNutri(e.target.files?.[0] ?? null)} className="w-full rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-600" />
            </label>

            {([
              ['frutas', 'Frutas'],
              ['principais', 'Principais'],
              ['saladas', 'Saladas'],
              ['lanches', 'Lanches'],
            ] as const).map(([grupo, label]) => (
              <div key={grupo}>
                <p className="mb-2 text-xs font-bold text-gray-600">{label}</p>
                <div className="flex flex-wrap gap-2">
                  {OPCOES_PLANO_NUTRI[grupo].map(opcao => {
                    const ativo = planoNutri[grupo].includes(opcao);
                    return (
                      <button
                        key={opcao}
                        type="button"
                        onClick={() => alternarPreferenciaPlano(grupo, opcao)}
                        className={`rounded-full px-3 py-2 text-xs font-black ${ativo ? 'bg-viva-roxo text-white' : 'bg-gray-100 text-gray-600'}`}
                      >
                        {opcao}
                      </button>
                    );
                  })}
                </div>
                <label className="mt-2 block">
                  <span className="mb-1 block text-[11px] font-semibold text-gray-500">Outro? Digite aqui separado por virgula se nao encontrou na lista</span>
                  <input
                    value={planoNutri.outros[grupo]}
                    onChange={e => setPlanoNutri(prev => ({
                      ...prev,
                      outros: { ...prev.outros, [grupo]: e.target.value },
                    }))}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-viva-verde"
                    placeholder="Ex: pera, tilapia, quinoa..."
                  />
                </label>
              </div>
            ))}

            <div>
              <p className="mb-2 text-xs font-bold text-gray-600">Padrao de refeicoes</p>
              <div className="grid grid-cols-2 gap-2">
                {REFEICOES_PLANO_NUTRI.map(refeicao => (
                  <label key={refeicao} className="flex items-center gap-2 rounded-xl bg-gray-50 p-3 text-xs font-bold text-gray-600">
                    <input
                      type="checkbox"
                      checked={Boolean(planoNutri.refeicoes[refeicao])}
                      onChange={e => setPlanoNutri(prev => ({
                        ...prev,
                        refeicoes: { ...prev.refeicoes, [refeicao]: e.target.checked },
                      }))}
                    />
                    {refeicao}
                  </label>
                ))}
              </div>
            </div>

            <button disabled={solicitandoPlano} className="w-full rounded-xl bg-viva-verde py-3 text-sm font-black text-viva-roxo shadow-sm disabled:opacity-60">
              {solicitandoPlano ? 'Enviando...' : 'Solicitar plano em ate 24hs'}
            </button>
          </form>}
        </section>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => abrirModal()} className="bg-viva-roxo text-white font-bold py-3 rounded-xl shadow-lg hover:brightness-110 active:scale-[0.98] transition-all text-sm">
            + Inserir Manual
          </button>
          <button onClick={() => setScannerAberto(true)} className="bg-gray-900 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-gray-800 active:scale-[0.98] transition-all text-sm">
            Escanear QR Code
          </button>
        </div>

        <section className="space-y-4">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Histórico diário</h2>

          {!carregandoDia && refeicoes.length === 0 && (
            <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border border-gray-100">
              <p className="text-4xl mb-3">🍽️</p>
              <p className="text-sm font-semibold">Nenhuma refeição registrada nesta data.</p>
            </div>
          )}

          {refeicoesPorTipo.map(grupo => (
            <div key={grupo.tipo} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between">
                <h3 className="font-black text-gray-800">{grupo.tipo}</h3>
                <span className="text-xs font-bold text-gray-500">{grupo.itens.length} item(ns)</span>
              </div>
              <div className="divide-y divide-gray-100">
                {grupo.itens.map(item => (
                  <div key={item.id} className="p-4">
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-bold text-gray-800">{item.nome_alimento}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{arredondar(item.gramas, 0)}g consumidos</p>
                      </div>
                      <button onClick={() => removerRefeicao(item.id)} className="text-xs font-bold text-red-400 hover:text-red-600">
                        remover
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                      <span className="bg-gray-50 rounded-lg py-2 text-xs font-bold text-gray-700">{Math.round(item.kcal)} kcal</span>
                      <span className="bg-gray-50 rounded-lg py-2 text-xs font-bold text-gray-700">P {arredondar(item.proteinas)}g</span>
                      <span className="bg-gray-50 rounded-lg py-2 text-xs font-bold text-gray-700">C {arredondar(item.carboidratos)}g</span>
                      <span className="bg-gray-50 rounded-lg py-2 text-xs font-bold text-gray-700">G {arredondar(item.gorduras)}g</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </main>

      {modalAberto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center max-w-md mx-auto">
          <div className="bg-white w-full rounded-t-3xl p-6 max-h-[92vh] overflow-y-auto space-y-5">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-lg font-bold text-viva-roxo">Registrar refeição</h3>
              <button onClick={fecharModal} className="text-gray-400 text-lg font-bold">×</button>
            </div>

            <form onSubmit={salvarRefeicao} className="space-y-4">
              {erroModal && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                  {erroModal}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Tipo de refeição</label>
                <select value={form.tipo_refeicao} onChange={e => setForm(prev => ({ ...prev, tipo_refeicao: e.target.value }))} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-viva-verde">
                  <option value="">Selecione...</option>
                  {TIPOS_REFEICAO.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
                </select>
              </div>

              <div ref={buscaRef} className="relative">
                <label className="block text-xs font-bold text-gray-600 mb-1">Nome do alimento</label>
                <input type="text" value={form.nome_alimento} onChange={e => alterarNomeAlimento(e.target.value)} onFocus={() => form.nome_alimento.length >= 2 && setMostrarSugestoes(true)} className="w-full p-3 pr-10 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-viva-verde transition text-sm text-gray-900" placeholder="Ex: frango, arroz, marmita..." autoComplete="off" />
                {buscando && <div className="absolute right-3 top-9 w-4 h-4 border-2 border-viva-roxo border-t-transparent rounded-full animate-spin" />}

                {mostrarSugestoes && sugestoes.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                    {sugestoes.map((item, idx) => (
                      <button key={`${item.fonte}-${item.id ?? idx}`} type="button" onClick={() => selecionarSugestao(item)} className="w-full text-left px-4 py-3 hover:bg-gray-50 transition border-b border-gray-100 last:border-0">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{item.nome}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{Math.round(item.kcal100g)} kcal/100g · P {arredondar(item.proteinas100g)}g · C {arredondar(item.carboidratos100g)}g</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${item.fonte === 'produto' ? 'bg-viva-verde text-viva-roxo' : 'bg-blue-100 text-blue-700'}`}>
                            {item.fonte === 'produto' ? 'Viva Leve' : 'TACO'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <label className="block text-xs font-bold text-blue-700 mb-1">Quantidade consumida</label>
                <div className="flex items-center gap-3">
                  <input type="number" value={form.gramas} min={1} onChange={e => alterarGramas(Number(e.target.value))} className="w-28 p-2 bg-white border border-blue-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <span className="text-xs text-blue-600">gramas · cálculo automático por 100g</span>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 space-y-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Macros calculados</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Calorias (kcal)', key: 'kcal' as const },
                    { label: 'Proteínas (g)', key: 'proteinas' as const },
                    { label: 'Carboidratos (g)', key: 'carboidratos' as const },
                    { label: 'Gorduras (g)', key: 'gorduras' as const },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <label className="block text-xs font-bold text-gray-600 mb-1">{label}</label>
                      <input type="number" step="0.1" value={form[key]} onChange={e => setForm(prev => ({ ...prev, [key]: Number(e.target.value) }))} className="w-full p-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-viva-verde transition text-sm text-gray-900" />
                    </div>
                  ))}
                </div>
              </div>

              <button type="submit" disabled={salvando} className="w-full bg-viva-roxo text-white font-bold py-3.5 rounded-xl shadow-lg hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-70">
                {salvando ? 'Salvando...' : 'Salvar refeição'}
              </button>
            </form>
          </div>
        </div>
      )}

      {scannerAberto && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 max-w-md mx-auto">
          <div className="bg-white w-full rounded-2xl p-5 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-gray-800">Escanear QR Code</h3>
              <button onClick={() => setScannerAberto(false)} className="text-gray-400 text-lg font-bold">×</button>
            </div>
            <div id="qr-reader" className="overflow-hidden rounded-xl border border-gray-200" />
            <p className="text-xs text-gray-500 text-center">Aponte a câmera para o QR da marmita Viva Leve.</p>
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
