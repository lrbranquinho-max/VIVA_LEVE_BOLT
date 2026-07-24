"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import Logo from '../../components/Logo';
import BottomNav from '../../components/BottomNav';
import { getAdvancedTechniqueInstructions } from '../../lib/trainingTechniques';

type ToastTipo = 'sucesso' | 'erro' | 'info';

interface ExerciseCatalog {
  id: number;
  name: string;
  primary_muscle_group: string;
  equipment?: string | null;
  movement_pattern?: string | null;
  instructions?: string | null;
  precautions?: string | null;
  video_url?: string | null;
  video_thumbnail_url?: string | null;
}

interface DayExercise {
  id: string;
  exercise_id: number;
  order_index: number;
  sets: number;
  repetition_min: number;
  repetition_max: number;
  rest_seconds: number;
  rir_target?: number | null;
  advanced_technique?: string | null;
  advanced_technique_instructions?: string | null;
  notes?: string | null;
  exercise_catalog: ExerciseCatalog;
  substitute_exercise?: ExerciseCatalog | null;
}

interface TrainingSessionExercise {
  completed: boolean;
  load_used?: string | null;
  completed_repetitions?: string | null;
  training_day_exercises?: {
    sets: number;
    exercise_catalog?: { primary_muscle_group: string } | null;
  } | null;
}

interface TrainingSession {
  id: string;
  training_day_id: string;
  completed_at: string;
  status: string;
  training_session_exercises: TrainingSessionExercise[];
}

interface TechniqueModal {
  name: string;
  instructions: string;
}

interface TrainingDay {
  id: string;
  code: string;
  title: string;
  order_index: number;
  focus?: string | null;
  recommended_weekdays?: string[];
  training_day_exercises: DayExercise[];
}

interface TrainingPlan {
  id: string;
  level: string;
  name: string;
  start_date: string;
  expected_end_date: string;
  duration_weeks: number;
  current_week: number;
  weekly_frequency: number;
  status: string;
  adherence_percentage: number;
  generation_payload?: any;
  cardio_payload?: any;
  training_days: TrainingDay[];
}

interface TrainingProfile {
  sex: 'masculino' | 'feminino';
  age: string;
  trainingExperienceYears: string;
  trainingLocation: 'academia' | 'casa';
  goals: string[];
  restrictionsText: string;
  priorityMuscleGroup: string;
}

const FORM_INICIAL: TrainingProfile = {
  sex: 'masculino',
  age: '',
  trainingExperienceYears: '0',
  trainingLocation: 'academia',
  goals: [],
  restrictionsText: '',
  priorityMuscleGroup: '',
};

const GOALS = ['Manutencao da saude', 'Emagrecimento', 'Ganho de massa muscular'];
const PRIORIDADES = ['Peitoral', 'Costas', 'Ombros', 'Biceps', 'Triceps', 'Quadriceps', 'Gluteos', 'Posteriores de coxa', 'Panturrilhas', 'Abdomen'];

let toastId = 0;

function parseNumeroBR(valor: string) {
  const numero = Number(String(valor || '0').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(numero) ? numero : 0;
}

function formatarData(valor?: string) {
  if (!valor) return '-';
  return new Date(`${valor}T12:00:00`).toLocaleDateString('pt-BR');
}

function semanaAtual(plano: TrainingPlan) {
  const inicio = new Date(`${plano.start_date}T12:00:00`).getTime();
  const hoje = new Date();
  const diff = Math.max(0, hoje.getTime() - inicio);
  return Math.min(plano.duration_weeks, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1);
}

function inicioDaSemana(data = new Date()) {
  const inicio = new Date(data);
  const dia = inicio.getDay();
  inicio.setDate(inicio.getDate() - (dia === 0 ? 6 : dia - 1));
  inicio.setHours(0, 0, 0, 0);
  return inicio;
}

function fimDaSemana(inicio: Date) {
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 6);
  fim.setHours(23, 59, 59, 999);
  return fim;
}

function formatarDataCurta(data: Date) {
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}

