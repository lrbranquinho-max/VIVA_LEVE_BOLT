import { ADVANCED_TECHNIQUES, type AdvancedTechniqueKey } from './trainingTechniques';

export type TrainingLevel = 'iniciante' | 'iniciante_plus' | 'intermediario' | 'avancado';
export type TrainingLocation = 'academia' | 'casa';

export interface ExerciseCatalogItem {
  id: number;
  name: string;
  primary_muscle_group: string;
  secondary_muscle_groups?: string[] | unknown;
  environment: string;
  equipment?: string | null;
  movement_pattern?: string | null;
  technical_level?: string | null;
  unilateral?: boolean | null;
  instructions?: string | null;
  precautions?: string | null;
  similarity_group?: string | null;
  is_compound?: boolean | null;
  exercise_order_priority?: number | null;
  audience?: 'todos' | 'feminino' | 'masculino' | null;
  advanced_technique_tags?: string[] | unknown;
  video_url?: string | null;
  video_thumbnail_url?: string | null;
}

export interface TrainingProfileInput {
  sex: 'masculino' | 'feminino';
  age: number;
  trainingExperienceYears: number;
  trainingLocation: TrainingLocation;
  goals: string[];
  restrictionsText?: string;
  priorityMuscleGroup?: string;
}

export interface ExercisePrescription {
  exerciseId: number;
  substituteExerciseId?: number | null;
  order: number;
  sets: number;
  repetitionMin: number;
  repetitionMax: number;
  restSeconds: number;
  rirTarget?: number | null;
  rpeTarget?: number | null;
  advancedTechnique?: string | null;
  advancedTechniqueInstructions?: string | null;
  notes?: string | null;
}

export interface TrainingDayPlan {
  code: string;
  title: string;
  focus: string;
  recommendedWeekdays: string[];
  exercises: ExercisePrescription[];
}

export interface TrainingPlanDraft {
  level: TrainingLevel;
  name: string;
  durationWeeks: number;
  weeklyFrequency: number;
  nextLevel: TrainingLevel;
  days: TrainingDayPlan[];
  cardio: {
    sessionsPerWeek: number;
    durationMinutes: number;
    modalities: string[];
    heartRateMin: number;
    heartRateMax: number;
    note: string;
  };
  safetyNotes: string[];
  validationErrors: string[];
}

const LEVEL_LABEL: Record<TrainingLevel, string> = {
  iniciante: 'Iniciante',
  iniciante_plus: 'Iniciante Plus',
  intermediario: 'Intermediario',
  avancado: 'Avancado',
};

const NEXT_LEVEL: Record<TrainingLevel, TrainingLevel> = {
  iniciante: 'iniciante_plus',
  iniciante_plus: 'intermediario',
  intermediario: 'avancado',
  avancado: 'avancado',
};

export const TRAINING_SETTINGS = {
  minAdherencePercentage: 70,
  generationVersion: 'treino-v3',
};
const ADVANCED_TECHNIQUE_SEQUENCE: AdvancedTechniqueKey[] = ['drop-set', 'rest-pause', 'sst'];

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function includesAny(value: unknown, terms: string[]) {
  const normalized = normalize(value);
  return terms.some(term => normalized.includes(normalize(term)));
}

function environmentMatches(exercise: ExerciseCatalogItem, location: TrainingLocation) {
  const env = normalize(exercise.environment);
  if (location === 'academia') return env.includes('academia');
  return env.includes('casa');
}

function levelMatches(exercise: ExerciseCatalogItem, level: TrainingLevel) {
  const tech = normalize(exercise.technical_level);
  if (level === 'iniciante') return tech.includes('iniciante');
  if (level === 'iniciante_plus') return tech.includes('iniciante') || tech.includes('intermediario');
  if (level === 'intermediario') return !tech.includes('avancado');
  return true;
}

