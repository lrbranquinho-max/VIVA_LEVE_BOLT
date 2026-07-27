"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '../../components/Logo';
import { supabase } from '../../supabase';

type Tab = 'plans' | 'editor' | 'students' | 'access';
type ToastType = 'success' | 'error' | 'info';

interface CatalogExercise {
  id: number;
  name: string;
  primary_muscle_group: string;
  equipment?: string | null;
}

interface ExerciseForm {
  exercise_id: string;
  substitute_exercise_id: string;
  sets: string;
  repetition_min: string;
  repetition_max: string;
  rest_seconds: string;
  load_guidance: string;
  intensity_guidance: string;
  technique: string;
  notes: string;
}

interface DayForm {
  code: string;
  title: string;
  focus: string;
  recommended_weekdays: string[];
  exercises: ExerciseForm[];
}

interface PlanForm {
  id?: string;
  name: string;
  level: string;
  duration_weeks: string;
  weekly_frequency: string;
  cardio_recommendations: string;
  schedule_notes: string;
  general_notes: string;
  days: DayForm[];
}

interface SavedPlan {
  id: string;
  trainer_id: string;
  name: string;
  level: string;
  duration_weeks: number;
  weekly_frequency: number;
  cardio_recommendations?: string | null;
  schedule_notes?: string | null;
  general_notes?: string | null;
  status: string;
  updated_at: string;
  trainer_plan_days: Array<{
    id: string;
    code: string;
    title: string;
    order_index: number;
    focus?: string | null;
    recommended_weekdays?: string[];
    trainer_plan_exercises: Array<{
      exercise_id: number;
      substitute_exercise_id?: number | null;
      order_index: number;
      sets: number;
      repetition_min: number;
      repetition_max: number;
      rest_seconds: number;
      load_guidance?: string | null;
      intensity_guidance?: string | null;
      technique?: string | null;
      notes?: string | null;
      exercise_catalog?: CatalogExercise | null;
    }>;
  }>;
}

interface Assignment {
  id: string;
  student_email: string;
  trainer_name: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  sent_at: string;
  responded_at?: string | null;
  activated_plan_id?: string | null;
  trainer_plan_templates?: { name: string } | null;
}

interface AccessRole {
  email: string;
  role: 'admin' | 'trainer';
  nome: string;
  ativo: boolean;
}

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const TECHNIQUES = ['', 'Drop-set', 'Rest-Pause', 'SST', 'Bi-set', 'Superset', 'Circuito'];

function emptyExercise(): ExerciseForm {
  return {
    exercise_id: '',
    substitute_exercise_id: '',
    sets: '3',
    repetition_min: '8',
    repetition_max: '12',
    rest_seconds: '90',
    load_guidance: '',
    intensity_guidance: '',
    technique: '',
    notes: '',
  };
}

function emptyDay(index = 0): DayForm {
  const code = String.fromCharCode(65 + index);
  return {
    code,
    title: `Treino ${code}`,
    focus: '',
    recommended_weekdays: [],
    exercises: [emptyExercise()],
  };
}

