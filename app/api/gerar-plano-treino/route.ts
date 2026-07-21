import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { generateTrainingPlan, TRAINING_SETTINGS, type ExerciseCatalogItem } from '../../../lib/training';

export const runtime = 'nodejs';

const RequestSchema = z.object({
  sex: z.enum(['masculino', 'feminino']),
  age: z.number().int().min(12).max(90),
  trainingExperienceYears: z.number().min(0).max(60),
  trainingLocation: z.enum(['academia', 'casa']),
  goals: z.array(z.string()).min(1),
  restrictionsText: z.string().optional().default(''),
  priorityMuscleGroup: z.string().optional().nullable(),
});

function addWeeks(date: Date, weeks: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + (weeks * 7));
  return next.toISOString().slice(0, 10);
}

function startDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) throw new Error('Supabase nao configurado.');

    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return NextResponse.json({ error: 'Sessao expirada.' }, { status: 401 });

    const supabase = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return NextResponse.json({ error: 'Usuario nao autenticado.' }, { status: 401 });
    const userId = authData.user.id;

    const body = RequestSchema.parse(await request.json());

    const [{ data: catalog, error: catalogError }, { data: history, error: historyError }] = await Promise.all([
      supabase
        .from('exercise_catalog')
        .select('id,name,primary_muscle_group,secondary_muscle_groups,environment,equipment,movement_pattern,technical_level,unilateral,instructions,precautions,similarity_group,video_url,video_thumbnail_url')
        .eq('is_active', true),
      supabase
        .from('training_plans')
        .select('level,status')
        .eq('user_id', userId)
        .in('status', ['completed', 'archived'])
        .order('created_at', { ascending: false }),
    ]);

    if (catalogError) throw catalogError;
    if (historyError) throw historyError;
    if (!catalog?.length) throw new Error('Catalogo de exercicios vazio. Rode a migration do Plano de Treino.');

    const profileInput = {
      ...body,
      priorityMuscleGroup: body.priorityMuscleGroup || undefined,
    };
    const draft = generateTrainingPlan(profileInput, catalog as ExerciseCatalogItem[], history ?? []);
    if (draft.validationErrors.length > 0) {
      return NextResponse.json({
        error: 'Nao foi possivel gerar um treino seguro com o catalogo atual.',
        detalhes: draft.validationErrors,
      }, { status: 422 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('training_profiles')
      .upsert({
        user_id: userId,
        sex: body.sex,
        age: body.age,
        training_experience_years: body.trainingExperienceYears,
        training_location: body.trainingLocation,
        goals: body.goals,
        restrictions_text: body.restrictionsText ?? '',
        current_level: draft.level,
        current_goal: body.goals.join(', '),
        priority_muscle_group: body.priorityMuscleGroup || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select('*')
      .single();

    if (profileError) throw profileError;

    await supabase
      .from('training_plans')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active');

    const inicio = startDate();
    const { data: plan, error: planError } = await supabase
      .from('training_plans')
      .insert({
        user_id: userId,
        profile_id: profile.id,
        level: draft.level,
        name: draft.name,
        start_date: inicio,
        expected_end_date: addWeeks(new Date(`${inicio}T12:00:00`), draft.durationWeeks),
        duration_weeks: draft.durationWeeks,
        current_week: 1,
        weekly_frequency: draft.weeklyFrequency,
        status: 'active',
        adherence_percentage: 0,
        generated_by_ai: false,
        ai_model: 'deterministic-rules-v1',
        generation_version: TRAINING_SETTINGS.generationVersion,
        generation_payload: {
          profile: profileInput,
          nextLevel: draft.nextLevel,
          safetyNotes: draft.safetyNotes,
        },
        cardio_payload: draft.cardio,
        validation_errors: draft.validationErrors,
      })
      .select('*')
      .single();

    if (planError) throw planError;

    for (let dayIndex = 0; dayIndex < draft.days.length; dayIndex += 1) {
      const day = draft.days[dayIndex];
      const { data: savedDay, error: dayError } = await supabase
        .from('training_days')
        .insert({
          training_plan_id: plan.id,
          code: day.code,
          title: day.title,
          order_index: dayIndex + 1,
          focus: day.focus,
          recommended_weekdays: day.recommendedWeekdays,
        })
        .select('*')
        .single();

      if (dayError) throw dayError;

      const exercises = day.exercises.map(exercise => ({
        training_day_id: savedDay.id,
        exercise_id: exercise.exerciseId,
        substitute_exercise_id: exercise.substituteExerciseId ?? null,
        order_index: exercise.order,
        sets: exercise.sets,
        repetition_min: exercise.repetitionMin,
        repetition_max: exercise.repetitionMax,
        rest_seconds: exercise.restSeconds,
        rir_target: exercise.rirTarget,
        rpe_target: exercise.rpeTarget,
        advanced_technique: exercise.advancedTechnique,
        advanced_technique_instructions: exercise.advancedTechniqueInstructions,
        notes: exercise.notes,
      }));

      const { error: exercisesError } = await supabase.from('training_day_exercises').insert(exercises);
      if (exercisesError) throw exercisesError;
    }

    return NextResponse.json({ ok: true, planId: plan.id, level: draft.level });
  } catch (error: any) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: error.message || 'Erro ao gerar plano de treino.' }, { status });
  }
}