function restrictionMatches(exercise: ExerciseCatalogItem, restrictions?: string) {
  const text = normalize(restrictions);
  if (!text) return false;
  const haystack = normalize([
    exercise.name,
    exercise.primary_muscle_group,
    exercise.equipment,
    exercise.movement_pattern,
    exercise.precautions,
  ].join(' '));

  const restrictionMap: Array<[string, string[]]> = [
    ['agachamento', ['agachar', 'agachamento', 'hack', 'smith', 'goblet', 'bulgaro', 'v squat', 'pendulum']],
    ['joelho', ['agachar', 'joelho', 'extensora', 'avancar', 'leg press', 'salt']],
    ['lombar', ['lombar', 'terra', 'remada curvada', 'good morning', 'hip hinge']],
    ['ombro', ['desenvolvimento', 'ombro', 'elevar', 'acima da cabeca', 'supino']],
  ];

  return restrictionMap.some(([trigger, blocked]) => text.includes(trigger) && blocked.some(term => haystack.includes(normalize(term)))) ||
    text.split(/\s+/).filter(Boolean).some(token => token.length >= 4 && haystack.includes(token));
}

function eligible(catalog: ExerciseCatalogItem[], profile: TrainingProfileInput, level: TrainingLevel) {
  return catalog.filter(exercise =>
    exercise.id &&
    environmentMatches(exercise, profile.trainingLocation) &&
    levelMatches(exercise, level) &&
    (!exercise.audience || exercise.audience === 'todos' || exercise.audience === profile.sex) &&
    !restrictionMatches(exercise, profile.restrictionsText),
  );
}

function pick(
  pool: ExerciseCatalogItem[],
  used: Set<number>,
  group: string,
  options: { movement?: string[]; fallbackGroups?: string[]; usedSimilarityGroups?: Set<string> } = {},
) {
  const groups = [group, ...(options.fallbackGroups ?? [])];
  const byGroup = pool.filter(item => groups.some(g => normalize(item.primary_muscle_group).includes(normalize(g))));
  const byMovement = options.movement?.length
    ? byGroup.filter(item => includesAny(item.movement_pattern, options.movement ?? []))
    : byGroup;
  const isAvailable = (item: ExerciseCatalogItem) =>
    !used.has(item.id) &&
    (!item.similarity_group || !options.usedSimilarityGroups?.has(item.similarity_group));
  const selected = byMovement.find(isAvailable) ??
    byGroup.find(isAvailable) ??
    pool.find(isAvailable) ??
    byMovement.find(item => !used.has(item.id)) ??
    byGroup.find(item => !used.has(item.id)) ??
    pool.find(item => !used.has(item.id));
  if (!selected) return null;
  used.add(selected.id);
  if (selected.similarity_group) options.usedSimilarityGroups?.add(selected.similarity_group);
  return selected;
}

function prescribed(exercise: ExerciseCatalogItem | null, order: number, level: TrainingLevel, overrides: Partial<ExercisePrescription> = {}): ExercisePrescription | null {
  if (!exercise) return null;
  const beginner = level === 'iniciante';
  const plus = level === 'iniciante_plus';
  return {
    exerciseId: exercise.id,
    order,
    sets: overrides.sets ?? 3,
    repetitionMin: overrides.repetitionMin ?? (beginner ? 10 : plus ? 10 : 8),
    repetitionMax: overrides.repetitionMax ?? (beginner ? 15 : plus ? 12 : 10),
    restSeconds: overrides.restSeconds ?? (beginner ? 75 : 90),
    rirTarget: overrides.rirTarget ?? (beginner ? 2 : plus ? 1 : 1),
    rpeTarget: overrides.rpeTarget ?? null,
    advancedTechnique: overrides.advancedTechnique ?? null,
    advancedTechniqueInstructions: overrides.advancedTechniqueInstructions ?? null,
    notes: overrides.notes ?? (beginner
      ? 'Termine cada serie com 2 a 3 repeticoes em reserva e priorize tecnica.'
      : 'Busque proximidade da falha tecnica sem comprometer a execucao.'),
  };
}

function compactExercises(items: Array<ExercisePrescription | null>) {
  return items.filter(Boolean).map((item, index) => ({ ...(item as ExercisePrescription), order: index + 1 }));
}