function emptyPlan(): PlanForm {
  return {
    name: '',
    level: 'personalizado',
    duration_weeks: '8',
    weekly_frequency: '3',
    cardio_recommendations: '',
    schedule_notes: '',
    general_notes: '',
    days: [emptyDay(0), emptyDay(1), emptyDay(2)],
  };
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function statusLabel(status: Assignment['status']) {
  return {
    pending: 'Aguardando aluno',
    accepted: 'Aceito',
    rejected: 'Recusado',
    cancelled: 'Cancelado',
  }[status];
}

export default function TrainerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('plans');
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [form, setForm] = useState<PlanForm>(emptyPlan);
  const [emails, setEmails] = useState('');
  const [exerciseSearch, setExerciseSearch] = useState<Record<string, string>>({});
  const [userEmail, setUserEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessRoles, setAccessRoles] = useState<AccessRole[]>([]);
  const [accessForm, setAccessForm] = useState({ email: '', nome: '', role: 'trainer' as 'admin' | 'trainer' });
  const [toasts, setToasts] = useState<Array<{ id: number; text: string; type: ToastType }>>([]);

  const toast = useCallback((text: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(current => [...current, { id, text, type }]);
    window.setTimeout(() => setToasts(current => current.filter(item => item.id !== id)), 5000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        router.replace('/login');
        return;
      }

      const [{ data: canManage, error: accessError }, { data: adminAccess }] = await Promise.all([
        supabase.rpc('can_manage_training'),
        supabase.rpc('is_viva_leve_admin'),
      ]);
      if (accessError || !canManage) {
        await supabase.auth.signOut();
        router.replace('/login');
        return;
      }

      setUserEmail(userData.user.email ?? '');
      setIsAdmin(Boolean(adminAccess));

      const [catalogResult, plansResult, assignmentsResult] = await Promise.all([
        supabase
          .from('exercise_catalog')
          .select('id,name,primary_muscle_group,equipment')
          .eq('is_active', true)
          .order('primary_muscle_group')
          .order('name'),
        supabase
          .from('trainer_plan_templates')
          .select(`
            *,
            trainer_plan_days (
              *,
              trainer_plan_exercises (
                *,
                exercise_catalog!trainer_plan_exercises_exercise_id_fkey (
                  id,name,primary_muscle_group,equipment
                )
              )
            )
          `)
          .neq('status', 'archived')
          .order('updated_at', { ascending: false }),
        supabase
          .from('trainer_plan_assignments')
          .select('*, trainer_plan_templates(name)')
          .order('sent_at', { ascending: false }),
      ]);

      if (catalogResult.error) throw catalogResult.error;
      if (plansResult.error) throw plansResult.error;
      if (assignmentsResult.error) throw assignmentsResult.error;
      setCatalog((catalogResult.data ?? []) as CatalogExercise[]);
      setPlans((plansResult.data ?? []) as unknown as SavedPlan[]);
      setAssignments((assignmentsResult.data ?? []) as unknown as Assignment[]);
      if (adminAccess) {
        const { data: roleData, error: roleError } = await supabase
          .from('admin_usuario_roles')
          .select('email,role,nome,ativo')
          .order('nome')
          .order('email');
        if (roleError) throw roleError;
        setAccessRoles((roleData ?? []) as AccessRole[]);
      }
    } catch (error: any) {
      toast(`Erro ao carregar área do treinador: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [router, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredCatalog = useCallback((key: string) => {
    const terms = normalize(exerciseSearch[key] ?? '').split(/\s+/).filter(Boolean);
    if (!terms.length) return catalog;
    return catalog.filter(exercise => {
      const haystack = normalize(`${exercise.name} ${exercise.primary_muscle_group} ${exercise.equipment ?? ''}`);
      return terms.every(term => haystack.includes(term));
    });
  }, [catalog, exerciseSearch]);

  const assignmentSummary = useMemo(() => ({
    pending: assignments.filter(item => item.status === 'pending').length,
    accepted: assignments.filter(item => item.status === 'accepted').length,
    rejected: assignments.filter(item => item.status === 'rejected').length,
  }), [assignments]);

  const editPlan = (plan: SavedPlan) => {
    const days = [...(plan.trainer_plan_days ?? [])]
      .sort((a, b) => a.order_index - b.order_index)
      .map(day => ({
        code: day.code,
        title: day.title,
        focus: day.focus ?? '',
        recommended_weekdays: Array.isArray(day.recommended_weekdays) ? day.recommended_weekdays : [],
        exercises: [...(day.trainer_plan_exercises ?? [])]
          .sort((a, b) => a.order_index - b.order_index)
          .map(exercise => ({
            exercise_id: String(exercise.exercise_id),
            substitute_exercise_id: exercise.substitute_exercise_id ? String(exercise.substitute_exercise_id) : '',
            sets: String(exercise.sets),
            repetition_min: String(exercise.repetition_min),
            repetition_max: String(exercise.repetition_max),
            rest_seconds: String(exercise.rest_seconds),
            load_guidance: exercise.load_guidance ?? '',
            intensity_guidance: exercise.intensity_guidance ?? '',
            technique: exercise.technique ?? '',
            notes: exercise.notes ?? '',
          })),
      }));

    setForm({
      id: plan.id,
      name: plan.name,
      level: plan.level,
      duration_weeks: String(plan.duration_weeks),
      weekly_frequency: String(plan.weekly_frequency),
      cardio_recommendations: plan.cardio_recommendations ?? '',
      schedule_notes: plan.schedule_notes ?? '',
      general_notes: plan.general_notes ?? '',
      days: days.length ? days : [emptyDay()],
    });
    setEmails('');
    setTab('editor');
  };

  const updateDay = (dayIndex: number, patch: Partial<DayForm>) => {
    setForm(current => ({
      ...current,
      days: current.days.map((day, index) => index === dayIndex ? { ...day, ...patch } : day),
    }));
  };

  const updateExercise = (dayIndex: number, exerciseIndex: number, patch: Partial<ExerciseForm>) => {
    setForm(current => ({
      ...current,
      days: current.days.map((day, index) => index === dayIndex ? {
        ...day,
        exercises: day.exercises.map((exercise, position) =>
          position === exerciseIndex ? { ...exercise, ...patch } : exercise),
      } : day),
    }));
  };

  const moveExercise = (dayIndex: number, exerciseIndex: number, direction: -1 | 1) => {
    setForm(current => {
      const days = [...current.days];
      const day = { ...days[dayIndex], exercises: [...days[dayIndex].exercises] };
      const target = exerciseIndex + direction;
      if (target < 0 || target >= day.exercises.length) return current;
      [day.exercises[exerciseIndex], day.exercises[target]] = [day.exercises[target], day.exercises[exerciseIndex]];
      days[dayIndex] = day;
      return { ...current, days };
    });
  };

  const savePlan = async () => {
    setSaving(true);
    try {
      if (!form.name.trim()) throw new Error('Informe o nome do plano.');
      if (!form.days.length) throw new Error('Adicione ao menos um treino.');
      if (form.days.some(day => !day.exercises.length || day.exercises.some(exercise => !exercise.exercise_id))) {
        throw new Error('Selecione todos os exercícios antes de salvar.');
      }

      const payload = {
        ...form,
        duration_weeks: Number(form.duration_weeks),
        weekly_frequency: Number(form.weekly_frequency),
        days: form.days.map(day => ({
          ...day,
          exercises: day.exercises.map(exercise => ({
            ...exercise,
            exercise_id: Number(exercise.exercise_id),
            substitute_exercise_id: exercise.substitute_exercise_id
              ? Number(exercise.substitute_exercise_id)
              : null,
            sets: Number(exercise.sets),
            repetition_min: Number(exercise.repetition_min),
            repetition_max: Number(exercise.repetition_max),
            rest_seconds: Number(exercise.rest_seconds),
          })),
        })),
      };

      const { data: planId, error } = await supabase.rpc('save_trainer_plan', { plan_payload: payload });
      if (error) throw error;

      const targetEmails = Array.from(new Set(
        emails.split(/[\n,;]+/).map(item => item.trim().toLowerCase()).filter(Boolean),
      ));
      if (targetEmails.length) {
        const { data: result, error: assignmentError } = await supabase.rpc('assign_trainer_plan', {
          target_template_id: planId,
          target_emails: targetEmails,
        });
        if (assignmentError) throw assignmentError;
        const missing = Array.isArray(result?.not_found) ? result.not_found : [];
        if (missing.length) {
          toast(`Plano salvo. E-mails não localizados ou com perfil especial: ${missing.join(', ')}`, 'info');
        } else {
          toast(`Plano salvo e enviado para ${targetEmails.length} aluno(s).`, 'success');
        }
      } else {
        toast('Plano salvo com sucesso.', 'success');
      }

      setForm(emptyPlan());
      setEmails('');
      setTab('plans');
      await loadData();
    } catch (error: any) {
      toast(`Erro ao salvar plano: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const archivePlan = async (planId: string) => {
    try {
      const { error } = await supabase
        .from('trainer_plan_templates')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', planId);
      if (error) throw error;
      toast('Plano arquivado.', 'success');
      await loadData();
    } catch (error: any) {
      toast(`Erro ao arquivar plano: ${error.message}`, 'error');
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const saveAccessRole = async () => {
    try {
      if (!accessForm.email.includes('@')) throw new Error('Informe um e-mail válido.');
      const { error } = await supabase.from('admin_usuario_roles').upsert({
        email: accessForm.email.trim().toLowerCase(),
        nome: accessForm.nome.trim(),
        role: accessForm.role,
        ativo: true,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'email,role' });
      if (error) throw error;
      toast('Perfil de acesso salvo.', 'success');
      setAccessForm({ email: '', nome: '', role: 'trainer' });
      await loadData();
    } catch (error: any) {
      toast(`Erro ao salvar acesso: ${error.message}`, 'error');
    }
  };

  const toggleAccessRole = async (item: AccessRole) => {
    try {
      if (item.ativo && item.role === 'admin' && item.email.toLowerCase() === userEmail.toLowerCase()) {
        throw new Error('Você não pode desativar o próprio acesso administrativo.');
      }
      const { error } = await supabase
        .from('admin_usuario_roles')
        .update({ ativo: !item.ativo, atualizado_em: new Date().toISOString() })
        .eq('email', item.email)
        .eq('role', item.role);
      if (error) throw error;
      toast(`Acesso ${item.ativo ? 'desativado' : 'ativado'}.`, 'success');
      await loadData();
    } catch (error: any) {
      toast(`Erro ao alterar acesso: ${error.message}`, 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-viva-roxo" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <div className="fixed right-4 top-4 z-50 w-[min(360px,calc(100%-2rem))] space-y-2">
        {toasts.map(item => (
          <div
            key={item.id}
            className={`rounded-xl px-4 py-3 text-sm font-bold shadow-lg ${
              item.type === 'success'
                ? 'bg-green-600 text-white'
                : item.type === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-950 text-white'
            }`}
          >
            {item.text}
          </div>
        ))}
      </div>

      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-gray-200 bg-white lg:w-72 lg:border-b-0 lg:border-r">
          <div className="border-b border-gray-100 p-5">
            <div className="w-36"><Logo /></div>
            <p className="mt-3 text-xs font-bold text-gray-500">{userEmail}</p>
            <p className="mt-1 text-xs font-black uppercase text-viva-roxo">
              {isAdmin ? 'Administrador' : 'Treinador'}
            </p>
          </div>
          <nav className="flex gap-2 overflow-x-auto p-4 lg:flex-col">
            {[
              { id: 'plans' as const, label: 'Meus planos', detail: `${plans.length} planos` },
              { id: 'editor' as const, label: 'Criar plano', detail: 'Montagem manual' },
              { id: 'students' as const, label: 'Alunos', detail: `${assignmentSummary.accepted} ativos` },
            ].map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'editor' && tab !== 'editor') setForm(emptyPlan());
                  setTab(item.id);
                }}
                className={`min-w-40 rounded-lg px-4 py-3 text-left transition lg:min-w-0 ${
                  tab === item.id ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="block text-sm font-black">{item.label}</span>
                <span className="mt-1 block text-xs opacity-70">{item.detail}</span>
              </button>
            ))}
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setTab('access')}
                  className={`min-w-40 rounded-lg px-4 py-3 text-left lg:min-w-0 ${tab === 'access' ? 'bg-viva-roxo text-white' : 'border border-viva-roxo text-viva-roxo'}`}
                >
                  <span className="block text-sm font-black">Acessos</span>
                  <span className="mt-1 block text-xs">Admins e treinadores</span>
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/admin')}
                  className="min-w-40 rounded-lg border border-viva-roxo px-4 py-3 text-left text-viva-roxo lg:min-w-0"
                >
                  <span className="block text-sm font-black">Painel Admin</span>
                  <span className="mt-1 block text-xs">Acesso completo</span>
                </button>
              </>
            )}
            <button type="button" onClick={signOut} className="min-w-32 rounded-lg px-4 py-3 text-left text-sm font-black text-red-600 lg:min-w-0">
              Sair
            </button>
          </nav>
        </aside>

        <main className="min-w-0 flex-1 p-4 md:p-6">
          {tab === 'plans' && (
            <div className="mx-auto max-w-6xl">
              <header className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-viva-roxo">Área profissional</p>
                  <h1 className="text-2xl font-black">Planos de treinamento</h1>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setForm(emptyPlan());
                    setTab('editor');
                  }}
                  className="rounded-lg bg-viva-verde px-4 py-3 text-sm font-black text-viva-roxo"
                >
                  + Novo plano
                </button>
              </header>

              {plans.length === 0 ? (
                <section className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
                  <p className="text-lg font-black">Nenhum plano criado</p>
                  <p className="mt-2 text-sm text-gray-500">Crie a divisão e prescrição manual do primeiro aluno.</p>
                </section>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {plans.map(plan => (
                    <article key={plan.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase text-viva-roxo">{plan.level}</p>
                          <h2 className="mt-1 text-lg font-black">{plan.name}</h2>
                        </div>
                        <span className="rounded-full bg-green-100 px-2 py-1 text-[10px] font-black text-green-700">
                          Publicado
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-lg bg-gray-50 p-2"><b className="block text-base">{plan.trainer_plan_days?.length ?? 0}</b>treinos</div>
                        <div className="rounded-lg bg-gray-50 p-2"><b className="block text-base">{plan.weekly_frequency}x</b>semana</div>
                        <div className="rounded-lg bg-gray-50 p-2"><b className="block text-base">{plan.duration_weeks}</b>semanas</div>
                      </div>
                      <p className="mt-3 text-xs text-gray-400">Atualizado em {formatDate(plan.updated_at)}</p>
                      <div className="mt-4 flex gap-2">
                        <button type="button" onClick={() => editPlan(plan)} className="flex-1 rounded-lg bg-viva-roxo px-3 py-2 text-xs font-black text-white">
                          Editar / enviar
                        </button>
                        <button type="button" onClick={() => archivePlan(plan.id)} title="Arquivar plano" className="h-9 w-9 rounded-lg border border-gray-200 text-gray-500">
                          ×
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'students' && (
            <div className="mx-auto max-w-6xl">
              <header className="mb-5">
                <p className="text-xs font-black uppercase text-viva-roxo">Acompanhamento</p>
                <h1 className="text-2xl font-black">Alunos e convites</h1>
              </header>
              <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-yellow-100 p-4"><b className="text-2xl">{assignmentSummary.pending}</b><span className="ml-2 text-sm font-bold">aguardando</span></div>
                <div className="rounded-lg bg-green-100 p-4"><b className="text-2xl">{assignmentSummary.accepted}</b><span className="ml-2 text-sm font-bold">aceitos</span></div>
                <div className="rounded-lg bg-red-100 p-4"><b className="text-2xl">{assignmentSummary.rejected}</b><span className="ml-2 text-sm font-bold">recusados</span></div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-gray-950 text-xs uppercase text-white">
                    <tr><th className="p-3">Aluno</th><th className="p-3">Plano</th><th className="p-3">Envio</th><th className="p-3">Resposta</th><th className="p-3">Status</th></tr>
                  </thead>
                  <tbody>
                    {assignments.map(item => (
                      <tr key={item.id} className="border-t border-gray-100">
                        <td className="p-3 font-bold">{item.student_email}</td>
                        <td className="p-3">{item.trainer_plan_templates?.name ?? '-'}</td>
                        <td className="p-3">{formatDate(item.sent_at)}</td>
                        <td className="p-3">{formatDate(item.responded_at)}</td>
                        <td className="p-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-black">{statusLabel(item.status)}</span></td>
                      </tr>
                    ))}
                    {!assignments.length && <tr><td colSpan={5} className="p-8 text-center text-gray-400">Nenhum plano enviado.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'access' && isAdmin && (
            <div className="mx-auto max-w-5xl">
              <header className="mb-5">
                <p className="text-xs font-black uppercase text-viva-roxo">Controle de acesso</p>
                <h1 className="text-2xl font-black">Administradores e treinadores</h1>
                <p className="mt-1 text-sm text-gray-500">O mesmo e-mail pode acumular as duas funções.</p>
              </header>
              <section className="mb-5 grid gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-4">
                <label className="md:col-span-2">
                  <span className="text-xs font-black uppercase text-gray-500">E-mail</span>
                  <input type="email" value={accessForm.email} onChange={event => setAccessForm({ ...accessForm, email: event.target.value })} className="mt-1 w-full rounded-lg border p-3 text-sm" placeholder="profissional@email.com" />
                </label>
                <label>
                  <span className="text-xs font-black uppercase text-gray-500">Nome</span>
                  <input value={accessForm.nome} onChange={event => setAccessForm({ ...accessForm, nome: event.target.value })} className="mt-1 w-full rounded-lg border p-3 text-sm" />
                </label>
                <label>
                  <span className="text-xs font-black uppercase text-gray-500">Função</span>
                  <select value={accessForm.role} onChange={event => setAccessForm({ ...accessForm, role: event.target.value as 'admin' | 'trainer' })} className="mt-1 w-full rounded-lg border p-3 text-sm font-bold">
                    <option value="trainer">Treinador</option>
                    <option value="admin">Administrador</option>
                  </select>
                </label>
                <button type="button" onClick={saveAccessRole} className="rounded-lg bg-viva-verde px-4 py-3 text-sm font-black text-viva-roxo md:col-start-4">
                  Salvar acesso
                </button>
              </section>
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="bg-gray-950 text-xs uppercase text-white"><tr><th className="p-3">Profissional</th><th className="p-3">E-mail</th><th className="p-3">Função</th><th className="p-3">Status</th><th className="p-3">Ação</th></tr></thead>
                  <tbody>
                    {accessRoles.map(item => (
                      <tr key={`${item.email}-${item.role}`} className="border-t border-gray-100">
                        <td className="p-3 font-bold">{item.nome || '-'}</td>
                        <td className="p-3">{item.email}</td>
                        <td className="p-3 font-black">{item.role === 'admin' ? 'Administrador' : 'Treinador'}</td>
                        <td className="p-3">{item.ativo ? 'Ativo' : 'Inativo'}</td>
                        <td className="p-3"><button type="button" onClick={() => toggleAccessRole(item)} className={`rounded-lg px-3 py-2 text-xs font-black ${item.ativo ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{item.ativo ? 'Desativar' : 'Ativar'}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'editor' && (
            <div className="mx-auto max-w-7xl">
              <header className="mb-5">
                <p className="text-xs font-black uppercase text-viva-roxo">Prescrição profissional</p>
                <h1 className="text-2xl font-black">{form.id ? 'Editar plano' : 'Novo plano manual'}</h1>
              </header>

              <section className="mb-4 grid gap-4 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-4">
                <label className="md:col-span-2">
                  <span className="text-xs font-black uppercase text-gray-500">Nome do plano</span>
                  <input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 p-3 text-sm font-bold" placeholder="Ex: Hipertrofia 4x - João" />
                </label>
                <label>
                  <span className="text-xs font-black uppercase text-gray-500">Nível</span>
                  <select value={form.level} onChange={event => setForm({ ...form, level: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 p-3 text-sm font-bold">
                    <option value="personalizado">Personalizado</option>
                    <option value="iniciante">Iniciante</option>
                    <option value="intermediario">Intermediário</option>
                    <option value="avancado">Avançado</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label>
                    <span className="text-xs font-black uppercase text-gray-500">Semanas</span>
                    <input type="number" min={1} max={52} value={form.duration_weeks} onChange={event => setForm({ ...form, duration_weeks: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 p-3 text-sm font-bold" />
                  </label>
                  <label>
                    <span className="text-xs font-black uppercase text-gray-500">Treinos/sem.</span>
                    <input type="number" min={1} max={7} value={form.weekly_frequency} onChange={event => setForm({ ...form, weekly_frequency: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 p-3 text-sm font-bold" />
                  </label>
                </div>
              </section>

              <div className="space-y-4">
                {form.days.map((day, dayIndex) => (
                  <section key={`${day.code}-${dayIndex}`} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                    <header className="flex flex-col gap-3 bg-gray-950 p-4 text-white md:flex-row md:items-center">
                      <input value={day.code} onChange={event => updateDay(dayIndex, { code: event.target.value.toUpperCase().slice(0, 3) })} className="w-16 rounded-lg border border-white/20 bg-white/10 p-2 text-center font-black" aria-label="Código do treino" />
                      <input value={day.title} onChange={event => updateDay(dayIndex, { title: event.target.value })} className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/10 p-2 font-black" aria-label="Título do treino" />
                      <input value={day.focus} onChange={event => updateDay(dayIndex, { focus: event.target.value })} className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/10 p-2 text-sm" placeholder="Foco: Peitoral e tríceps" />
                      <button type="button" onClick={() => setForm(current => ({ ...current, days: current.days.filter((_, index) => index !== dayIndex) }))} className="h-9 w-9 rounded-lg bg-red-600 font-black" title="Remover treino">×</button>
                    </header>

                    <div className="border-b border-gray-100 p-4">
                      <p className="mb-2 text-xs font-black uppercase text-gray-400">Dias recomendados</p>
                      <div className="flex flex-wrap gap-2">
                        {WEEKDAYS.map(weekday => (
                          <label key={weekday} className={`cursor-pointer rounded-full px-3 py-2 text-xs font-black ${day.recommended_weekdays.includes(weekday) ? 'bg-viva-verde text-viva-roxo' : 'bg-gray-100 text-gray-500'}`}>
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={day.recommended_weekdays.includes(weekday)}
                              onChange={() => updateDay(dayIndex, {
                                recommended_weekdays: day.recommended_weekdays.includes(weekday)
                                  ? day.recommended_weekdays.filter(item => item !== weekday)
                                  : [...day.recommended_weekdays, weekday],
                              })}
                            />
                            {weekday}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3 p-4">
                      {day.exercises.map((exercise, exerciseIndex) => {
                        const key = `${dayIndex}-${exerciseIndex}`;
                        const options = filteredCatalog(key);
                        return (
                          <article key={key} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                            <div className="mb-3 flex items-center justify-between">
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-viva-roxo text-xs font-black text-white">{exerciseIndex + 1}</span>
                              <div className="flex gap-1">
                                <button type="button" onClick={() => moveExercise(dayIndex, exerciseIndex, -1)} disabled={exerciseIndex === 0} className="h-8 w-8 rounded-lg border bg-white disabled:opacity-30" title="Mover para cima">↑</button>
                                <button type="button" onClick={() => moveExercise(dayIndex, exerciseIndex, 1)} disabled={exerciseIndex === day.exercises.length - 1} className="h-8 w-8 rounded-lg border bg-white disabled:opacity-30" title="Mover para baixo">↓</button>
                                <button type="button" onClick={() => updateDay(dayIndex, { exercises: day.exercises.filter((_, index) => index !== exerciseIndex) })} className="h-8 w-8 rounded-lg bg-red-100 font-black text-red-600" title="Remover exercício">×</button>
                              </div>
                            </div>

                            <div className="grid gap-3 lg:grid-cols-12">
                              <div className="lg:col-span-5">
                                <input value={exerciseSearch[key] ?? ''} onChange={event => setExerciseSearch(current => ({ ...current, [key]: event.target.value }))} className="mb-2 w-full rounded-lg border border-gray-200 bg-white p-2 text-xs" placeholder="Filtrar exercício por nome, grupo ou aparelho" />
                                <select value={exercise.exercise_id} onChange={event => updateExercise(dayIndex, exerciseIndex, { exercise_id: event.target.value })} className="w-full rounded-lg border border-gray-200 bg-white p-3 text-sm font-bold">
                                  <option value="">Selecione o exercício</option>
                                  {options.map(item => <option key={item.id} value={item.id}>{item.name} · {item.primary_muscle_group}</option>)}
                                </select>
                              </div>
                              <label className="lg:col-span-1"><span className="text-[10px] font-black uppercase text-gray-400">Séries</span><input type="number" min={1} value={exercise.sets} onChange={event => updateExercise(dayIndex, exerciseIndex, { sets: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-3 text-sm" /></label>
                              <label className="lg:col-span-1"><span className="text-[10px] font-black uppercase text-gray-400">Rep. mín.</span><input type="number" min={1} value={exercise.repetition_min} onChange={event => updateExercise(dayIndex, exerciseIndex, { repetition_min: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-3 text-sm" /></label>
                              <label className="lg:col-span-1"><span className="text-[10px] font-black uppercase text-gray-400">Rep. máx.</span><input type="number" min={1} value={exercise.repetition_max} onChange={event => updateExercise(dayIndex, exerciseIndex, { repetition_max: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-3 text-sm" /></label>
                              <label className="lg:col-span-2"><span className="text-[10px] font-black uppercase text-gray-400">Intervalo (s)</span><input type="number" min={0} value={exercise.rest_seconds} onChange={event => updateExercise(dayIndex, exerciseIndex, { rest_seconds: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-3 text-sm" /></label>
                              <label className="lg:col-span-2"><span className="text-[10px] font-black uppercase text-gray-400">Técnica</span><select value={exercise.technique} onChange={event => updateExercise(dayIndex, exerciseIndex, { technique: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-3 text-sm">{TECHNIQUES.map(item => <option key={item || 'normal'} value={item}>{item || 'Série normal'}</option>)}</select></label>
                              <label className="lg:col-span-4"><span className="text-[10px] font-black uppercase text-gray-400">Carga</span><input value={exercise.load_guidance} onChange={event => updateExercise(dayIndex, exerciseIndex, { load_guidance: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-3 text-sm" placeholder="Ex: carga para RIR 2" /></label>
                              <label className="lg:col-span-4"><span className="text-[10px] font-black uppercase text-gray-400">Intensidade</span><input value={exercise.intensity_guidance} onChange={event => updateExercise(dayIndex, exerciseIndex, { intensity_guidance: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-3 text-sm" placeholder="Ex: última série até falha técnica" /></label>
                              <label className="lg:col-span-4"><span className="text-[10px] font-black uppercase text-gray-400">Observações</span><input value={exercise.notes} onChange={event => updateExercise(dayIndex, exerciseIndex, { notes: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-3 text-sm" /></label>
                            </div>
                          </article>
                        );
                      })}
                      <button type="button" onClick={() => updateDay(dayIndex, { exercises: [...day.exercises, emptyExercise()] })} className="w-full rounded-lg border border-dashed border-viva-roxo p-3 text-sm font-black text-viva-roxo">
                        + Adicionar exercício
                      </button>
                    </div>
                  </section>
                ))}
              </div>

              <button type="button" onClick={() => setForm(current => ({ ...current, days: [...current.days, emptyDay(current.days.length)] }))} className="mt-4 w-full rounded-lg border-2 border-dashed border-gray-300 bg-white p-4 text-sm font-black text-gray-600">
                + Adicionar novo treino à divisão
              </button>

              <section className="mt-4 grid gap-4 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-3">
                <label><span className="text-xs font-black uppercase text-gray-500">Recomendações de cardio</span><textarea rows={4} value={form.cardio_recommendations} onChange={event => setForm({ ...form, cardio_recommendations: event.target.value })} className="mt-1 w-full resize-none rounded-lg border p-3 text-sm" /></label>
                <label><span className="text-xs font-black uppercase text-gray-500">Treino e descanso</span><textarea rows={4} value={form.schedule_notes} onChange={event => setForm({ ...form, schedule_notes: event.target.value })} className="mt-1 w-full resize-none rounded-lg border p-3 text-sm" placeholder="Ex: descanso na quarta e domingo" /></label>
                <label><span className="text-xs font-black uppercase text-gray-500">Orientações adicionais</span><textarea rows={4} value={form.general_notes} onChange={event => setForm({ ...form, general_notes: event.target.value })} className="mt-1 w-full resize-none rounded-lg border p-3 text-sm" /></label>
              </section>

              <section className="mt-4 rounded-lg border border-viva-verde bg-viva-verde/10 p-4">
                <label>
                  <span className="text-xs font-black uppercase text-viva-roxo">Enviar para alunos após salvar</span>
                  <textarea rows={3} value={emails} onChange={event => setEmails(event.target.value)} className="mt-2 w-full resize-none rounded-lg border border-viva-verde bg-white p-3 text-sm" placeholder="aluno1@email.com, aluno2@email.com" />
                  <span className="mt-1 block text-xs text-gray-500">Separe vários e-mails por vírgula ou linha. O aluno precisará aceitar antes da ativação.</span>
                </label>
              </section>

              <div className="sticky bottom-3 mt-5 flex gap-3 rounded-lg border border-gray-200 bg-white/95 p-3 shadow-xl backdrop-blur">
                <button type="button" onClick={() => setTab('plans')} className="rounded-lg border border-gray-200 px-5 py-3 text-sm font-black text-gray-600">Cancelar</button>
                <button type="button" disabled={saving} onClick={savePlan} className="flex-1 rounded-lg bg-viva-verde px-5 py-3 text-sm font-black text-viva-roxo disabled:opacity-60">
                  {saving ? 'Salvando...' : emails.trim() ? 'Salvar e enviar plano' : 'Salvar plano'}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