function numeroRegistrado(valor?: string | null) {
  const encontrado = String(valor ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/);
  return encontrado ? Number(encontrado[0]) : 0;
}

function repeticoesTotais(valor: string | null | undefined, sets: number) {
  const numeros = String(valor ?? '').match(/\d+(?:[.,]\d+)?/g)?.map(item => Number(item.replace(',', '.'))) ?? [];
  if (!numeros.length) return 0;
  return numeros.length === 1 ? numeros[0] * sets : numeros.reduce((total, item) => total + item, 0);
}

function formatarCompacto(valor: number) {
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(valor);
}

function formatarRotuloGrafico(valor: number) {
  if (valor >= 1_000_000) return `${(valor / 1_000_000).toFixed(valor >= 10_000_000 ? 0 : 1).replace('.', ',')} mi`;
  if (valor >= 1_000) return `${(valor / 1_000).toFixed(valor >= 10_000 ? 0 : 1).replace('.', ',')} mil`;
  return Math.round(valor).toLocaleString('pt-BR');
}

function normalizarErro(error: any) {
  if (typeof error === 'string') return error;
  return error?.message || 'Erro inesperado.';
}

export default function MeuTreinoPage() {
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [form, setForm] = useState<TrainingProfile>({ ...FORM_INICIAL });
  const [plano, setPlano] = useState<TrainingPlan | null>(null);
  const [historico, setHistorico] = useState<TrainingPlan[]>([]);
  const [aba, setAba] = useState('A');
  const [video, setVideo] = useState<ExerciseCatalog | null>(null);
  const [tecnica, setTecnica] = useState<TechniqueModal | null>(null);
  const [substituto, setSubstituto] = useState<ExerciseCatalog | null>(null);
  const [sessoes, setSessoes] = useState<TrainingSession[]>([]);
  const [toasts, setToasts] = useState<Array<{ id: number; texto: string; tipo: ToastTipo }>>([]);
  const [cargas, setCargas] = useState<Record<string, string>>({});
  const [reps, setReps] = useState<Record<string, string>>({});

  const toast = useCallback((texto: string, tipo: ToastTipo = 'info') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, texto, tipo }]);
    window.setTimeout(() => setToasts(prev => prev.filter(item => item.id !== id)), 4500);
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('training_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profile) {
        setForm({
          sex: profile.sex ?? 'masculino',
          age: String(profile.age ?? ''),
          trainingExperienceYears: String(profile.training_experience_years ?? '0').replace('.', ','),
          trainingLocation: profile.training_location ?? 'academia',
          goals: Array.isArray(profile.goals) ? profile.goals : [],
          restrictionsText: profile.restrictions_text ?? '',
          priorityMuscleGroup: profile.priority_muscle_group ?? '',
        });
      }

      const { data, error } = await supabase
        .from('training_plans')
        .select(`
          *,
          training_days (
            *,
            training_day_exercises (
              *,
              exercise_catalog!training_day_exercises_exercise_id_fkey (*),
              substitute_exercise:exercise_catalog!training_day_exercises_substitute_exercise_id_fkey (*)
            )
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const planos = (data ?? []) as TrainingPlan[];
      const ativo = planos.find(item => item.status === 'active' || item.status === 'paused') ?? null;
      setPlano(ativo ? ordenarPlano(ativo) : null);
      setHistorico(planos.filter(item => item.id !== ativo?.id).map(ordenarPlano));
      if (ativo?.training_days?.[0]) setAba(ativo.training_days[0].code);

      const inicioHistorico = inicioDaSemana();
      inicioHistorico.setDate(inicioHistorico.getDate() - (11 * 7));
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('training_sessions')
        .select(`
          id, training_day_id, completed_at, status,
          training_session_exercises (
            completed, load_used, completed_repetitions,
            training_day_exercises (
              sets,
              exercise_catalog!training_day_exercises_exercise_id_fkey (primary_muscle_group)
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .gte('completed_at', inicioHistorico.toISOString())
        .order('completed_at', { ascending: true });
      if (sessionsError) throw sessionsError;
      setSessoes((sessionsData ?? []) as unknown as TrainingSession[]);
    } catch (error: any) {
      toast(`Erro ao carregar treino: ${normalizarErro(error)}`, 'erro');
    } finally {
      setCarregando(false);
    }
  }, [router, toast]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const diaSelecionado = useMemo(() => plano?.training_days.find(day => day.code === aba), [plano, aba]);
  const week = plano ? semanaAtual(plano) : 1;
  const progresso = plano ? Math.min(100, Math.round((week / plano.duration_weeks) * 100)) : 0;
  const precisaPrioridade = form.goals.includes('Ganho de massa muscular');
  const dashboard = useMemo(() => {
    const atual = inicioDaSemana();
    const weeks = Array.from({ length: 12 }, (_, index) => {
      const start = new Date(atual);
      start.setDate(start.getDate() - ((11 - index) * 7));
      return { start, end: fimDaSemana(start), sessions: [] as TrainingSession[] };
    });
    for (const session of sessoes) {
      const data = new Date(session.completed_at);
      const weekItem = weeks.find(item => data >= item.start && data <= item.end);
      if (weekItem) weekItem.sessions.push(session);
    }

    const groups = new Set<string>();
    const summaries = weeks.map((weekItem, index) => {
      const series: Record<string, number> = {};
      const volume: Record<string, number> = {};
      for (const session of weekItem.sessions) {
        for (const item of session.training_session_exercises ?? []) {
          if (!item.completed) continue;
          const prescription = item.training_day_exercises;
          const group = prescription?.exercise_catalog?.primary_muscle_group || 'Outros';
          const sets = Number(prescription?.sets || 0);
          groups.add(group);
          series[group] = (series[group] || 0) + sets;
          volume[group] = (volume[group] || 0) + (numeroRegistrado(item.load_used) * repeticoesTotais(item.completed_repetitions, sets));
        }
      }
      const dias = new Set(weekItem.sessions.map(item => new Date(item.completed_at).toISOString().slice(0, 10))).size;
      return { ...weekItem, number: index + 1, days: dias, series, volume };
    });
    return { weeks: summaries, groups: Array.from(groups).sort(), current: summaries[summaries.length - 1] };
  }, [sessoes]);
  const treinosConcluidosNaSemana = useMemo(() => {
    const inicio = inicioDaSemana();
    const fim = fimDaSemana(inicio);
    return new Set(sessoes.filter(item => {
      const data = new Date(item.completed_at);
      return data >= inicio && data <= fim;
    }).map(item => item.training_day_id));
  }, [sessoes]);

  function ordenarPlano(item: TrainingPlan): TrainingPlan {
    return {
      ...item,
      training_days: [...(item.training_days ?? [])]
        .sort((a, b) => a.order_index - b.order_index)
        .map(day => ({
          ...day,
          training_day_exercises: [...(day.training_day_exercises ?? [])].sort((a, b) => a.order_index - b.order_index),
        })),
    };
  }

  function alternarGoal(goal: string) {
    setForm(prev => ({
      ...prev,
      goals: prev.goals.includes(goal) ? prev.goals.filter(item => item !== goal) : [...prev.goals, goal],
    }));
  }

  async function gerarPlano(event: React.FormEvent) {
    event.preventDefault();
    if (!form.age || parseNumeroBR(form.age) < 12 || parseNumeroBR(form.age) > 90) {
      toast('Informe uma idade valida.', 'erro');
      return;
    }
    if (form.goals.length === 0) {
      toast('Selecione pelo menos um objetivo.', 'erro');
      return;
    }
    if (precisaPrioridade && !form.priorityMuscleGroup) {
      toast('Selecione o grupo muscular prioritario.', 'erro');
      return;
    }

    setGerando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessao expirada.');

      const resposta = await fetch('/api/gerar-plano-treino', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          sex: form.sex,
          age: Math.round(parseNumeroBR(form.age)),
          trainingExperienceYears: parseNumeroBR(form.trainingExperienceYears),
          trainingLocation: form.trainingLocation,
          goals: form.goals,
          restrictionsText: form.restrictionsText,
          priorityMuscleGroup: form.priorityMuscleGroup || null,
        }),
      });

      const json = await resposta.json();
      if (!resposta.ok) throw new Error(json.error || 'Nao foi possivel gerar o plano.');
      toast('Plano de treino gerado.', 'sucesso');
      await carregar();
    } catch (error: any) {
      toast(`Erro ao gerar treino: ${normalizarErro(error)}`, 'erro');
    } finally {
      setGerando(false);
    }
  }

  async function concluirTreino(day: TrainingDay) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !plano) throw new Error('Sessao expirada.');

      const { data: session, error: sessionError } = await supabase
        .from('training_sessions')
        .insert({
          user_id: user.id,
          training_plan_id: plano.id,
          training_day_id: day.id,
          status: 'completed',
          completed_at: new Date().toISOString(),
          perceived_difficulty: 'Adequado',
        })
        .select('*')
        .single();

      if (sessionError) throw sessionError;

      const rows = day.training_day_exercises.map(item => ({
        training_session_id: session.id,
        training_day_exercise_id: item.id,
        completed: true,
        load_used: cargas[item.id] || null,
        completed_repetitions: reps[item.id] || null,
      }));
      if (rows.length) {
        const { error } = await supabase.from('training_session_exercises').insert(rows);
        if (error) throw error;
      }

      toast(`${day.title} registrado como concluido.`, 'sucesso');
      const abaAtual = aba;
      await carregar();
      setAba(abaAtual);
    } catch (error: any) {
      toast(`Erro ao registrar treino: ${normalizarErro(error)}`, 'erro');
    }
  }

  return (
    <div className="relative mx-auto min-h-screen max-w-md bg-gray-50 pb-28 font-sans shadow-2xl md:max-w-6xl">
      <div className="pointer-events-none fixed left-1/2 top-4 z-[140] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 space-y-2">
        {toasts.map(item => (
          <div key={item.id} className={`pointer-events-auto rounded-xl p-4 text-center text-sm font-bold shadow-xl ${
            item.tipo === 'erro' ? 'bg-red-100 text-red-700' : item.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
          }`}>
            {item.texto}
          </div>
        ))}
      </div>

      <header className="border-b border-gray-100 bg-white p-4 shadow-sm md:sticky md:top-0 md:z-30 md:px-6">
        <div className="flex items-center gap-3">
          <div className="w-36 md:w-44"><Logo /></div>
          <div className="ml-auto text-right">
            <p className="text-xs font-black uppercase tracking-wider text-viva-roxo">Meu Treino</p>
            <p className="text-[11px] font-bold text-gray-400">Plano personalizado</p>
          </div>
        </div>
      </header>

      <main className="space-y-4 p-4 md:p-6">
        {carregando ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm font-bold text-gray-400 shadow-sm">Carregando treino...</div>
        ) : !plano ? (
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h1 className="text-2xl font-black text-gray-900">Criar Plano de Treino</h1>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-gray-500">
              Preencha sua avaliacao inicial para gerar um plano coerente com seu nivel, local de treino e restricoes.
            </p>
            <form onSubmit={gerarPlano} className="mt-5 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-black uppercase text-gray-400">Sexo</span>
                  <select value={form.sex} onChange={e => setForm({ ...form, sex: e.target.value as any })} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm font-bold text-gray-900">
                    <option value="masculino">Masculino</option>
                    <option value="feminino">Feminino</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-black uppercase text-gray-400">Idade</span>
                  <input inputMode="numeric" value={form.age} onChange={e => setForm({ ...form, age: e.target.value.replace(/\D/g, '') })} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm font-bold text-gray-900" placeholder="Ex: 34" />
                </label>
                <label className="block">
                  <span className="text-xs font-black uppercase text-gray-400">Tempo de treino (anos)</span>
                  <input inputMode="decimal" value={form.trainingExperienceYears} onChange={e => setForm({ ...form, trainingExperienceYears: e.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm font-bold text-gray-900" placeholder="0 ou 0,5" />
                </label>
                <label className="block">
                  <span className="text-xs font-black uppercase text-gray-400">Local</span>
                  <select value={form.trainingLocation} onChange={e => setForm({ ...form, trainingLocation: e.target.value as any })} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm font-bold text-gray-900">
                    <option value="academia">Academia</option>
                    <option value="casa">Casa</option>
                  </select>
                </label>
              </div>

              <div>
                <p className="text-xs font-black uppercase text-gray-400">Objetivos</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {GOALS.map(goal => (
                    <button key={goal} type="button" onClick={() => alternarGoal(goal)} className={`rounded-full px-4 py-2 text-xs font-black ${form.goals.includes(goal) ? 'bg-viva-roxo text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {goal}
                    </button>
                  ))}
                </div>
              </div>

              {precisaPrioridade && (
                <label className="block">
                  <span className="text-xs font-black uppercase text-gray-400">Grupo muscular prioritario</span>
                  <select value={form.priorityMuscleGroup} onChange={e => setForm({ ...form, priorityMuscleGroup: e.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm font-bold text-gray-900">
                    <option value="">Selecione</option>
                    {PRIORIDADES.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="text-xs font-black uppercase text-gray-400">Restricoes, dores ou equipamentos indisponiveis</span>
                <textarea value={form.restrictionsText} onChange={e => setForm({ ...form, restrictionsText: e.target.value })} rows={4} className="mt-1 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm font-semibold text-gray-900" placeholder="Ex: dor no joelho, evitar agachamento, sem barra fixa..." />
              </label>

              <div className="rounded-2xl border border-yellow-100 bg-yellow-50 p-4 text-xs font-bold leading-relaxed text-yellow-800">
                O plano de treino nao substitui avaliacao medica, fisioterapeutica ou acompanhamento presencial de um profissional de Educacao Fisica.
              </div>

              <button disabled={gerando} className="w-full rounded-2xl bg-viva-verde py-4 text-sm font-black text-viva-roxo shadow-sm disabled:opacity-60">
                {gerando ? 'Gerando plano...' : 'Gerar meu plano'}
              </button>
            </form>
          </section>
        ) : (
          <>
            <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="bg-gradient-to-r from-viva-roxo to-gray-950 p-5 text-white">
                <p className="text-xs font-black uppercase tracking-wider text-viva-verde">Plano ativo</p>
                <h1 className="mt-1 text-2xl font-black">{plano.name}</h1>
                <p className="mt-2 text-sm font-bold text-white/75">
                  Semana {week} de {plano.duration_weeks} - {plano.weekly_frequency} treinos por semana
                </p>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-viva-verde" style={{ width: `${progresso}%` }} />
                </div>
              </div>
              <div className="grid gap-3 p-4 text-xs font-bold text-gray-500 md:grid-cols-4">
                <div className="rounded-xl bg-gray-50 p-3"><span className="block text-gray-400">Nivel</span><b className="text-gray-900">{plano.level}</b></div>
                <div className="rounded-xl bg-gray-50 p-3"><span className="block text-gray-400">Inicio</span><b className="text-gray-900">{formatarData(plano.start_date)}</b></div>
                <div className="rounded-xl bg-gray-50 p-3"><span className="block text-gray-400">Progressao</span><b className="text-gray-900">{formatarData(plano.expected_end_date)}</b></div>
                <div className="rounded-xl bg-gray-50 p-3"><span className="block text-gray-400">Status</span><b className="text-gray-900">{plano.status}</b></div>
              </div>
            </section>

            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex gap-2 overflow-x-auto pb-2">
                {plano.training_days.map(day => (
                  <button key={day.id} onClick={() => setAba(day.code)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black ${aba === day.code ? 'bg-viva-roxo text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {treinosConcluidosNaSemana.has(day.id) ? '✓ ' : ''}{day.title}
                  </button>
                ))}
                <button onClick={() => setAba('CARDIO')} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black ${aba === 'CARDIO' ? 'bg-viva-roxo text-white' : 'bg-gray-100 text-gray-600'}`}>Cardio</button>
                <button onClick={() => setAba('DASH')} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black ${aba === 'DASH' ? 'bg-viva-roxo text-white' : 'bg-gray-100 text-gray-600'}`}>Dashboard</button>
                <button onClick={() => setAba('HIST')} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black ${aba === 'HIST' ? 'bg-viva-roxo text-white' : 'bg-gray-100 text-gray-600'}`}>Historico</button>
              </div>

              {aba === 'CARDIO' ? (
                <div className="mt-4 rounded-2xl bg-viva-verde/10 p-4 text-sm font-bold text-gray-700">
                  <p className="text-lg font-black text-viva-roxo">Cardio</p>
                  <p className="mt-2">{plano.cardio_payload?.durationMinutes ?? 30} minutos, {plano.cardio_payload?.sessionsPerWeek ?? 4}x por semana.</p>
                  <p className="mt-1">Modalidades: {(plano.cardio_payload?.modalities ?? ['Esteira', 'Eliptico', 'Bicicleta']).join(', ')}.</p>
                  <p className="mt-1">FC estimada: {plano.cardio_payload?.heartRateMin} a {plano.cardio_payload?.heartRateMax} bpm.</p>
                  <p className="mt-2 text-xs text-gray-500">{plano.cardio_payload?.note}</p>
                </div>
              ) : aba === 'DASH' ? (
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-viva-roxo">Ultimas 12 semanas</p>
                    <h2 className="mt-1 text-xl font-black text-gray-900">Evolucao dos treinos</h2>
                  </div>

                  <div className="rounded-2xl bg-gray-950 p-4 text-white">
                    <p className="text-xs font-bold text-white/60">
                      Semana {dashboard.current.number} ({formatarDataCurta(dashboard.current.start)} a {formatarDataCurta(dashboard.current.end)})
                    </p>
                    <p className="mt-2 text-3xl font-black text-viva-verde">{dashboard.current.days}</p>
                    <p className="text-xs font-bold text-white/70">dias de treino concluidos</p>
                  </div>

                  {dashboard.groups.length === 0 ? (
                    <p className="rounded-2xl bg-gray-50 p-8 text-center text-sm font-bold text-gray-400">Registre carga e repeticoes para acompanhar sua evolucao.</p>
                  ) : dashboard.groups.map(group => {
                    const maxVolume = Math.max(1, ...dashboard.weeks.map(item => item.volume[group] || 0));
                    return (
                      <section key={group} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-black text-gray-900">{group}</h3>
                            <p className="mt-1 text-xs font-bold text-gray-500">
                              {formatarCompacto(dashboard.current.series[group] || 0)} series na semana
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-black text-viva-roxo">{formatarCompacto(dashboard.current.volume[group] || 0)} kg</p>
                            <p className="text-[10px] font-bold uppercase text-gray-400">volume</p>
                          </div>
                        </div>
                        <div className="mt-4 overflow-x-auto pb-1">
                          <div className="flex h-32 min-w-[620px] items-end gap-2 pt-5" aria-label={`Volume de ${group} nas ultimas 12 semanas`}>
                            {dashboard.weeks.map(weekItem => {
                              const value = weekItem.volume[group] || 0;
                              const height = value ? Math.max(8, Math.round((value / maxVolume) * 100)) : 3;
                              return (
                                <div key={weekItem.start.toISOString()} className="flex h-full min-w-0 flex-1 items-end">
                                  <div
                                    className={`relative w-full rounded-t bg-viva-roxo transition hover:bg-viva-verde ${value ? '' : 'opacity-15'}`}
                                    style={{ height: `${height}%` }}
                                    title={`Semana ${weekItem.number}: ${formatarCompacto(value)} kg`}
                                  >
                                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-black text-gray-600">
                                      {formatarRotuloGrafico(value)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="mt-1 flex justify-between text-[9px] font-bold text-gray-400"><span>12 sem.</span><span>Atual</span></div>
                      </section>
                    );
                  })}
                </div>
              ) : aba === 'HIST' ? (
                <div className="mt-4 space-y-2">
                  {historico.length === 0 ? <p className="py-8 text-center text-sm font-bold text-gray-400">Nenhum plano anterior.</p> : historico.map(item => (
                    <div key={item.id} className="rounded-xl border border-gray-100 p-3 text-sm font-bold text-gray-600">
                      {item.name} - {formatarData(item.start_date)} a {formatarData(item.expected_end_date)} - {item.status}
                    </div>
                  ))}
                </div>
              ) : diaSelecionado ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <h2 className="text-lg font-black text-gray-900">{diaSelecionado.title}</h2>
                    <p className="text-xs font-bold text-gray-400">{diaSelecionado.focus}</p>
                  </div>
                  {diaSelecionado.training_day_exercises.map(item => (
                    <article key={item.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                      <div className="flex gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-viva-roxo text-sm font-black text-white">{item.order_index}</div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-black text-gray-900">{item.exercise_catalog?.name}</h3>
                          <p className="mt-1 text-xs font-bold text-gray-500">{item.exercise_catalog?.primary_muscle_group} - {item.exercise_catalog?.equipment || 'Equipamento livre'}</p>
                          <p className="mt-2 text-xs font-bold text-gray-700">{item.sets} series de {item.repetition_min}-{item.repetition_max} reps - descanso {item.rest_seconds}s</p>
                          {item.advanced_technique && (
                            <button
                              type="button"
                              onClick={() => {
                                const name = item.advanced_technique || 'Tecnica avancada';
                                setTecnica({ name, instructions: getAdvancedTechniqueInstructions(name) || item.advanced_technique_instructions || '' });
                              }}
                              className="mt-2 rounded-lg bg-purple-50 px-3 py-2 text-left text-xs font-black text-viva-roxo hover:bg-purple-100"
                            >
                              Como fazer: {item.advanced_technique}
                            </button>
                          )}
                          <p className="mt-2 text-xs font-semibold leading-relaxed text-gray-500">{item.notes}</p>
                          {item.substitute_exercise && (
                            <button
                              type="button"
                              onClick={() => setSubstituto(item.substitute_exercise || null)}
                              className="mt-2 block text-left text-xs font-black text-green-700 underline decoration-green-300 underline-offset-2"
                            >
                              Aparelho ocupado? Ver exercicio substituto
                            </button>
                          )}
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <input value={cargas[item.id] ?? ''} onChange={e => setCargas(prev => ({ ...prev, [item.id]: e.target.value }))} className="rounded-xl border border-gray-200 bg-white p-2 text-xs font-bold" placeholder="Carga usada" />
                            <input value={reps[item.id] ?? ''} onChange={e => setReps(prev => ({ ...prev, [item.id]: e.target.value }))} className="rounded-xl border border-gray-200 bg-white p-2 text-xs font-bold" placeholder="Reps feitas" />
                          </div>
                        </div>
                        <button type="button" onClick={() => setVideo(item.exercise_catalog)} className="h-10 w-10 shrink-0 rounded-full bg-viva-verde text-sm font-black text-viva-roxo">▶</button>
                      </div>
                    </article>
                  ))}
                  <button
                    onClick={() => concluirTreino(diaSelecionado)}
                    disabled={treinosConcluidosNaSemana.has(diaSelecionado.id)}
                    className="w-full rounded-2xl bg-viva-roxo py-4 text-sm font-black text-white shadow-sm disabled:bg-green-600 disabled:opacity-90"
                  >
                    {treinosConcluidosNaSemana.has(diaSelecionado.id) ? '✓ Treino concluido nesta semana' : 'Registrar treino concluido'}
                  </button>
                </div>
              ) : null}
            </section>

            <button type="button" onClick={() => setPlano(null)} className="w-full rounded-2xl border border-viva-roxo/20 bg-white py-3 text-sm font-black text-viva-roxo">
              Gerar novo plano
            </button>
          </>
        )}
      </main>

      {tecnica && (
        <div className="fixed inset-0 z-[160] flex items-end bg-black/55 p-0 md:items-center md:justify-center md:p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-tecnica">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl md:max-w-lg md:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-viva-verde">Tecnica avancada</p>
                <h2 id="titulo-tecnica" className="mt-1 text-xl font-black text-gray-900">{tecnica.name}</h2>
              </div>
              <button type="button" onClick={() => setTecnica(null)} className="h-10 w-10 rounded-full bg-gray-100 text-sm font-black text-gray-600" aria-label="Fechar">x</button>
            </div>
            <p className="mt-4 whitespace-pre-line text-sm font-semibold leading-relaxed text-gray-600">{tecnica.instructions}</p>
            <div className="mt-4 rounded-xl bg-yellow-50 p-3 text-xs font-bold leading-relaxed text-yellow-800">
              Tecnicas avancadas elevam bastante o esforco. Use apenas quando prescritas e interrompa a serie se perder a postura ou sentir dor.
            </div>
          </div>
        </div>
      )}

      {substituto && (
        <div className="fixed inset-0 z-[160] flex items-end bg-black/55 p-0 md:items-center md:justify-center md:p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-substituto">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl md:max-w-lg md:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-green-600">Exercicio substituto</p>
                <h2 id="titulo-substituto" className="mt-1 text-xl font-black text-gray-900">{substituto.name}</h2>
              </div>
              <button type="button" onClick={() => setSubstituto(null)} className="h-10 w-10 rounded-full bg-gray-100 text-sm font-black text-gray-600" aria-label="Fechar">x</button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold">
              <div className="rounded-xl bg-gray-50 p-3"><span className="block text-gray-400">Grupo muscular</span><b className="text-gray-900">{substituto.primary_muscle_group}</b></div>
              <div className="rounded-xl bg-gray-50 p-3"><span className="block text-gray-400">Equipamento</span><b className="text-gray-900">{substituto.equipment || 'Peso corporal'}</b></div>
            </div>
            <p className="mt-4 text-sm font-semibold leading-relaxed text-gray-600">
              {substituto.instructions || 'Mantenha as mesmas series, repeticoes e descanso prescritos para o exercicio original.'}
            </p>
            <button type="button" onClick={() => { setSubstituto(null); setVideo(substituto); }} className="mt-5 w-full rounded-2xl bg-viva-verde py-3 text-sm font-black text-viva-roxo">
              Ver demonstracao
            </button>
          </div>
        </div>
      )}

      {video && (
        <div className="fixed inset-0 z-[150] flex items-end bg-black/50 md:items-center md:justify-center">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl md:max-w-xl md:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-gray-900">{video.name}</h2>
                <p className="text-xs font-bold text-gray-400">{video.primary_muscle_group}</p>
              </div>
              <button onClick={() => setVideo(null)} className="rounded-full bg-gray-100 px-3 py-2 text-sm font-black text-gray-500">x</button>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl bg-gray-100">
              {video.video_url ? (
                <video src={video.video_url} controls loop muted preload="metadata" poster={video.video_thumbnail_url ?? undefined} className="h-72 w-full object-cover" />
              ) : (
                <div className="flex h-56 items-center justify-center p-8 text-center text-sm font-black text-gray-400">Video demonstrativo em breve.</div>
              )}
            </div>
            <p className="mt-4 text-sm font-semibold leading-relaxed text-gray-600">{video.instructions || 'Execute com controle, amplitude confortavel e tecnica adequada.'}</p>
            {video.precautions && <p className="mt-3 rounded-xl bg-yellow-50 p-3 text-xs font-bold text-yellow-800">{video.precautions}</p>}
          </div>
        </div>
      )}

      <BottomNav active="treino" />
    </div>
  );
}