function finalizeExercises(items: Array<ExercisePrescription | null>, pool: ExerciseCatalogItem[]) {
  const catalogById = new Map(pool.map(item => [item.id, item]));
  const exercises = compactExercises(items)
    .sort((left, right) => {
      const leftPriority = Number(catalogById.get(left.exerciseId)?.exercise_order_priority ?? 50);
      const rightPriority = Number(catalogById.get(right.exerciseId)?.exercise_order_priority ?? 50);
      return leftPriority - rightPriority || left.order - right.order;
    })
    .map((item, index) => ({ ...item, order: index + 1 }));
  const selectedIds = new Set(exercises.map(item => item.exerciseId));
  return exercises.map(item => {
    const original = catalogById.get(item.exerciseId);
    if (!original?.similarity_group) return item;
    const substitute = pool.find(exercise =>
      exercise.id !== original.id &&
      !selectedIds.has(exercise.id) &&
      exercise.similarity_group === original.similarity_group &&
      normalize(exercise.equipment) !== normalize(original.equipment),
    );
    return { ...item, substituteExerciseId: substitute?.id ?? null };
  });
}

function techniqueTags(exercise?: ExerciseCatalogItem) {
  const tags = exercise?.advanced_technique_tags;
  return Array.isArray(tags)
    ? tags.map(item => normalize(item))
    : [];
}

function applyAdvancedTechnique(
  exercises: ExercisePrescription[],
  pool: ExerciseCatalogItem[],
  techniqueKey: AdvancedTechniqueKey,
) {
  const catalogById = new Map(pool.map(item => [item.id, item]));
  const indexes = exercises
    .map((item, index) => ({ index, item, catalog: catalogById.get(item.exerciseId) }))
    .filter(({ catalog }) => techniqueTags(catalog).includes(techniqueKey));
  if (!indexes.length) return exercises;

  const sstIndexes = techniqueKey === 'sst'
    ? indexes.filter(({ index, catalog }) => !exercises.slice(index + 1).some(item =>
        normalize(catalogById.get(item.exerciseId)?.primary_muscle_group) === normalize(catalog?.primary_muscle_group),
      ))
    : indexes;
  const candidates = sstIndexes.length ? sstIndexes : indexes;
  const selected = techniqueKey === 'rest-pause' ? candidates[0] : candidates[candidates.length - 1];
  const technique = ADVANCED_TECHNIQUES[techniqueKey];
  return exercises.map((item, index) => index === selected.index ? {
    ...item,
    advancedTechnique: technique.label,
    advancedTechniqueInstructions: technique.instructions,
  } : item);
}

export function classifyTrainingLevel(input: TrainingProfileInput, history: Array<{ level: string; status: string }> = []): TrainingLevel {
  const completed = new Set(history.filter(item => item.status === 'completed' || item.status === 'archived').map(item => normalize(item.level)));
  if (completed.has('intermediario')) return 'avancado';
  if (completed.has('iniciante_plus')) return 'intermediario';
  if (completed.has('iniciante')) return 'iniciante_plus';
  if (input.trainingExperienceYears > 1) return 'avancado';
  if (input.trainingExperienceYears >= 0.75) return 'intermediario';
  if (input.trainingExperienceYears >= 0.25) return 'iniciante_plus';
  return 'iniciante';
}

export function calculateCardio(profile: TrainingProfileInput, level: TrainingLevel) {
  const maxHr = 208 - (0.7 * profile.age);
  const emagrecimento = profile.goals.some(goal => normalize(goal).includes('emagrec'));
  const highCardio = profile.age < 45 && emagrecimento && (level === 'intermediario' || level === 'avancado');
  return {
    sessionsPerWeek: highCardio ? 6 : 4,
    durationMinutes: highCardio ? 60 : 30,
    modalities: ['Esteira', 'Eliptico', 'Bicicleta'],
    heartRateMin: Math.round(maxHr * 0.6),
    heartRateMax: Math.round(maxHr * 0.7),
    note: 'Frequencia cardiaca estimada. Preferir cardio apos a musculacao ou separado por algumas horas, principalmente em dias de pernas.',
  };
}

function durationWeeks(level: TrainingLevel) {
  return level === 'iniciante' || level === 'iniciante_plus' ? 8 : 12;
}

function weeklyFrequency(level: TrainingLevel, age: number) {
  if (level === 'intermediario' || level === 'avancado') return age >= 45 ? 4 : 5;
  return 4;
}

function beginnerDays(pool: ExerciseCatalogItem[], level: TrainingLevel): TrainingDayPlan[] {
  const used = new Set<number>();
  const spec = [
    { code: 'A', extra: ['Posteriores de coxa', 'Peitoral', 'Biceps'], back: ['Puxar vertical'] },
    { code: 'B', extra: ['Panturrilhas', 'Ombros', 'Triceps'], back: ['Puxar horizontal'] },
    { code: 'C', extra: ['Posteriores de coxa', 'Peitoral', 'Biceps'], back: ['Puxar vertical'] },
    { code: 'D', extra: ['Panturrilhas', 'Ombros', 'Triceps'], back: ['Puxar horizontal'] },
  ];
  return spec.map((day, dayIndex) => {
    const usedSimilarityGroups = new Set<string>();
    const exercises = finalizeExercises([
      prescribed(pick(pool, used, 'Quadriceps', { fallbackGroups: ['Gluteos'], usedSimilarityGroups }), 1, level),
      prescribed(pick(pool, used, 'Costas', { movement: day.back, usedSimilarityGroups }), 2, level),
      ...day.extra.map((group, idx) => prescribed(pick(pool, used, group, { usedSimilarityGroups }), idx + 3, level)),
    ], pool);
    return {
      code: day.code,
      title: `Treino ${day.code}`,
      focus: 'Full body',
      recommendedWeekdays: dayIndex < 2 ? ['Ciclo: 2 dias de treino + 1 descanso'] : ['Repetir ciclo'],
      exercises,
    };
  });
}

function beginnerPlusDays(pool: ExerciseCatalogItem[], level: TrainingLevel): TrainingDayPlan[] {
  const used = new Set<number>();
  const specs = [
    { code: 'A', focus: 'Inferiores - quadriceps e gluteos', groups: ['Quadriceps', 'Gluteos', 'Quadriceps', 'Gluteos', 'Adutores'] },
    { code: 'B', focus: 'Superiores - peito, ombros e triceps', groups: ['Peitoral', 'Peitoral', 'Ombros', 'Ombros', 'Triceps'] },
    { code: 'C', focus: 'Inferiores - posteriores e panturrilhas', groups: ['Posteriores de coxa', 'Posteriores de coxa', 'Posteriores de coxa', 'Panturrilhas', 'Panturrilhas'] },
    { code: 'D', focus: 'Superiores - costas e biceps', groups: ['Costas', 'Costas', 'Costas', 'Costas', 'Biceps'] },
  ];
  return specs.map(spec => {
    const usedSimilarityGroups = new Set<string>();
    return {
    code: spec.code,
    title: `Treino ${spec.code}`,
    focus: spec.focus,
    recommendedWeekdays: [],
    exercises: finalizeExercises(spec.groups.map((group, index) => prescribed(
      pick(pool, used, group, group === 'Costas'
        ? { movement: index % 2 === 0 ? ['Puxar vertical'] : ['Puxar horizontal'], usedSimilarityGroups }
        : { usedSimilarityGroups }),
      index + 1,
      level,
    )), pool),
    };
  });
}

function splitDays(pool: ExerciseCatalogItem[], level: TrainingLevel, profile: TrainingProfileInput): TrainingDayPlan[] {
  const used = new Set<number>();
  const fiveDays = weeklyFrequency(level, profile.age) === 5;
  const priorityGroup = profile.priorityMuscleGroup && includesAny(profile.priorityMuscleGroup, ['Quadriceps', 'Gluteos', 'Posteriores de coxa', 'Panturrilhas', 'Adutores'])
    ? 'Ombros'
    : profile.priorityMuscleGroup || 'Ombros';
  const specs = fiveDays
    ? [
        { code: 'A', focus: 'Peitoral, ombros e triceps', groups: ['Peitoral', 'Peitoral', 'Peitoral', 'Ombros', 'Ombros', 'Triceps'] },
        { code: 'B', focus: 'Inferiores - quadriceps e gluteos', groups: ['Quadriceps', 'Quadriceps', 'Quadriceps', 'Gluteos', 'Gluteos', 'Panturrilhas'] },
        { code: 'C', focus: 'Costas e biceps', groups: ['Costas', 'Costas', 'Costas', 'Costas', 'Biceps', 'Biceps'] },
        { code: 'D', focus: 'Prioridade superior e complementares', groups: [priorityGroup, 'Peitoral', 'Ombros', 'Biceps', 'Triceps', 'Core'] },
        { code: 'E', focus: 'Inferiores - posteriores, gluteos e core', groups: ['Posteriores de coxa', 'Posteriores de coxa', 'Posteriores de coxa', 'Gluteos', 'Core', 'Core'] },
      ]
    : [
        { code: 'A', focus: 'Superiores - empurrar', groups: ['Peitoral', 'Peitoral', 'Ombros', 'Ombros', 'Triceps'] },
        { code: 'B', focus: 'Inferiores - quadriceps e gluteos', groups: ['Quadriceps', 'Quadriceps', 'Gluteos', 'Gluteos', 'Panturrilhas'] },
        { code: 'C', focus: 'Superiores - puxar', groups: ['Costas', 'Costas', 'Costas', 'Biceps', 'Biceps'] },
        { code: 'D', focus: 'Inferiores - posteriores e core', groups: ['Posteriores de coxa', 'Posteriores de coxa', 'Gluteos', 'Core', 'Core'] },
      ];

  return specs.map((spec, dayIndex) => {
    const usedSimilarityGroups = new Set<string>();
    return {
    code: spec.code,
    title: `Treino ${spec.code}`,
    focus: spec.focus,
    recommendedWeekdays: [],
    exercises: (() => {
      const exercises = finalizeExercises(spec.groups.map((group, index) => {
        return prescribed(pick(pool, used, group, group === 'Costas'
        ? { movement: index % 2 === 0 ? ['Puxar vertical'] : ['Puxar horizontal'], usedSimilarityGroups }
        : { usedSimilarityGroups }), index + 1, level, {
          sets: level === 'avancado' && profile.priorityMuscleGroup && normalize(group).includes(normalize(profile.priorityMuscleGroup)) ? 4 : 3,
        });
      }), pool);
      return level === 'avancado'
        ? applyAdvancedTechnique(exercises, pool, ADVANCED_TECHNIQUE_SEQUENCE[dayIndex % ADVANCED_TECHNIQUE_SEQUENCE.length])
        : exercises;
    })(),
    };
  });
}

function isLowerBodyDay(day: TrainingDayPlan, catalogById: Map<number, ExerciseCatalogItem>) {
  return includesAny(day.focus, ['inferiores', 'quadriceps', 'posteriores', 'gluteos']) ||
    day.exercises.filter(exercise => includesAny(catalogById.get(exercise.exerciseId)?.primary_muscle_group, ['Quadriceps', 'Posteriores de coxa', 'Gluteos', 'Panturrilhas', 'Adutores'])).length >= 3;
}

export function validateTrainingPlan(plan: TrainingPlanDraft, catalog: ExerciseCatalogItem[], profile: TrainingProfileInput) {
  const errors: string[] = [];
  const ids = new Set(catalog.map(item => item.id));
  const catalogById = new Map(catalog.map(item => [item.id, item]));
  if (plan.days.length !== plan.weeklyFrequency) errors.push('Quantidade de treinos diferente da frequencia semanal.');
  for (let index = 1; index < plan.days.length; index += 1) {
    if (isLowerBodyDay(plan.days[index - 1], catalogById) && isLowerBodyDay(plan.days[index], catalogById)) {
      errors.push(`Treinos inferiores em dias sequenciais: ${plan.days[index - 1].code} e ${plan.days[index].code}.`);
    }
  }
  for (const day of plan.days) {
    if (!day.exercises.length) errors.push(`${day.title} sem exercicios.`);
    const seen = new Set<number>();
    const seenSimilarityGroups = new Set<string>();
    let previousPriority = -Infinity;
    let advancedTechniqueCount = 0;
    for (const exercise of day.exercises) {
      if (!ids.has(exercise.exerciseId)) errors.push(`Exercicio inexistente no catalogo: ${exercise.exerciseId}.`);
      if (seen.has(exercise.exerciseId)) errors.push(`Exercicio duplicado no ${day.title}: ${exercise.exerciseId}.`);
      seen.add(exercise.exerciseId);
      const similarityGroup = catalogById.get(exercise.exerciseId)?.similarity_group;
      if (similarityGroup && seenSimilarityGroups.has(similarityGroup)) {
        errors.push(`Exercicios similares no ${day.title}: ${similarityGroup}.`);
      }
      if (similarityGroup) seenSimilarityGroups.add(similarityGroup);
      const catalogExercise = catalogById.get(exercise.exerciseId);
      const orderPriority = Number(catalogExercise?.exercise_order_priority ?? 50);
      if (orderPriority < previousPriority) errors.push(`Ordem de exercicios invalida no ${day.title}.`);
      previousPriority = orderPriority;
      if (catalogExercise?.audience && catalogExercise.audience !== 'todos' && catalogExercise.audience !== profile.sex) {
        errors.push(`Exercicio incompativel com o publico no ${day.title}: ${catalogExercise.name}.`);
      }
      if (exercise.advancedTechnique) {
        advancedTechniqueCount += 1;
        const technique = Object.entries(ADVANCED_TECHNIQUES).find(([, item]) => item.label === exercise.advancedTechnique);
        if (!technique || !techniqueTags(catalogExercise).includes(technique[0])) {
          errors.push(`Tecnica avancada incompativel com ${catalogExercise?.name ?? exercise.exerciseId}.`);
        }
      }
      if (plan.level !== 'avancado' && exercise.advancedTechnique) errors.push('Tecnica avancada usada fora do nivel avancado.');
      if (profile.age >= 45 && exercise.sets > 4) errors.push('Volume por exercicio acima do recomendado para usuario 45+.');
    }
    if (advancedTechniqueCount > 1) errors.push(`Mais de uma tecnica avancada no ${day.title}.`);
  }
  return errors;
}

export function generateTrainingPlan(profile: TrainingProfileInput, catalog: ExerciseCatalogItem[], history: Array<{ level: string; status: string }> = []): TrainingPlanDraft {
  const level = classifyTrainingLevel(profile, history);
  const pool = eligible(catalog, profile, level);
  const days = level === 'iniciante'
    ? beginnerDays(pool, level)
    : level === 'iniciante_plus'
      ? beginnerPlusDays(pool, level)
      : splitDays(pool, level, profile);
  const draft: TrainingPlanDraft = {
    level,
    name: `Plano ${LEVEL_LABEL[level]} Viva Leve`,
    durationWeeks: durationWeeks(level),
    weeklyFrequency: weeklyFrequency(level, profile.age),
    nextLevel: NEXT_LEVEL[level],
    days,
    cardio: calculateCardio(profile, level),
    safetyNotes: [
      'O plano de treino nao substitui avaliacao medica, fisioterapeutica ou acompanhamento presencial de um profissional de Educacao Fisica.',
      'Comece com uma carga que permita completar as repeticoes com tecnica adequada.',
      'Interrompa o exercicio se sentir dor aguda, tontura ou desconforto incomum.',
    ],
    validationErrors: [],
  };
  draft.validationErrors = validateTrainingPlan(draft, catalog, profile);
  return draft;
}
