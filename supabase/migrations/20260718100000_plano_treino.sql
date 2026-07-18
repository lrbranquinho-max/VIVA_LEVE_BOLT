create table if not exists public.exercise_catalog (
  id bigint primary key,
  name text not null,
  slug text not null unique,
  primary_muscle_group text not null,
  secondary_muscle_groups jsonb not null default '[]'::jsonb,
  environment text not null,
  equipment text,
  movement_pattern text,
  technical_level text,
  unilateral boolean not null default false,
  instructions text,
  precautions text,
  substitution_tags jsonb not null default '[]'::jsonb,
  video_url text,
  video_thumbnail_url text,
  video_duration integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  sex text not null check (sex in ('masculino', 'feminino')),
  age integer not null check (age between 12 and 90),
  training_experience_years numeric not null default 0,
  training_location text not null check (training_location in ('academia', 'casa')),
  goals jsonb not null default '[]'::jsonb,
  restrictions_text text,
  current_level text,
  current_goal text,
  priority_muscle_group text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.training_profiles(id) on delete set null,
  level text not null,
  name text not null,
  start_date date not null default current_date,
  expected_end_date date not null,
  duration_weeks integer not null,
  current_week integer not null default 1,
  weekly_frequency integer not null,
  status text not null default 'active' check (status in ('draft','active','paused','completed','archived','error')),
  adherence_percentage numeric not null default 0,
  generated_by_ai boolean not null default false,
  ai_model text,
  generation_version text not null default 'treino-v1',
  generation_payload jsonb not null default '{}'::jsonb,
  cardio_payload jsonb not null default '{}'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_days (
  id uuid primary key default gen_random_uuid(),
  training_plan_id uuid not null references public.training_plans(id) on delete cascade,
  code text not null,
  title text not null,
  order_index integer not null,
  focus text,
  recommended_weekdays jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_day_exercises (
  id uuid primary key default gen_random_uuid(),
  training_day_id uuid not null references public.training_days(id) on delete cascade,
  exercise_id bigint not null references public.exercise_catalog(id),
  order_index integer not null,
  sets integer not null,
  repetition_min integer not null,
  repetition_max integer not null,
  rest_seconds integer not null default 90,
  rir_target integer,
  rpe_target numeric,
  advanced_technique text,
  advanced_technique_instructions text,
  notes text,
  substitution_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  training_plan_id uuid not null references public.training_plans(id) on delete cascade,
  training_day_id uuid not null references public.training_days(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'started' check (status in ('started','completed','cancelled')),
  perceived_difficulty text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_session_exercises (
  id uuid primary key default gen_random_uuid(),
  training_session_id uuid not null references public.training_sessions(id) on delete cascade,
  training_day_exercise_id uuid not null references public.training_day_exercises(id) on delete cascade,
  completed boolean not null default false,
  skipped boolean not null default false,
  skip_reason text,
  load_used text,
  completed_repetitions text,
  perceived_difficulty text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_plan_progress (
  id uuid primary key default gen_random_uuid(),
  training_plan_id uuid not null references public.training_plans(id) on delete cascade,
  week_number integer not null,
  expected_sessions integer not null default 0,
  completed_sessions integer not null default 0,
  adherence_percentage numeric not null default 0,
  started_at date,
  completed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(training_plan_id, week_number)
);

create index if not exists idx_training_plans_user_status on public.training_plans(user_id, status);
create index if not exists idx_training_days_plan on public.training_days(training_plan_id, order_index);
create index if not exists idx_training_exercises_day on public.training_day_exercises(training_day_id, order_index);
create index if not exists idx_training_sessions_plan on public.training_sessions(training_plan_id, status);

alter table public.exercise_catalog enable row level security;
alter table public.training_profiles enable row level security;
alter table public.training_plans enable row level security;
alter table public.training_days enable row level security;
alter table public.training_day_exercises enable row level security;
alter table public.training_sessions enable row level security;
alter table public.training_session_exercises enable row level security;
alter table public.training_plan_progress enable row level security;

drop policy if exists "Usuarios leem catalogo de exercicios" on public.exercise_catalog;
drop policy if exists "Admins gerenciam catalogo de exercicios" on public.exercise_catalog;
create policy "Usuarios leem catalogo de exercicios" on public.exercise_catalog for select to authenticated using (is_active = true or public.is_viva_leve_admin());
create policy "Admins gerenciam catalogo de exercicios" on public.exercise_catalog for all to authenticated using (public.is_viva_leve_admin()) with check (public.is_viva_leve_admin());

drop policy if exists "Usuarios gerenciam proprio perfil treino" on public.training_profiles;
create policy "Usuarios gerenciam proprio perfil treino" on public.training_profiles for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Usuarios leem proprios planos treino" on public.training_plans;
drop policy if exists "Usuarios criam proprios planos treino" on public.training_plans;
drop policy if exists "Usuarios atualizam proprios planos treino" on public.training_plans;
create policy "Usuarios leem proprios planos treino" on public.training_plans for select to authenticated using ((select auth.uid()) = user_id or public.is_viva_leve_admin());
create policy "Usuarios criam proprios planos treino" on public.training_plans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Usuarios atualizam proprios planos treino" on public.training_plans for update to authenticated using ((select auth.uid()) = user_id or public.is_viva_leve_admin()) with check ((select auth.uid()) = user_id or public.is_viva_leve_admin());

drop policy if exists "Usuarios leem dias dos proprios planos" on public.training_days;
drop policy if exists "Usuarios criam dias dos proprios planos" on public.training_days;
create policy "Usuarios leem dias dos proprios planos" on public.training_days for select to authenticated using (exists (select 1 from public.training_plans p where p.id = training_plan_id and (p.user_id = (select auth.uid()) or public.is_viva_leve_admin())));
create policy "Usuarios criam dias dos proprios planos" on public.training_days for insert to authenticated with check (exists (select 1 from public.training_plans p where p.id = training_plan_id and p.user_id = (select auth.uid())));

drop policy if exists "Usuarios leem exercicios dos proprios treinos" on public.training_day_exercises;
drop policy if exists "Usuarios criam exercicios dos proprios treinos" on public.training_day_exercises;
create policy "Usuarios leem exercicios dos proprios treinos" on public.training_day_exercises for select to authenticated using (exists (select 1 from public.training_days d join public.training_plans p on p.id = d.training_plan_id where d.id = training_day_id and (p.user_id = (select auth.uid()) or public.is_viva_leve_admin())));
create policy "Usuarios criam exercicios dos proprios treinos" on public.training_day_exercises for insert to authenticated with check (exists (select 1 from public.training_days d join public.training_plans p on p.id = d.training_plan_id where d.id = training_day_id and p.user_id = (select auth.uid())));

drop policy if exists "Usuarios gerenciam proprias sessoes treino" on public.training_sessions;
create policy "Usuarios gerenciam proprias sessoes treino" on public.training_sessions for all to authenticated using ((select auth.uid()) = user_id or public.is_viva_leve_admin()) with check ((select auth.uid()) = user_id or public.is_viva_leve_admin());

drop policy if exists "Usuarios gerenciam exercicios das proprias sessoes" on public.training_session_exercises;
create policy "Usuarios gerenciam exercicios das proprias sessoes" on public.training_session_exercises for all to authenticated using (exists (select 1 from public.training_sessions s where s.id = training_session_id and (s.user_id = (select auth.uid()) or public.is_viva_leve_admin()))) with check (exists (select 1 from public.training_sessions s where s.id = training_session_id and (s.user_id = (select auth.uid()) or public.is_viva_leve_admin())));

drop policy if exists "Usuarios leem progresso dos proprios planos" on public.training_plan_progress;
drop policy if exists "Usuarios leem progresso dos proprios_planos" on public.training_plan_progress;
drop policy if exists "Usuarios criam progresso dos proprios planos" on public.training_plan_progress;
create policy "Usuarios leem progresso dos proprios planos" on public.training_plan_progress for select to authenticated using (exists (select 1 from public.training_plans p where p.id = training_plan_id and (p.user_id = (select auth.uid()) or public.is_viva_leve_admin())));
create policy "Usuarios criam progresso dos proprios planos" on public.training_plan_progress for insert to authenticated with check (exists (select 1 from public.training_plans p where p.id = training_plan_id and p.user_id = (select auth.uid())));

insert into public.app_config (chave, valor)
values ('training_settings', '{"min_adherence_percentage":70,"generation_version":"treino-v1"}'::jsonb)
on conflict (chave) do nothing;

insert into public.exercise_catalog (id, name, slug, primary_muscle_group, secondary_muscle_groups, environment, equipment, movement_pattern, technical_level, unilateral, instructions, precautions, substitution_tags, video_url, video_thumbnail_url, video_duration, is_active)
values
(1, 'Supino reto com barra', 'supino-reto-com-barra', 'Peitoral', '["Tríceps", "deltoide anterior"]'::jsonb, 'Academia', 'Barra, anilhas e banco', 'Empurrar horizontal', 'Intermediário', false, '', '', '["Peitoral", "Empurrar horizontal", "Barra", "anilhas e banco"]'::jsonb, '', '', null, true),
(2, 'Supino inclinado com barra', 'supino-inclinado-com-barra', 'Peitoral', '["Tríceps", "deltoide anterior"]'::jsonb, 'Academia', 'Barra, anilhas e banco inclinado', 'Empurrar inclinado', 'Intermediário', false, '', '', '["Peitoral", "Empurrar inclinado", "Barra", "anilhas e banco inclinado"]'::jsonb, '', '', null, true),
(3, 'Supino declinado com barra', 'supino-declinado-com-barra', 'Peitoral', '["Tríceps", "deltoide anterior"]'::jsonb, 'Academia', 'Barra, anilhas e banco declinado', 'Empurrar declinado', 'Intermediário', false, '', '', '["Peitoral", "Empurrar declinado", "Barra", "anilhas e banco declinado"]'::jsonb, '', '', null, true),
(4, 'Supino reto com halteres', 'supino-reto-com-halteres', 'Peitoral', '["Tríceps", "deltoide anterior"]'::jsonb, 'Academia/Casa', 'Halteres e banco', 'Empurrar horizontal', 'Intermediário', false, '', '', '["Peitoral", "Empurrar horizontal", "Halteres e banco"]'::jsonb, '', '', null, true),
(5, 'Supino inclinado com halteres', 'supino-inclinado-com-halteres', 'Peitoral', '["Tríceps", "deltoide anterior"]'::jsonb, 'Academia/Casa', 'Halteres e banco inclinado', 'Empurrar inclinado', 'Intermediário', false, '', '', '["Peitoral", "Empurrar inclinado", "Halteres e banco inclinado"]'::jsonb, '', '', null, true),
(6, 'Supino unilateral com halter', 'supino-unilateral-com-halter', 'Peitoral', '["Tríceps", "core"]'::jsonb, 'Academia/Casa', 'Halter e banco', 'Empurrar horizontal', 'Avançado', true, '', '', '["Peitoral", "Empurrar horizontal", "Halter e banco"]'::jsonb, '', '', null, true),
(7, 'Crucifixo reto com halteres', 'crucifixo-reto-com-halteres', 'Peitoral', '["Deltoide anterior"]'::jsonb, 'Academia/Casa', 'Halteres e banco', 'Adução horizontal', 'Intermediário', false, '', '', '["Peitoral", "Adução horizontal", "Halteres e banco"]'::jsonb, '', '', null, true),
(8, 'Crucifixo inclinado com halteres', 'crucifixo-inclinado-com-halteres', 'Peitoral', '["Deltoide anterior"]'::jsonb, 'Academia/Casa', 'Halteres e banco inclinado', 'Adução horizontal', 'Intermediário', false, '', '', '["Peitoral", "Adução horizontal", "Halteres e banco inclinado"]'::jsonb, '', '', null, true),
(9, 'Supino máquina horizontal', 'supino-maquina-horizontal', 'Peitoral', '["Tríceps", "deltoide anterior"]'::jsonb, 'Academia', 'Máquina chest press', 'Empurrar horizontal', 'Iniciante', false, '', '', '["Peitoral", "Empurrar horizontal", "Máquina chest press"]'::jsonb, '', '', null, true),
(10, 'Supino máquina inclinado', 'supino-maquina-inclinado', 'Peitoral', '["Tríceps", "deltoide anterior"]'::jsonb, 'Academia', 'Máquina incline press', 'Empurrar inclinado', 'Iniciante', false, '', '', '["Peitoral", "Empurrar inclinado", "Máquina incline press"]'::jsonb, '', '', null, true),
(11, 'Peck deck', 'peck-deck', 'Peitoral', '["Deltoide anterior"]'::jsonb, 'Academia', 'Máquina voador', 'Adução horizontal', 'Iniciante', false, '', '', '["Peitoral", "Adução horizontal", "Máquina voador"]'::jsonb, '', '', null, true),
(12, 'Crossover alto', 'crossover-alto', 'Peitoral', '["Deltoide anterior"]'::jsonb, 'Academia', 'Polia dupla', 'Adução diagonal descendente', 'Intermediário', false, '', '', '["Peitoral", "Adução diagonal descendente", "Polia dupla"]'::jsonb, '', '', null, true),
(13, 'Crossover médio', 'crossover-medio', 'Peitoral', '["Deltoide anterior"]'::jsonb, 'Academia', 'Polia dupla', 'Adução horizontal', 'Intermediário', false, '', '', '["Peitoral", "Adução horizontal", "Polia dupla"]'::jsonb, '', '', null, true),
(14, 'Crossover baixo', 'crossover-baixo', 'Peitoral', '["Deltoide anterior"]'::jsonb, 'Academia', 'Polia dupla', 'Adução diagonal ascendente', 'Intermediário', false, '', '', '["Peitoral", "Adução diagonal ascendente", "Polia dupla"]'::jsonb, '', '', null, true),
(15, 'Flexão de braços tradicional', 'flexao-de-bracos-tradicional', 'Peitoral', '["Tríceps", "deltoide anterior", "core"]'::jsonb, 'Casa/Academia', 'Nenhum', 'Empurrar horizontal', 'Iniciante', false, '', '', '["Peitoral", "Empurrar horizontal", "Nenhum"]'::jsonb, '', '', null, true),
(16, 'Flexão inclinada', 'flexao-inclinada', 'Peitoral', '["Tríceps", "deltoide anterior"]'::jsonb, 'Casa/Academia', 'Banco, mesa ou parede', 'Empurrar horizontal', 'Iniciante', false, '', '', '["Peitoral", "Empurrar horizontal", "Banco", "mesa ou parede"]'::jsonb, '', '', null, true),
(17, 'Flexão declinada', 'flexao-declinada', 'Peitoral', '["Tríceps", "deltoide anterior"]'::jsonb, 'Casa/Academia', 'Banco ou apoio', 'Empurrar inclinado', 'Intermediário', false, '', '', '["Peitoral", "Empurrar inclinado", "Banco ou apoio"]'::jsonb, '', '', null, true),
(18, 'Flexão diamante', 'flexao-diamante', 'Peitoral', '["Tríceps", "deltoide anterior"]'::jsonb, 'Casa/Academia', 'Nenhum', 'Empurrar horizontal', 'Intermediário', false, '', '', '["Peitoral", "Empurrar horizontal", "Nenhum"]'::jsonb, '', '', null, true),
(19, 'Flexão arqueiro', 'flexao-arqueiro', 'Peitoral', '["Tríceps", "core"]'::jsonb, 'Casa/Academia', 'Nenhum', 'Empurrar horizontal', 'Avançado', true, '', '', '["Peitoral", "Empurrar horizontal", "Nenhum"]'::jsonb, '', '', null, true),
(20, 'Flexão com elástico', 'flexao-com-elastico', 'Peitoral', '["Tríceps", "deltoide anterior"]'::jsonb, 'Casa/Academia', 'Faixa elástica', 'Empurrar horizontal', 'Intermediário', false, '', '', '["Peitoral", "Empurrar horizontal", "Faixa elástica"]'::jsonb, '', '', null, true),
(21, 'Puxada frontal pegada aberta', 'puxada-frontal-pegada-aberta', 'Costas', '["Bíceps", "romboides"]'::jsonb, 'Academia', 'Pulley alto e barra longa', 'Puxar vertical', 'Iniciante', false, '', '', '["Costas", "Puxar vertical", "Pulley alto e barra longa"]'::jsonb, '', '', null, true),
(22, 'Puxada frontal pegada neutra', 'puxada-frontal-pegada-neutra', 'Costas', '["Bíceps", "romboides"]'::jsonb, 'Academia', 'Pulley alto e triângulo', 'Puxar vertical', 'Iniciante', false, '', '', '["Costas", "Puxar vertical", "Pulley alto e triângulo"]'::jsonb, '', '', null, true),
(23, 'Puxada supinada', 'puxada-supinada', 'Costas', '["Bíceps"]'::jsonb, 'Academia', 'Pulley alto e barra', 'Puxar vertical', 'Intermediário', false, '', '', '["Costas", "Puxar vertical", "Pulley alto e barra"]'::jsonb, '', '', null, true),
(24, 'Puxada unilateral na polia', 'puxada-unilateral-na-polia', 'Costas', '["Bíceps", "core"]'::jsonb, 'Academia', 'Pulley alto e manopla', 'Puxar vertical', 'Intermediário', true, '', '', '["Costas", "Puxar vertical", "Pulley alto e manopla"]'::jsonb, '', '', null, true),
(25, 'Remada baixa pegada neutra', 'remada-baixa-pegada-neutra', 'Costas', '["Bíceps", "romboides"]'::jsonb, 'Academia', 'Polia baixa e triângulo', 'Puxar horizontal', 'Iniciante', false, '', '', '["Costas", "Puxar horizontal", "Polia baixa e triângulo"]'::jsonb, '', '', null, true),
(26, 'Remada baixa aberta', 'remada-baixa-aberta', 'Costas', '["Bíceps", "deltoide posterior"]'::jsonb, 'Academia', 'Polia baixa e barra', 'Puxar horizontal', 'Intermediário', false, '', '', '["Costas", "Puxar horizontal", "Polia baixa e barra"]'::jsonb, '', '', null, true),
(27, 'Remada cavalinho máquina', 'remada-cavalinho-maquina', 'Costas', '["Bíceps", "romboides"]'::jsonb, 'Academia', 'Máquina T-bar', 'Puxar horizontal', 'Iniciante', false, '', '', '["Costas", "Puxar horizontal", "Máquina T-bar"]'::jsonb, '', '', null, true),
(28, 'Remada articulada unilateral', 'remada-articulada-unilateral', 'Costas', '["Bíceps", "core"]'::jsonb, 'Academia', 'Máquina articulada', 'Puxar horizontal', 'Iniciante', true, '', '', '["Costas", "Puxar horizontal", "Máquina articulada"]'::jsonb, '', '', null, true),
(29, 'Remada máquina com apoio peitoral', 'remada-maquina-com-apoio-peitoral', 'Costas', '["Bíceps", "romboides"]'::jsonb, 'Academia', 'Máquina seated row', 'Puxar horizontal', 'Iniciante', false, '', '', '["Costas", "Puxar horizontal", "Máquina seated row"]'::jsonb, '', '', null, true),
(30, 'Pullover máquina', 'pullover-maquina', 'Costas', '["Peitoral", "tríceps longo"]'::jsonb, 'Academia', 'Máquina pullover', 'Extensão de ombro', 'Intermediário', false, '', '', '["Costas", "Extensão de ombro", "Máquina pullover"]'::jsonb, '', '', null, true),
(31, 'Pulldown braços estendidos', 'pulldown-bracos-estendidos', 'Costas', '["Tríceps longo", "core"]'::jsonb, 'Academia', 'Polia alta e barra/corda', 'Extensão de ombro', 'Intermediário', false, '', '', '["Costas", "Extensão de ombro", "Polia alta e barra/corda"]'::jsonb, '', '', null, true),
(32, 'Remada curvada com barra', 'remada-curvada-com-barra', 'Costas', '["Bíceps", "lombar", "posteriores"]'::jsonb, 'Academia/Casa', 'Barra e anilhas', 'Puxar horizontal', 'Intermediário', false, '', '', '["Costas", "Puxar horizontal", "Barra e anilhas"]'::jsonb, '', '', null, true),
(33, 'Remada Pendlay', 'remada-pendlay', 'Costas', '["Bíceps", "lombar"]'::jsonb, 'Academia', 'Barra e anilhas', 'Puxar horizontal explosivo', 'Avançado', false, '', '', '["Costas", "Puxar horizontal explosivo", "Barra e anilhas"]'::jsonb, '', '', null, true),
(34, 'Remada cavalinho com barra', 'remada-cavalinho-com-barra', 'Costas', '["Bíceps", "romboides"]'::jsonb, 'Academia', 'Barra, anilhas e landmine', 'Puxar horizontal', 'Intermediário', false, '', '', '["Costas", "Puxar horizontal", "Barra", "anilhas e landmine"]'::jsonb, '', '', null, true),
(35, 'Remada unilateral com halter', 'remada-unilateral-com-halter', 'Costas', '["Bíceps", "core"]'::jsonb, 'Academia/Casa', 'Halter e banco/apoio', 'Puxar horizontal', 'Iniciante', true, '', '', '["Costas", "Puxar horizontal", "Halter e banco/apoio"]'::jsonb, '', '', null, true),
(36, 'Remada invertida', 'remada-invertida', 'Costas', '["Bíceps", "core"]'::jsonb, 'Casa/Academia', 'Barra baixa ou mesa firme', 'Puxar horizontal', 'Intermediário', false, '', '', '["Costas", "Puxar horizontal", "Barra baixa ou mesa firme"]'::jsonb, '', '', null, true),
(37, 'Barra fixa pronada', 'barra-fixa-pronada', 'Costas', '["Bíceps", "core"]'::jsonb, 'Casa/Academia', 'Barra fixa', 'Puxar vertical', 'Intermediário', false, '', '', '["Costas", "Puxar vertical", "Barra fixa"]'::jsonb, '', '', null, true),
(38, 'Barra fixa supinada', 'barra-fixa-supinada', 'Costas', '["Bíceps"]'::jsonb, 'Casa/Academia', 'Barra fixa', 'Puxar vertical', 'Intermediário', false, '', '', '["Costas", "Puxar vertical", "Barra fixa"]'::jsonb, '', '', null, true),
(39, 'Barra fixa neutra', 'barra-fixa-neutra', 'Costas', '["Bíceps", "braquial"]'::jsonb, 'Casa/Academia', 'Barra fixa paralela', 'Puxar vertical', 'Intermediário', false, '', '', '["Costas", "Puxar vertical", "Barra fixa paralela"]'::jsonb, '', '', null, true),
(40, 'Remada com elástico', 'remada-com-elastico', 'Costas', '["Bíceps", "romboides"]'::jsonb, 'Casa/Academia', 'Faixa elástica e ponto de ancoragem', 'Puxar horizontal', 'Iniciante', false, '', '', '["Costas", "Puxar horizontal", "Faixa elástica e ponto de ancoragem"]'::jsonb, '', '', null, true),
(41, 'Puxada com elástico ajoelhado', 'puxada-com-elastico-ajoelhado', 'Costas', '["Bíceps"]'::jsonb, 'Casa/Academia', 'Faixa elástica e ancoragem alta', 'Puxar vertical', 'Iniciante', false, '', '', '["Costas", "Puxar vertical", "Faixa elástica e ancoragem alta"]'::jsonb, '', '', null, true),
(42, 'Superman com puxada', 'superman-com-puxada', 'Costas', '["Lombar", "deltoide posterior"]'::jsonb, 'Casa', 'Colchonete', 'Extensão lombar e puxada', 'Iniciante', false, '', '', '["Costas", "Extensão lombar e puxada", "Colchonete"]'::jsonb, '', '', null, true),
(43, 'Desenvolvimento militar com barra', 'desenvolvimento-militar-com-barra', 'Ombros', '["Tríceps", "trapézio"]'::jsonb, 'Academia/Casa', 'Barra e anilhas', 'Empurrar vertical', 'Intermediário', false, '', '', '["Ombros", "Empurrar vertical", "Barra e anilhas"]'::jsonb, '', '', null, true),
(44, 'Desenvolvimento com halteres sentado', 'desenvolvimento-com-halteres-sentado', 'Ombros', '["Tríceps"]'::jsonb, 'Academia/Casa', 'Halteres e banco', 'Empurrar vertical', 'Iniciante', false, '', '', '["Ombros", "Empurrar vertical", "Halteres e banco"]'::jsonb, '', '', null, true),
(45, 'Desenvolvimento Arnold', 'desenvolvimento-arnold', 'Ombros', '["Tríceps"]'::jsonb, 'Academia/Casa', 'Halteres', 'Empurrar vertical com rotação', 'Intermediário', false, '', '', '["Ombros", "Empurrar vertical com rotação", "Halteres"]'::jsonb, '', '', null, true),
(46, 'Desenvolvimento máquina', 'desenvolvimento-maquina', 'Ombros', '["Tríceps"]'::jsonb, 'Academia', 'Máquina shoulder press', 'Empurrar vertical', 'Iniciante', false, '', '', '["Ombros", "Empurrar vertical", "Máquina shoulder press"]'::jsonb, '', '', null, true),
(47, 'Desenvolvimento no Smith', 'desenvolvimento-no-smith', 'Ombros', '["Tríceps"]'::jsonb, 'Academia', 'Smith e banco', 'Empurrar vertical', 'Intermediário', false, '', '', '["Ombros", "Empurrar vertical", "Smith e banco"]'::jsonb, '', '', null, true),
(48, 'Elevação lateral com halteres', 'elevacao-lateral-com-halteres', 'Ombros', '["Trapézio superior"]'::jsonb, 'Academia/Casa', 'Halteres', 'Abdução de ombro', 'Iniciante', false, '', '', '["Ombros", "Abdução de ombro", "Halteres"]'::jsonb, '', '', null, true),
(49, 'Elevação lateral unilateral na polia', 'elevacao-lateral-unilateral-na-polia', 'Ombros', '["Trapézio superior"]'::jsonb, 'Academia', 'Polia baixa e manopla', 'Abdução de ombro', 'Intermediário', true, '', '', '["Ombros", "Abdução de ombro", "Polia baixa e manopla"]'::jsonb, '', '', null, true),
(50, 'Elevação lateral máquina', 'elevacao-lateral-maquina', 'Ombros', '["Trapézio superior"]'::jsonb, 'Academia', 'Máquina lateral raise', 'Abdução de ombro', 'Iniciante', false, '', '', '["Ombros", "Abdução de ombro", "Máquina lateral raise"]'::jsonb, '', '', null, true),
(51, 'Elevação frontal com halteres', 'elevacao-frontal-com-halteres', 'Ombros', '["Peitoral superior"]'::jsonb, 'Academia/Casa', 'Halteres', 'Flexão de ombro', 'Iniciante', false, '', '', '["Ombros", "Flexão de ombro", "Halteres"]'::jsonb, '', '', null, true),
(52, 'Elevação frontal na polia', 'elevacao-frontal-na-polia', 'Ombros', '["Peitoral superior"]'::jsonb, 'Academia', 'Polia baixa e barra/corda', 'Flexão de ombro', 'Intermediário', false, '', '', '["Ombros", "Flexão de ombro", "Polia baixa e barra/corda"]'::jsonb, '', '', null, true),
(53, 'Crucifixo inverso máquina', 'crucifixo-inverso-maquina', 'Ombros', '["Romboides", "trapézio"]'::jsonb, 'Academia', 'Peck deck reverso', 'Abdução horizontal', 'Iniciante', false, '', '', '["Ombros", "Abdução horizontal", "Peck deck reverso"]'::jsonb, '', '', null, true),
(54, 'Crucifixo inverso com halteres', 'crucifixo-inverso-com-halteres', 'Ombros', '["Romboides", "trapézio"]'::jsonb, 'Academia/Casa', 'Halteres', 'Abdução horizontal', 'Intermediário', false, '', '', '["Ombros", "Abdução horizontal", "Halteres"]'::jsonb, '', '', null, true),
(55, 'Face pull', 'face-pull', 'Ombros', '["Romboides", "manguito"]'::jsonb, 'Academia/Casa', 'Polia alta ou faixa', 'Puxar horizontal com rotação externa', 'Iniciante', false, '', '', '["Ombros", "Puxar horizontal com rotação externa", "Polia alta ou faixa"]'::jsonb, '', '', null, true),
(56, 'Elevação lateral com elástico', 'elevacao-lateral-com-elastico', 'Ombros', '["Trapézio superior"]'::jsonb, 'Casa/Academia', 'Faixa elástica', 'Abdução de ombro', 'Iniciante', false, '', '', '["Ombros", "Abdução de ombro", "Faixa elástica"]'::jsonb, '', '', null, true),
(57, 'Pike push-up', 'pike-push-up', 'Ombros', '["Tríceps", "peitoral superior"]'::jsonb, 'Casa/Academia', 'Nenhum', 'Empurrar vertical', 'Intermediário', false, '', '', '["Ombros", "Empurrar vertical", "Nenhum"]'::jsonb, '', '', null, true),
(58, 'Handstand push-up na parede', 'handstand-push-up-na-parede', 'Ombros', '["Tríceps", "core"]'::jsonb, 'Casa/Academia', 'Parede', 'Empurrar vertical', 'Avançado', false, '', '', '["Ombros", "Empurrar vertical", "Parede"]'::jsonb, '', '', null, true),
(59, 'Rosca direta com barra reta', 'rosca-direta-com-barra-reta', 'Bíceps', '["Braquial", "antebraço"]'::jsonb, 'Academia/Casa', 'Barra e anilhas', 'Flexão de cotovelo', 'Iniciante', false, '', '', '["Bíceps", "Flexão de cotovelo", "Barra e anilhas"]'::jsonb, '', '', null, true),
(60, 'Rosca direta com barra W', 'rosca-direta-com-barra-w', 'Bíceps', '["Braquial", "antebraço"]'::jsonb, 'Academia/Casa', 'Barra W e anilhas', 'Flexão de cotovelo', 'Iniciante', false, '', '', '["Bíceps", "Flexão de cotovelo", "Barra W e anilhas"]'::jsonb, '', '', null, true),
(61, 'Rosca alternada com halteres', 'rosca-alternada-com-halteres', 'Bíceps', '["Braquial", "antebraço"]'::jsonb, 'Academia/Casa', 'Halteres', 'Flexão de cotovelo', 'Iniciante', true, '', '', '["Bíceps", "Flexão de cotovelo", "Halteres"]'::jsonb, '', '', null, true),
(62, 'Rosca martelo', 'rosca-martelo', 'Bíceps', '["Braquial", "braquiorradial"]'::jsonb, 'Academia/Casa', 'Halteres', 'Flexão de cotovelo neutra', 'Iniciante', false, '', '', '["Bíceps", "Flexão de cotovelo neutra", "Halteres"]'::jsonb, '', '', null, true),
(63, 'Rosca concentrada', 'rosca-concentrada', 'Bíceps', '["Braquial"]'::jsonb, 'Academia/Casa', 'Halter', 'Flexão de cotovelo', 'Iniciante', true, '', '', '["Bíceps", "Flexão de cotovelo", "Halter"]'::jsonb, '', '', null, true),
(64, 'Rosca inclinada com halteres', 'rosca-inclinada-com-halteres', 'Bíceps', '["Braquial"]'::jsonb, 'Academia/Casa', 'Halteres e banco inclinado', 'Flexão de cotovelo', 'Intermediário', false, '', '', '["Bíceps", "Flexão de cotovelo", "Halteres e banco inclinado"]'::jsonb, '', '', null, true),
(65, 'Rosca Scott com barra W', 'rosca-scott-com-barra-w', 'Bíceps', '["Braquial"]'::jsonb, 'Academia', 'Banco Scott e barra W', 'Flexão de cotovelo', 'Iniciante', false, '', '', '["Bíceps", "Flexão de cotovelo", "Banco Scott e barra W"]'::jsonb, '', '', null, true),
(66, 'Rosca Scott máquina', 'rosca-scott-maquina', 'Bíceps', '["Braquial"]'::jsonb, 'Academia', 'Máquina preacher curl', 'Flexão de cotovelo', 'Iniciante', false, '', '', '["Bíceps", "Flexão de cotovelo", "Máquina preacher curl"]'::jsonb, '', '', null, true),
(67, 'Rosca direta na polia baixa', 'rosca-direta-na-polia-baixa', 'Bíceps', '["Braquial", "antebraço"]'::jsonb, 'Academia', 'Polia baixa e barra', 'Flexão de cotovelo', 'Iniciante', false, '', '', '["Bíceps", "Flexão de cotovelo", "Polia baixa e barra"]'::jsonb, '', '', null, true),
(68, 'Rosca unilateral na polia', 'rosca-unilateral-na-polia', 'Bíceps', '["Braquial"]'::jsonb, 'Academia', 'Polia baixa e manopla', 'Flexão de cotovelo', 'Intermediário', true, '', '', '["Bíceps", "Flexão de cotovelo", "Polia baixa e manopla"]'::jsonb, '', '', null, true),
(69, 'Rosca bayesian na polia', 'rosca-bayesian-na-polia', 'Bíceps', '["Braquial"]'::jsonb, 'Academia', 'Polia baixa e manopla', 'Flexão de cotovelo com ombro estendido', 'Intermediário', true, '', '', '["Bíceps", "Flexão de cotovelo com ombro estendido", "Polia baixa e manopla"]'::jsonb, '', '', null, true),
(70, 'Rosca com elástico', 'rosca-com-elastico', 'Bíceps', '["Braquial", "antebraço"]'::jsonb, 'Casa/Academia', 'Faixa elástica', 'Flexão de cotovelo', 'Iniciante', false, '', '', '["Bíceps", "Flexão de cotovelo", "Faixa elástica"]'::jsonb, '', '', null, true),
(71, 'Chin-up focado em bíceps', 'chin-up-focado-em-biceps', 'Bíceps', '["Dorsais", "braquial"]'::jsonb, 'Casa/Academia', 'Barra fixa', 'Puxar vertical', 'Intermediário', false, '', '', '["Bíceps", "Puxar vertical", "Barra fixa"]'::jsonb, '', '', null, true),
(72, 'Tríceps pulley barra reta', 'triceps-pulley-barra-reta', 'Tríceps', '["Antebraço"]'::jsonb, 'Academia', 'Polia alta e barra', 'Extensão de cotovelo', 'Iniciante', false, '', '', '["Tríceps", "Extensão de cotovelo", "Polia alta e barra"]'::jsonb, '', '', null, true),
(73, 'Tríceps pulley corda', 'triceps-pulley-corda', 'Tríceps', '["Antebraço"]'::jsonb, 'Academia', 'Polia alta e corda', 'Extensão de cotovelo', 'Iniciante', false, '', '', '["Tríceps", "Extensão de cotovelo", "Polia alta e corda"]'::jsonb, '', '', null, true),
(74, 'Tríceps pulley unilateral', 'triceps-pulley-unilateral', 'Tríceps', '["Antebraço"]'::jsonb, 'Academia', 'Polia alta e manopla', 'Extensão de cotovelo', 'Intermediário', true, '', '', '["Tríceps", "Extensão de cotovelo", "Polia alta e manopla"]'::jsonb, '', '', null, true),
(75, 'Tríceps francês com halter', 'triceps-frances-com-halter', 'Tríceps', '["Deltoide"]'::jsonb, 'Academia/Casa', 'Halter', 'Extensão de cotovelo acima da cabeça', 'Iniciante', false, '', '', '["Tríceps", "Extensão de cotovelo acima da cabeça", "Halter"]'::jsonb, '', '', null, true),
(76, 'Tríceps testa com barra W', 'triceps-testa-com-barra-w', 'Tríceps', '["Deltoide"]'::jsonb, 'Academia/Casa', 'Barra W e banco', 'Extensão de cotovelo', 'Intermediário', false, '', '', '["Tríceps", "Extensão de cotovelo", "Barra W e banco"]'::jsonb, '', '', null, true),
(77, 'Tríceps testa com halteres', 'triceps-testa-com-halteres', 'Tríceps', '["Deltoide"]'::jsonb, 'Academia/Casa', 'Halteres e banco', 'Extensão de cotovelo', 'Intermediário', false, '', '', '["Tríceps", "Extensão de cotovelo", "Halteres e banco"]'::jsonb, '', '', null, true),
(78, 'Tríceps coice com halter', 'triceps-coice-com-halter', 'Tríceps', '["Deltoide posterior"]'::jsonb, 'Academia/Casa', 'Halter', 'Extensão de cotovelo', 'Iniciante', true, '', '', '["Tríceps", "Extensão de cotovelo", "Halter"]'::jsonb, '', '', null, true),
(79, 'Mergulho em paralelas', 'mergulho-em-paralelas', 'Tríceps', '["Peitoral", "deltoide anterior"]'::jsonb, 'Academia/Casa', 'Barras paralelas', 'Empurrar vertical', 'Intermediário', false, '', '', '["Tríceps", "Empurrar vertical", "Barras paralelas"]'::jsonb, '', '', null, true),
(80, 'Mergulho no banco', 'mergulho-no-banco', 'Tríceps', '["Peitoral", "deltoide anterior"]'::jsonb, 'Casa/Academia', 'Banco ou cadeira firme', 'Extensão de cotovelo', 'Iniciante', false, '', '', '["Tríceps", "Extensão de cotovelo", "Banco ou cadeira firme"]'::jsonb, '', '', null, true),
(81, 'Supino fechado', 'supino-fechado', 'Tríceps', '["Peitoral", "deltoide anterior"]'::jsonb, 'Academia/Casa', 'Barra e banco', 'Empurrar horizontal', 'Intermediário', false, '', '', '["Tríceps", "Empurrar horizontal", "Barra e banco"]'::jsonb, '', '', null, true),
(82, 'Tríceps máquina', 'triceps-maquina', 'Tríceps', '["Peitoral"]'::jsonb, 'Academia', 'Máquina triceps press', 'Extensão de cotovelo', 'Iniciante', false, '', '', '["Tríceps", "Extensão de cotovelo", "Máquina triceps press"]'::jsonb, '', '', null, true),
(83, 'Extensão de tríceps com elástico', 'extensao-de-triceps-com-elastico', 'Tríceps', '["Deltoide"]'::jsonb, 'Casa/Academia', 'Faixa elástica e ancoragem', 'Extensão de cotovelo', 'Iniciante', false, '', '', '["Tríceps", "Extensão de cotovelo", "Faixa elástica e ancoragem"]'::jsonb, '', '', null, true),
(84, 'Agachamento livre com barra alta', 'agachamento-livre-com-barra-alta', 'Quadríceps', '["Glúteos", "posteriores", "core"]'::jsonb, 'Academia', 'Rack, barra e anilhas', 'Agachar', 'Intermediário', false, '', '', '["Quadríceps", "Agachar", "Rack", "barra e anilhas"]'::jsonb, '', '', null, true),
(85, 'Agachamento livre com barra baixa', 'agachamento-livre-com-barra-baixa', 'Quadríceps', '["Glúteos", "posteriores", "core"]'::jsonb, 'Academia', 'Rack, barra e anilhas', 'Agachar', 'Avançado', false, '', '', '["Quadríceps", "Agachar", "Rack", "barra e anilhas"]'::jsonb, '', '', null, true),
(86, 'Agachamento frontal', 'agachamento-frontal', 'Quadríceps', '["Glúteos", "core"]'::jsonb, 'Academia', 'Rack, barra e anilhas', 'Agachar', 'Avançado', false, '', '', '["Quadríceps", "Agachar", "Rack", "barra e anilhas"]'::jsonb, '', '', null, true),
(87, 'Agachamento goblet', 'agachamento-goblet', 'Quadríceps', '["Glúteos", "core"]'::jsonb, 'Academia/Casa', 'Halter ou kettlebell', 'Agachar', 'Iniciante', false, '', '', '["Quadríceps", "Agachar", "Halter ou kettlebell"]'::jsonb, '', '', null, true),
(88, 'Agachamento no Smith', 'agachamento-no-smith', 'Quadríceps', '["Glúteos", "posteriores"]'::jsonb, 'Academia', 'Smith', 'Agachar', 'Iniciante', false, '', '', '["Quadríceps", "Agachar", "Smith"]'::jsonb, '', '', null, true),
(89, 'Hack squat', 'hack-squat', 'Quadríceps', '["Glúteos", "posteriores"]'::jsonb, 'Academia', 'Máquina hack', 'Agachar', 'Iniciante', false, '', '', '["Quadríceps", "Agachar", "Máquina hack"]'::jsonb, '', '', null, true),
(90, 'Pendulum squat', 'pendulum-squat', 'Quadríceps', '["Glúteos", "posteriores"]'::jsonb, 'Academia', 'Máquina pendular', 'Agachar', 'Intermediário', false, '', '', '["Quadríceps", "Agachar", "Máquina pendular"]'::jsonb, '', '', null, true),
(91, 'V squat', 'v-squat', 'Quadríceps', '["Glúteos", "posteriores"]'::jsonb, 'Academia', 'Máquina V squat', 'Agachar', 'Intermediário', false, '', '', '["Quadríceps", "Agachar", "Máquina V squat"]'::jsonb, '', '', null, true),
(92, 'Leg press 45 graus', 'leg-press-45-graus', 'Quadríceps', '["Glúteos", "posteriores"]'::jsonb, 'Academia', 'Leg press 45°', 'Empurrar com pernas', 'Iniciante', false, '', '', '["Quadríceps", "Empurrar com pernas", "Leg press 45°"]'::jsonb, '', '', null, true),
(93, 'Leg press horizontal', 'leg-press-horizontal', 'Quadríceps', '["Glúteos", "posteriores"]'::jsonb, 'Academia', 'Leg press horizontal', 'Empurrar com pernas', 'Iniciante', false, '', '', '["Quadríceps", "Empurrar com pernas", "Leg press horizontal"]'::jsonb, '', '', null, true),
(94, 'Leg press vertical', 'leg-press-vertical', 'Quadríceps', '["Glúteos", "posteriores"]'::jsonb, 'Academia', 'Leg press vertical', 'Empurrar com pernas', 'Intermediário', false, '', '', '["Quadríceps", "Empurrar com pernas", "Leg press vertical"]'::jsonb, '', '', null, true),
(95, 'Cadeira extensora bilateral', 'cadeira-extensora-bilateral', 'Quadríceps', '["Nenhum relevante"]'::jsonb, 'Academia', 'Cadeira extensora', 'Extensão de joelho', 'Iniciante', false, '', '', '["Quadríceps", "Extensão de joelho", "Cadeira extensora"]'::jsonb, '', '', null, true),
(96, 'Cadeira extensora unilateral', 'cadeira-extensora-unilateral', 'Quadríceps', '["Nenhum relevante"]'::jsonb, 'Academia', 'Cadeira extensora', 'Extensão de joelho', 'Iniciante', true, '', '', '["Quadríceps", "Extensão de joelho", "Cadeira extensora"]'::jsonb, '', '', null, true),
(97, 'Afundo com halteres', 'afundo-com-halteres', 'Quadríceps', '["Glúteos", "posteriores"]'::jsonb, 'Academia/Casa', 'Halteres', 'Avançar/agachar unilateral', 'Intermediário', true, '', '', '["Quadríceps", "Avançar/agachar unilateral", "Halteres"]'::jsonb, '', '', null, true),
(98, 'Passada caminhando', 'passada-caminhando', 'Quadríceps', '["Glúteos", "posteriores"]'::jsonb, 'Academia/Casa', 'Halteres ou peso corporal', 'Avançar/agachar unilateral', 'Intermediário', true, '', '', '["Quadríceps", "Avançar/agachar unilateral", "Halteres ou peso corporal"]'::jsonb, '', '', null, true),
(99, 'Agachamento búlgaro', 'agachamento-bulgaro', 'Quadríceps', '["Glúteos", "posteriores"]'::jsonb, 'Academia/Casa', 'Banco e halteres opcionais', 'Agachar unilateral', 'Intermediário', true, '', '', '["Quadríceps", "Agachar unilateral", "Banco e halteres opcionais"]'::jsonb, '', '', null, true),
(100, 'Step-up no banco', 'step-up-no-banco', 'Quadríceps', '["Glúteos", "posteriores"]'::jsonb, 'Academia/Casa', 'Banco/caixa e halteres opcionais', 'Subir degrau', 'Iniciante', true, '', '', '["Quadríceps", "Subir degrau", "Banco/caixa e halteres opcionais"]'::jsonb, '', '', null, true),
(101, 'Sissy squat assistido', 'sissy-squat-assistido', 'Quadríceps', '["Core"]'::jsonb, 'Academia/Casa', 'Apoio firme', 'Agachar com ênfase no joelho', 'Avançado', false, '', '', '["Quadríceps", "Agachar com ênfase no joelho", "Apoio firme"]'::jsonb, '', '', null, true),
(102, 'Agachamento com peso corporal', 'agachamento-com-peso-corporal', 'Quadríceps', '["Glúteos", "posteriores", "core"]'::jsonb, 'Casa/Academia', 'Nenhum', 'Agachar', 'Iniciante', false, '', '', '["Quadríceps", "Agachar", "Nenhum"]'::jsonb, '', '', null, true),
(103, 'Agachamento na parede', 'agachamento-na-parede', 'Quadríceps', '["Glúteos"]'::jsonb, 'Casa', 'Parede', 'Isometria de agachamento', 'Iniciante', false, '', '', '["Quadríceps", "Isometria de agachamento", "Parede"]'::jsonb, '', '', null, true),
(104, 'Agachamento com salto', 'agachamento-com-salto', 'Quadríceps', '["Glúteos", "panturrilhas"]'::jsonb, 'Casa/Academia', 'Nenhum', 'Agachar e saltar', 'Intermediário', false, '', '', '["Quadríceps", "Agachar e saltar", "Nenhum"]'::jsonb, '', '', null, true),
(105, 'Afundo reverso', 'afundo-reverso', 'Quadríceps', '["Glúteos", "posteriores"]'::jsonb, 'Casa/Academia', 'Nenhum ou halteres', 'Avançar/agachar unilateral', 'Iniciante', true, '', '', '["Quadríceps", "Avançar/agachar unilateral", "Nenhum ou halteres"]'::jsonb, '', '', null, true),
(106, 'Levantamento terra convencional', 'levantamento-terra-convencional', 'Posteriores de coxa', '["Glúteos", "lombar", "trapézio"]'::jsonb, 'Academia', 'Barra e anilhas', 'Hinge/puxar do chão', 'Avançado', false, '', '', '["Posteriores de coxa", "Hinge/puxar do chão", "Barra e anilhas"]'::jsonb, '', '', null, true),
(107, 'Levantamento terra sumô', 'levantamento-terra-sumo', 'Posteriores de coxa', '["Glúteos", "adutores", "quadríceps"]'::jsonb, 'Academia', 'Barra e anilhas', 'Hinge/puxar do chão', 'Avançado', false, '', '', '["Posteriores de coxa", "Hinge/puxar do chão", "Barra e anilhas"]'::jsonb, '', '', null, true),
(108, 'Levantamento terra romeno', 'levantamento-terra-romeno', 'Posteriores de coxa', '["Glúteos", "lombar"]'::jsonb, 'Academia/Casa', 'Barra ou halteres', 'Hinge', 'Intermediário', false, '', '', '["Posteriores de coxa", "Hinge", "Barra ou halteres"]'::jsonb, '', '', null, true),
(109, 'Stiff com barra', 'stiff-com-barra', 'Posteriores de coxa', '["Glúteos", "lombar"]'::jsonb, 'Academia/Casa', 'Barra e anilhas', 'Hinge', 'Intermediário', false, '', '', '["Posteriores de coxa", "Hinge", "Barra e anilhas"]'::jsonb, '', '', null, true),
(110, 'Stiff com halteres', 'stiff-com-halteres', 'Posteriores de coxa', '["Glúteos", "lombar"]'::jsonb, 'Academia/Casa', 'Halteres', 'Hinge', 'Iniciante', false, '', '', '["Posteriores de coxa", "Hinge", "Halteres"]'::jsonb, '', '', null, true),
(111, 'Stiff unilateral', 'stiff-unilateral', 'Posteriores de coxa', '["Glúteos", "core"]'::jsonb, 'Academia/Casa', 'Halter opcional', 'Hinge unilateral', 'Intermediário', true, '', '', '["Posteriores de coxa", "Hinge unilateral", "Halter opcional"]'::jsonb, '', '', null, true),
(112, 'Mesa flexora', 'mesa-flexora', 'Posteriores de coxa', '["Panturrilhas"]'::jsonb, 'Academia', 'Mesa flexora', 'Flexão de joelho', 'Iniciante', false, '', '', '["Posteriores de coxa", "Flexão de joelho", "Mesa flexora"]'::jsonb, '', '', null, true),
(113, 'Cadeira flexora', 'cadeira-flexora', 'Posteriores de coxa', '["Panturrilhas"]'::jsonb, 'Academia', 'Cadeira flexora', 'Flexão de joelho', 'Iniciante', false, '', '', '["Posteriores de coxa", "Flexão de joelho", "Cadeira flexora"]'::jsonb, '', '', null, true),
(114, 'Flexora em pé unilateral', 'flexora-em-pe-unilateral', 'Posteriores de coxa', '["Panturrilhas"]'::jsonb, 'Academia', 'Máquina standing leg curl', 'Flexão de joelho', 'Iniciante', true, '', '', '["Posteriores de coxa", "Flexão de joelho", "Máquina standing leg curl"]'::jsonb, '', '', null, true),
(115, 'Flexora ajoelhada unilateral', 'flexora-ajoelhada-unilateral', 'Posteriores de coxa', '["Panturrilhas"]'::jsonb, 'Academia', 'Máquina kneeling leg curl', 'Flexão de joelho', 'Intermediário', true, '', '', '["Posteriores de coxa", "Flexão de joelho", "Máquina kneeling leg curl"]'::jsonb, '', '', null, true),
(116, 'Nordic curl', 'nordic-curl', 'Posteriores de coxa', '["Glúteos", "core"]'::jsonb, 'Casa/Academia', 'Apoio para tornozelos', 'Flexão de joelho excêntrica', 'Avançado', false, '', '', '["Posteriores de coxa", "Flexão de joelho excêntrica", "Apoio para tornozelos"]'::jsonb, '', '', null, true),
(117, 'Flexão de joelhos com bola suíça', 'flexao-de-joelhos-com-bola-suica', 'Posteriores de coxa', '["Glúteos", "core"]'::jsonb, 'Casa/Academia', 'Bola suíça', 'Flexão de joelho e extensão de quadril', 'Intermediário', false, '', '', '["Posteriores de coxa", "Flexão de joelho e extensão de quadril", "Bola suíça"]'::jsonb, '', '', null, true),
(118, 'Flexão de joelhos deslizante', 'flexao-de-joelhos-deslizante', 'Posteriores de coxa', '["Glúteos", "core"]'::jsonb, 'Casa', 'Toalhas ou discos deslizantes', 'Flexão de joelho', 'Intermediário', false, '', '', '["Posteriores de coxa", "Flexão de joelho", "Toalhas ou discos deslizantes"]'::jsonb, '', '', null, true),
(119, 'Good morning com barra', 'good-morning-com-barra', 'Posteriores de coxa', '["Glúteos", "lombar"]'::jsonb, 'Academia', 'Barra e anilhas', 'Hinge', 'Avançado', false, '', '', '["Posteriores de coxa", "Hinge", "Barra e anilhas"]'::jsonb, '', '', null, true),
(120, 'Good morning com elástico', 'good-morning-com-elastico', 'Posteriores de coxa', '["Glúteos", "lombar"]'::jsonb, 'Casa/Academia', 'Faixa elástica', 'Hinge', 'Iniciante', false, '', '', '["Posteriores de coxa", "Hinge", "Faixa elástica"]'::jsonb, '', '', null, true),
(121, 'Hip thrust com barra', 'hip-thrust-com-barra', 'Glúteos', '["Posteriores", "core"]'::jsonb, 'Academia/Casa', 'Barra, anilhas e banco', 'Extensão de quadril', 'Intermediário', false, '', '', '["Glúteos", "Extensão de quadril", "Barra", "anilhas e banco"]'::jsonb, '', '', null, true),
(122, 'Hip thrust máquina', 'hip-thrust-maquina', 'Glúteos', '["Posteriores"]'::jsonb, 'Academia', 'Máquina hip thrust', 'Extensão de quadril', 'Iniciante', false, '', '', '["Glúteos", "Extensão de quadril", "Máquina hip thrust"]'::jsonb, '', '', null, true),
(123, 'Glute drive máquina', 'glute-drive-maquina', 'Glúteos', '["Posteriores"]'::jsonb, 'Academia', 'Máquina glute drive', 'Extensão de quadril', 'Iniciante', false, '', '', '["Glúteos", "Extensão de quadril", "Máquina glute drive"]'::jsonb, '', '', null, true),
(124, 'Elevação pélvica no Smith', 'elevacao-pelvica-no-smith', 'Glúteos', '["Posteriores"]'::jsonb, 'Academia', 'Smith e banco', 'Extensão de quadril', 'Intermediário', false, '', '', '["Glúteos", "Extensão de quadril", "Smith e banco"]'::jsonb, '', '', null, true),
(125, 'Ponte de glúteos', 'ponte-de-gluteos', 'Glúteos', '["Posteriores", "core"]'::jsonb, 'Casa/Academia', 'Colchonete', 'Extensão de quadril', 'Iniciante', false, '', '', '["Glúteos", "Extensão de quadril", "Colchonete"]'::jsonb, '', '', null, true),
(126, 'Ponte unilateral', 'ponte-unilateral', 'Glúteos', '["Posteriores", "core"]'::jsonb, 'Casa/Academia', 'Colchonete', 'Extensão de quadril unilateral', 'Intermediário', true, '', '', '["Glúteos", "Extensão de quadril unilateral", "Colchonete"]'::jsonb, '', '', null, true),
(127, 'Coice na polia', 'coice-na-polia', 'Glúteos', '["Posteriores"]'::jsonb, 'Academia', 'Polia baixa e tornozeleira', 'Extensão de quadril', 'Iniciante', true, '', '', '["Glúteos", "Extensão de quadril", "Polia baixa e tornozeleira"]'::jsonb, '', '', null, true),
(128, 'Coice máquina', 'coice-maquina', 'Glúteos', '["Posteriores"]'::jsonb, 'Academia', 'Máquina glúteo', 'Extensão de quadril', 'Iniciante', true, '', '', '["Glúteos", "Extensão de quadril", "Máquina glúteo"]'::jsonb, '', '', null, true),
(129, 'Abdução de quadril máquina', 'abducao-de-quadril-maquina', 'Glúteos', '["Glúteo médio e mínimo"]'::jsonb, 'Academia', 'Cadeira abdutora', 'Abdução de quadril', 'Iniciante', false, '', '', '["Glúteos", "Abdução de quadril", "Cadeira abdutora"]'::jsonb, '', '', null, true),
(130, 'Abdução em pé na polia', 'abducao-em-pe-na-polia', 'Glúteos', '["Core"]'::jsonb, 'Academia', 'Polia baixa e tornozeleira', 'Abdução de quadril', 'Intermediário', true, '', '', '["Glúteos", "Abdução de quadril", "Polia baixa e tornozeleira"]'::jsonb, '', '', null, true),
(131, 'Abdução lateral com elástico', 'abducao-lateral-com-elastico', 'Glúteos', '["Core"]'::jsonb, 'Casa/Academia', 'Mini band', 'Abdução de quadril', 'Iniciante', true, '', '', '["Glúteos", "Abdução de quadril", "Mini band"]'::jsonb, '', '', null, true),
(132, 'Caminhada lateral com mini band', 'caminhada-lateral-com-mini-band', 'Glúteos', '["Quadríceps", "core"]'::jsonb, 'Casa/Academia', 'Mini band', 'Abdução e estabilização', 'Iniciante', false, '', '', '["Glúteos", "Abdução e estabilização", "Mini band"]'::jsonb, '', '', null, true),
(133, 'Fire hydrant', 'fire-hydrant', 'Glúteos', '["Core"]'::jsonb, 'Casa/Academia', 'Colchonete; mini band opcional', 'Abdução e rotação de quadril', 'Iniciante', true, '', '', '["Glúteos", "Abdução e rotação de quadril", "Colchonete", "mini band opcional"]'::jsonb, '', '', null, true),
(134, 'Donkey kick', 'donkey-kick', 'Glúteos', '["Posteriores", "core"]'::jsonb, 'Casa/Academia', 'Colchonete; mini band opcional', 'Extensão de quadril', 'Iniciante', true, '', '', '["Glúteos", "Extensão de quadril", "Colchonete", "mini band opcional"]'::jsonb, '', '', null, true),
(135, 'Pull-through na polia', 'pull-through-na-polia', 'Glúteos', '["Posteriores", "lombar"]'::jsonb, 'Academia', 'Polia baixa e corda', 'Hinge/extensão de quadril', 'Intermediário', false, '', '', '["Glúteos", "Hinge/extensão de quadril", "Polia baixa e corda"]'::jsonb, '', '', null, true),
(136, 'Adução de quadril máquina', 'aducao-de-quadril-maquina', 'Adutores e abdutores', '["Estabilizadores do quadril"]'::jsonb, 'Academia', 'Cadeira adutora', 'Adução de quadril', 'Iniciante', false, '', '', '["Adutores e abdutores", "Adução de quadril", "Cadeira adutora"]'::jsonb, '', '', null, true),
(137, 'Adução de quadril na polia', 'aducao-de-quadril-na-polia', 'Adutores e abdutores', '["Core"]'::jsonb, 'Academia', 'Polia baixa e tornozeleira', 'Adução de quadril', 'Intermediário', true, '', '', '["Adutores e abdutores", "Adução de quadril", "Polia baixa e tornozeleira"]'::jsonb, '', '', null, true),
(138, 'Adução de quadril deitado', 'aducao-de-quadril-deitado', 'Adutores e abdutores', '["Core"]'::jsonb, 'Casa', 'Colchonete', 'Adução de quadril', 'Iniciante', true, '', '', '["Adutores e abdutores", "Adução de quadril", "Colchonete"]'::jsonb, '', '', null, true),
(139, 'Copenhagen plank', 'copenhagen-plank', 'Adutores e abdutores', '["Core"]'::jsonb, 'Casa/Academia', 'Banco ou cadeira firme', 'Adução isométrica e anti-flexão lateral', 'Avançado', true, '', '', '["Adutores e abdutores", "Adução isométrica e anti-flexão lateral", "Banco ou cadeira firme"]'::jsonb, '', '', null, true),
(140, 'Abdução lateral deitado', 'abducao-lateral-deitado', 'Adutores e abdutores', '["Core"]'::jsonb, 'Casa/Academia', 'Colchonete', 'Abdução de quadril', 'Iniciante', true, '', '', '["Adutores e abdutores", "Abdução de quadril", "Colchonete"]'::jsonb, '', '', null, true),
(141, 'Clamshell', 'clamshell', 'Adutores e abdutores', '["Glúteo médio"]'::jsonb, 'Casa/Academia', 'Colchonete; mini band opcional', 'Rotação externa de quadril', 'Iniciante', true, '', '', '["Adutores e abdutores", "Rotação externa de quadril", "Colchonete", "mini band opcional"]'::jsonb, '', '', null, true),
(142, 'Panturrilha em pé máquina', 'panturrilha-em-pe-maquina', 'Panturrilhas', '["Sóleo"]'::jsonb, 'Academia', 'Máquina standing calf', 'Flexão plantar', 'Iniciante', false, '', '', '["Panturrilhas", "Flexão plantar", "Máquina standing calf"]'::jsonb, '', '', null, true),
(143, 'Panturrilha sentado máquina', 'panturrilha-sentado-maquina', 'Panturrilhas', '["Sóleo"]'::jsonb, 'Academia', 'Máquina seated calf', 'Flexão plantar', 'Iniciante', false, '', '', '["Panturrilhas", "Flexão plantar", "Máquina seated calf"]'::jsonb, '', '', null, true),
(144, 'Panturrilha no leg press', 'panturrilha-no-leg-press', 'Panturrilhas', '["Sóleo"]'::jsonb, 'Academia', 'Leg press', 'Flexão plantar', 'Iniciante', false, '', '', '["Panturrilhas", "Flexão plantar", "Leg press"]'::jsonb, '', '', null, true),
(145, 'Panturrilha no Smith', 'panturrilha-no-smith', 'Panturrilhas', '["Sóleo"]'::jsonb, 'Academia', 'Smith e step', 'Flexão plantar', 'Intermediário', false, '', '', '["Panturrilhas", "Flexão plantar", "Smith e step"]'::jsonb, '', '', null, true),
(146, 'Panturrilha unilateral em pé', 'panturrilha-unilateral-em-pe', 'Panturrilhas', '["Sóleo"]'::jsonb, 'Casa/Academia', 'Degrau; halter opcional', 'Flexão plantar unilateral', 'Iniciante', true, '', '', '["Panturrilhas", "Flexão plantar unilateral", "Degrau", "halter opcional"]'::jsonb, '', '', null, true),
(147, 'Panturrilha bilateral em degrau', 'panturrilha-bilateral-em-degrau', 'Panturrilhas', '["Sóleo"]'::jsonb, 'Casa/Academia', 'Degrau', 'Flexão plantar', 'Iniciante', false, '', '', '["Panturrilhas", "Flexão plantar", "Degrau"]'::jsonb, '', '', null, true),
(148, 'Panturrilha sentado com peso', 'panturrilha-sentado-com-peso', 'Panturrilhas', '["Sóleo"]'::jsonb, 'Casa/Academia', 'Banco e halteres/anilhas', 'Flexão plantar', 'Iniciante', false, '', '', '["Panturrilhas", "Flexão plantar", "Banco e halteres/anilhas"]'::jsonb, '', '', null, true),
(149, 'Saltos no lugar', 'saltos-no-lugar', 'Panturrilhas', '["Quadríceps", "glúteos"]'::jsonb, 'Casa/Academia', 'Nenhum', 'Flexão plantar explosiva', 'Intermediário', false, '', '', '["Panturrilhas", "Flexão plantar explosiva", "Nenhum"]'::jsonb, '', '', null, true),
(150, 'Encolhimento com barra', 'encolhimento-com-barra', 'Trapézio', '["Antebraço"]'::jsonb, 'Academia/Casa', 'Barra e anilhas', 'Elevação escapular', 'Iniciante', false, '', '', '["Trapézio", "Elevação escapular", "Barra e anilhas"]'::jsonb, '', '', null, true),
(151, 'Encolhimento com halteres', 'encolhimento-com-halteres', 'Trapézio', '["Antebraço"]'::jsonb, 'Academia/Casa', 'Halteres', 'Elevação escapular', 'Iniciante', false, '', '', '["Trapézio", "Elevação escapular", "Halteres"]'::jsonb, '', '', null, true),
(152, 'Encolhimento no Smith', 'encolhimento-no-smith', 'Trapézio', '["Antebraço"]'::jsonb, 'Academia', 'Smith', 'Elevação escapular', 'Iniciante', false, '', '', '["Trapézio", "Elevação escapular", "Smith"]'::jsonb, '', '', null, true),
(153, 'Encolhimento na máquina', 'encolhimento-na-maquina', 'Trapézio', '["Antebraço"]'::jsonb, 'Academia', 'Máquina shrug', 'Elevação escapular', 'Iniciante', false, '', '', '["Trapézio", "Elevação escapular", "Máquina shrug"]'::jsonb, '', '', null, true),
(154, 'Farmer walk', 'farmer-walk', 'Trapézio', '["Antebraço", "core", "pernas"]'::jsonb, 'Academia/Casa', 'Halteres, kettlebells ou cargas', 'Carregar', 'Intermediário', false, '', '', '["Trapézio", "Carregar", "Halteres", "kettlebells ou cargas"]'::jsonb, '', '', null, true),
(155, 'Y raise inclinado', 'y-raise-inclinado', 'Trapézio', '["Deltoide posterior", "manguito"]'::jsonb, 'Academia/Casa', 'Halteres leves e banco', 'Elevação escapular/ombro', 'Intermediário', false, '', '', '["Trapézio", "Elevação escapular/ombro", "Halteres leves e banco"]'::jsonb, '', '', null, true),
(156, 'Rosca punho com barra', 'rosca-punho-com-barra', 'Antebraços e pegada', '["Dedos"]'::jsonb, 'Academia/Casa', 'Barra ou halteres', 'Flexão de punho', 'Iniciante', false, '', '', '["Antebraços e pegada", "Flexão de punho", "Barra ou halteres"]'::jsonb, '', '', null, true),
(157, 'Rosca punho inversa', 'rosca-punho-inversa', 'Antebraços e pegada', '["Braquiorradial"]'::jsonb, 'Academia/Casa', 'Barra ou halteres', 'Extensão de punho', 'Iniciante', false, '', '', '["Antebraços e pegada", "Extensão de punho", "Barra ou halteres"]'::jsonb, '', '', null, true),
(158, 'Rosca inversa com barra', 'rosca-inversa-com-barra', 'Antebraços e pegada', '["Bíceps", "braquial"]'::jsonb, 'Academia/Casa', 'Barra reta/W', 'Flexão de cotovelo pronada', 'Intermediário', false, '', '', '["Antebraços e pegada", "Flexão de cotovelo pronada", "Barra reta/W"]'::jsonb, '', '', null, true),
(159, 'Pronação e supinação com halter', 'pronacao-e-supinacao-com-halter', 'Antebraços e pegada', '["Punho"]'::jsonb, 'Casa/Academia', 'Halter leve', 'Rotação de antebraço', 'Iniciante', true, '', '', '["Antebraços e pegada", "Rotação de antebraço", "Halter leve"]'::jsonb, '', '', null, true),
(160, 'Dead hang', 'dead-hang', 'Antebraços e pegada', '["Dorsais", "ombros"]'::jsonb, 'Casa/Academia', 'Barra fixa', 'Suspensão/pegada', 'Iniciante', false, '', '', '["Antebraços e pegada", "Suspensão/pegada", "Barra fixa"]'::jsonb, '', '', null, true),
(161, 'Pinça com anilhas', 'pinca-com-anilhas', 'Antebraços e pegada', '["Dedos"]'::jsonb, 'Academia/Casa', 'Anilhas ou objetos planos', 'Isometria de pegada', 'Intermediário', false, '', '', '["Antebraços e pegada", "Isometria de pegada", "Anilhas ou objetos planos"]'::jsonb, '', '', null, true),
(162, 'Abdominal máquina', 'abdominal-maquina', 'Core e lombar', '["Oblíquos"]'::jsonb, 'Academia', 'Máquina abdominal crunch', 'Flexão de tronco', 'Iniciante', false, '', '', '["Core e lombar", "Flexão de tronco", "Máquina abdominal crunch"]'::jsonb, '', '', null, true),
(163, 'Abdominal na polia alta', 'abdominal-na-polia-alta', 'Core e lombar', '["Oblíquos"]'::jsonb, 'Academia', 'Polia alta e corda', 'Flexão de tronco', 'Intermediário', false, '', '', '["Core e lombar", "Flexão de tronco", "Polia alta e corda"]'::jsonb, '', '', null, true),
(164, 'Elevação de pernas na cadeira romana', 'elevacao-de-pernas-na-cadeira-romana', 'Core e lombar', '["Flexores do quadril"]'::jsonb, 'Academia', 'Cadeira romana', 'Flexão de quadril e retroversão pélvica', 'Intermediário', false, '', '', '["Core e lombar", "Flexão de quadril e retroversão pélvica", "Cadeira romana"]'::jsonb, '', '', null, true),
(165, 'Elevação de joelhos suspenso', 'elevacao-de-joelhos-suspenso', 'Core e lombar', '["Antebraços"]'::jsonb, 'Casa/Academia', 'Barra fixa', 'Flexão de quadril e retroversão pélvica', 'Intermediário', false, '', '', '["Core e lombar", "Flexão de quadril e retroversão pélvica", "Barra fixa"]'::jsonb, '', '', null, true),
(166, 'Abdominal reto no solo', 'abdominal-reto-no-solo', 'Core e lombar', '["Oblíquos"]'::jsonb, 'Casa/Academia', 'Colchonete', 'Flexão de tronco', 'Iniciante', false, '', '', '["Core e lombar", "Flexão de tronco", "Colchonete"]'::jsonb, '', '', null, true),
(167, 'Crunch reverso', 'crunch-reverso', 'Core e lombar', '["Flexores do quadril"]'::jsonb, 'Casa/Academia', 'Colchonete', 'Retroversão pélvica', 'Iniciante', false, '', '', '["Core e lombar", "Retroversão pélvica", "Colchonete"]'::jsonb, '', '', null, true),
(168, 'Bicicleta no solo', 'bicicleta-no-solo', 'Core e lombar', '["Flexores do quadril"]'::jsonb, 'Casa/Academia', 'Colchonete', 'Flexão e rotação de tronco', 'Intermediário', false, '', '', '["Core e lombar", "Flexão e rotação de tronco", "Colchonete"]'::jsonb, '', '', null, true),
(169, 'Prancha frontal', 'prancha-frontal', 'Core e lombar', '["Glúteos", "ombros"]'::jsonb, 'Casa/Academia', 'Colchonete', 'Anti-extensão', 'Iniciante', false, '', '', '["Core e lombar", "Anti-extensão", "Colchonete"]'::jsonb, '', '', null, true),
(170, 'Prancha lateral', 'prancha-lateral', 'Core e lombar', '["Glúteo médio", "ombro"]'::jsonb, 'Casa/Academia', 'Colchonete', 'Anti-flexão lateral', 'Intermediário', true, '', '', '["Core e lombar", "Anti-flexão lateral", "Colchonete"]'::jsonb, '', '', null, true),
(171, 'Prancha com toque no ombro', 'prancha-com-toque-no-ombro', 'Core e lombar', '["Ombros", "glúteos"]'::jsonb, 'Casa/Academia', 'Colchonete', 'Anti-rotação', 'Intermediário', true, '', '', '["Core e lombar", "Anti-rotação", "Colchonete"]'::jsonb, '', '', null, true),
(172, 'Dead bug', 'dead-bug', 'Core e lombar', '["Flexores do quadril"]'::jsonb, 'Casa/Academia', 'Colchonete', 'Anti-extensão', 'Iniciante', true, '', '', '["Core e lombar", "Anti-extensão", "Colchonete"]'::jsonb, '', '', null, true),
(173, 'Bird dog', 'bird-dog', 'Core e lombar', '["Glúteos", "lombar"]'::jsonb, 'Casa/Academia', 'Colchonete', 'Anti-rotação e extensão', 'Iniciante', true, '', '', '["Core e lombar", "Anti-rotação e extensão", "Colchonete"]'::jsonb, '', '', null, true),
(174, 'Pallof press', 'pallof-press', 'Core e lombar', '["Glúteos", "ombros"]'::jsonb, 'Academia/Casa', 'Polia ou faixa ancorada', 'Anti-rotação', 'Intermediário', true, '', '', '["Core e lombar", "Anti-rotação", "Polia ou faixa ancorada"]'::jsonb, '', '', null, true),
(175, 'Woodchopper na polia', 'woodchopper-na-polia', 'Core e lombar', '["Ombros", "quadris"]'::jsonb, 'Academia', 'Polia e manopla', 'Rotação diagonal', 'Intermediário', true, '', '', '["Core e lombar", "Rotação diagonal", "Polia e manopla"]'::jsonb, '', '', null, true),
(176, 'Russian twist', 'russian-twist', 'Core e lombar', '["Flexores do quadril"]'::jsonb, 'Casa/Academia', 'Colchonete; peso opcional', 'Rotação de tronco', 'Intermediário', false, '', '', '["Core e lombar", "Rotação de tronco", "Colchonete", "peso opcional"]'::jsonb, '', '', null, true),
(177, 'Ab wheel rollout', 'ab-wheel-rollout', 'Core e lombar', '["Dorsais", "ombros"]'::jsonb, 'Casa/Academia', 'Roda abdominal', 'Anti-extensão', 'Avançado', false, '', '', '["Core e lombar", "Anti-extensão", "Roda abdominal"]'::jsonb, '', '', null, true),
(178, 'Hiperextensão lombar 45 graus', 'hiperextensao-lombar-45-graus', 'Core e lombar', '["Glúteos", "posteriores"]'::jsonb, 'Academia', 'Banco romano 45°', 'Extensão de quadril/coluna', 'Intermediário', false, '', '', '["Core e lombar", "Extensão de quadril/coluna", "Banco romano 45°"]'::jsonb, '', '', null, true),
(179, 'Extensão lombar no solo', 'extensao-lombar-no-solo', 'Core e lombar', '["Glúteos"]'::jsonb, 'Casa', 'Colchonete', 'Extensão de coluna', 'Iniciante', false, '', '', '["Core e lombar", "Extensão de coluna", "Colchonete"]'::jsonb, '', '', null, true),
(180, 'Burpee', 'burpee', 'Corpo inteiro/Funcional', '["Corpo inteiro"]'::jsonb, 'Casa/Academia', 'Nenhum', 'Agachar, apoiar e saltar', 'Intermediário', false, '', '', '["Corpo inteiro/Funcional", "Agachar", "apoiar e saltar", "Nenhum"]'::jsonb, '', '', null, true),
(181, 'Mountain climber', 'mountain-climber', 'Corpo inteiro/Funcional', '["Core", "ombros", "pernas"]'::jsonb, 'Casa/Academia', 'Nenhum', 'Corrida em prancha', 'Intermediário', true, '', '', '["Corpo inteiro/Funcional", "Corrida em prancha", "Nenhum"]'::jsonb, '', '', null, true),
(182, 'Thruster com halteres', 'thruster-com-halteres', 'Corpo inteiro/Funcional', '["Corpo inteiro"]'::jsonb, 'Academia/Casa', 'Halteres', 'Agachar e empurrar vertical', 'Intermediário', false, '', '', '["Corpo inteiro/Funcional", "Agachar e empurrar vertical", "Halteres"]'::jsonb, '', '', null, true),
(183, 'Clean and press com halteres', 'clean-and-press-com-halteres', 'Corpo inteiro/Funcional', '["Corpo inteiro"]'::jsonb, 'Academia/Casa', 'Halteres', 'Puxar e empurrar', 'Avançado', false, '', '', '["Corpo inteiro/Funcional", "Puxar e empurrar", "Halteres"]'::jsonb, '', '', null, true),
(184, 'Kettlebell swing', 'kettlebell-swing', 'Corpo inteiro/Funcional', '["Glúteos", "posteriores", "core"]'::jsonb, 'Academia/Casa', 'Kettlebell', 'Hinge explosivo', 'Intermediário', false, '', '', '["Corpo inteiro/Funcional", "Hinge explosivo", "Kettlebell"]'::jsonb, '', '', null, true),
(185, 'Turkish get-up', 'turkish-get-up', 'Corpo inteiro/Funcional', '["Corpo inteiro", "core"]'::jsonb, 'Academia/Casa', 'Kettlebell ou halter', 'Levantar do chão', 'Avançado', true, '', '', '["Corpo inteiro/Funcional", "Levantar do chão", "Kettlebell ou halter"]'::jsonb, '', '', null, true),
(186, 'Sled push', 'sled-push', 'Corpo inteiro/Funcional', '["Pernas", "core", "ombros"]'::jsonb, 'Academia', 'Trenó e anilhas', 'Empurrar locomotor', 'Intermediário', false, '', '', '["Corpo inteiro/Funcional", "Empurrar locomotor", "Trenó e anilhas"]'::jsonb, '', '', null, true),
(187, 'Sled pull', 'sled-pull', 'Corpo inteiro/Funcional', '["Costas", "pernas", "core"]'::jsonb, 'Academia', 'Trenó e corda/alças', 'Puxar locomotor', 'Intermediário', false, '', '', '["Corpo inteiro/Funcional", "Puxar locomotor", "Trenó e corda/alças"]'::jsonb, '', '', null, true),
(188, 'Battle rope ondas alternadas', 'battle-rope-ondas-alternadas', 'Corpo inteiro/Funcional', '["Ombros", "braços", "core"]'::jsonb, 'Academia', 'Corda naval', 'Ondulação repetida', 'Intermediário', true, '', '', '["Corpo inteiro/Funcional", "Ondulação repetida", "Corda naval"]'::jsonb, '', '', null, true),
(189, 'Box jump', 'box-jump', 'Corpo inteiro/Funcional', '["Quadríceps", "glúteos", "panturrilhas"]'::jsonb, 'Academia/Casa', 'Pliobox ou caixa segura', 'Saltar', 'Intermediário', false, '', '', '["Corpo inteiro/Funcional", "Saltar", "Pliobox ou caixa segura"]'::jsonb, '', '', null, true),
(190, 'Step-up com joelhada', 'step-up-com-joelhada', 'Corpo inteiro/Funcional', '["Glúteos", "core"]'::jsonb, 'Casa/Academia', 'Step ou degrau', 'Subir degrau', 'Intermediário', true, '', '', '["Corpo inteiro/Funcional", "Subir degrau", "Step ou degrau"]'::jsonb, '', '', null, true),
(191, 'Bear crawl', 'bear-crawl', 'Corpo inteiro/Funcional', '["Core", "ombros", "pernas"]'::jsonb, 'Casa/Academia', 'Espaço livre', 'Locomoção quadrúpede', 'Intermediário', true, '', '', '["Corpo inteiro/Funcional", "Locomoção quadrúpede", "Espaço livre"]'::jsonb, '', '', null, true),
(192, 'TRX row', 'trx-row', 'Corpo inteiro/Funcional', '["Bíceps", "core"]'::jsonb, 'Academia/Casa', 'TRX ou fita de suspensão', 'Puxar horizontal', 'Iniciante', false, '', '', '["Corpo inteiro/Funcional", "Puxar horizontal", "TRX ou fita de suspensão"]'::jsonb, '', '', null, true),
(193, 'TRX chest press', 'trx-chest-press', 'Corpo inteiro/Funcional', '["Tríceps", "core"]'::jsonb, 'Academia/Casa', 'TRX ou fita de suspensão', 'Empurrar horizontal', 'Intermediário', false, '', '', '["Corpo inteiro/Funcional", "Empurrar horizontal", "TRX ou fita de suspensão"]'::jsonb, '', '', null, true),
(194, 'TRX squat', 'trx-squat', 'Corpo inteiro/Funcional', '["Glúteos", "core"]'::jsonb, 'Academia/Casa', 'TRX ou fita de suspensão', 'Agachar', 'Iniciante', false, '', '', '["Corpo inteiro/Funcional", "Agachar", "TRX ou fita de suspensão"]'::jsonb, '', '', null, true),
(195, 'Caminhada na esteira', 'caminhada-na-esteira', 'Cardiorrespiratório', '["Membros inferiores"]'::jsonb, 'Academia/Casa', 'Esteira', 'Locomoção cíclica', 'Iniciante', false, '', '', '["Cardiorrespiratório", "Locomoção cíclica", "Esteira"]'::jsonb, '', '', null, true),
(196, 'Corrida na esteira', 'corrida-na-esteira', 'Cardiorrespiratório', '["Membros inferiores", "core"]'::jsonb, 'Academia/Casa', 'Esteira', 'Locomoção cíclica', 'Intermediário', false, '', '', '["Cardiorrespiratório", "Locomoção cíclica", "Esteira"]'::jsonb, '', '', null, true),
(197, 'Bicicleta vertical', 'bicicleta-vertical', 'Cardiorrespiratório', '["Quadríceps", "glúteos"]'::jsonb, 'Academia/Casa', 'Bicicleta ergométrica', 'Pedalar', 'Iniciante', false, '', '', '["Cardiorrespiratório", "Pedalar", "Bicicleta ergométrica"]'::jsonb, '', '', null, true),
(198, 'Bicicleta horizontal', 'bicicleta-horizontal', 'Cardiorrespiratório', '["Quadríceps", "glúteos"]'::jsonb, 'Academia', 'Bicicleta reclinada', 'Pedalar', 'Iniciante', false, '', '', '["Cardiorrespiratório", "Pedalar", "Bicicleta reclinada"]'::jsonb, '', '', null, true),
(199, 'Elíptico', 'eliptico', 'Cardiorrespiratório', '["Pernas", "braços"]'::jsonb, 'Academia', 'Elíptico', 'Locomoção cíclica', 'Iniciante', false, '', '', '["Cardiorrespiratório", "Locomoção cíclica", "Elíptico"]'::jsonb, '', '', null, true),
(200, 'Escada ergométrica', 'escada-ergometrica', 'Cardiorrespiratório', '["Glúteos", "quadríceps", "panturrilhas"]'::jsonb, 'Academia', 'Simulador de escada', 'Subir degraus', 'Intermediário', false, '', '', '["Cardiorrespiratório", "Subir degraus", "Simulador de escada"]'::jsonb, '', '', null, true),
(201, 'Remo ergométrico', 'remo-ergometrico', 'Cardiorrespiratório', '["Costas", "pernas", "braços", "core"]'::jsonb, 'Academia/Casa', 'Remo indoor', 'Puxar e estender pernas', 'Intermediário', false, '', '', '["Cardiorrespiratório", "Puxar e estender pernas", "Remo indoor"]'::jsonb, '', '', null, true),
(202, 'Air bike', 'air-bike', 'Cardiorrespiratório', '["Corpo inteiro"]'::jsonb, 'Academia', 'Bicicleta com ventilador', 'Pedalar e empurrar/puxar', 'Intermediário', false, '', '', '["Cardiorrespiratório", "Pedalar e empurrar/puxar", "Bicicleta com ventilador"]'::jsonb, '', '', null, true),
(203, 'Spinning', 'spinning', 'Cardiorrespiratório', '["Quadríceps", "glúteos"]'::jsonb, 'Academia/Casa', 'Bicicleta de spinning', 'Pedalar', 'Intermediário', false, '', '', '["Cardiorrespiratório", "Pedalar", "Bicicleta de spinning"]'::jsonb, '', '', null, true),
(204, 'Pular corda', 'pular-corda', 'Cardiorrespiratório', '["Panturrilhas", "ombros", "core"]'::jsonb, 'Casa/Academia', 'Corda', 'Saltar repetidamente', 'Intermediário', false, '', '', '["Cardiorrespiratório", "Saltar repetidamente", "Corda"]'::jsonb, '', '', null, true),
(205, 'Polichinelo', 'polichinelo', 'Cardiorrespiratório', '["Corpo inteiro"]'::jsonb, 'Casa/Academia', 'Nenhum', 'Saltar e abduzir', 'Iniciante', false, '', '', '["Cardiorrespiratório", "Saltar e abduzir", "Nenhum"]'::jsonb, '', '', null, true),
(206, 'Corrida estacionária', 'corrida-estacionaria', 'Cardiorrespiratório', '["Membros inferiores", "core"]'::jsonb, 'Casa/Academia', 'Nenhum', 'Correr no lugar', 'Iniciante', false, '', '', '["Cardiorrespiratório", "Correr no lugar", "Nenhum"]'::jsonb, '', '', null, true),
(207, 'Rotação externa de ombro com elástico', 'rotacao-externa-de-ombro-com-elastico', 'Mobilidade e estabilização', '["Manguito rotador", "deltoide posterior"]'::jsonb, 'Casa/Academia', 'Faixa elástica', 'Rotação externa', 'Iniciante', true, '', '', '["Mobilidade e estabilização", "Rotação externa", "Faixa elástica"]'::jsonb, '', '', null, true),
(208, 'Rotação interna de ombro com elástico', 'rotacao-interna-de-ombro-com-elastico', 'Mobilidade e estabilização', '["Manguito rotador"]'::jsonb, 'Casa/Academia', 'Faixa elástica', 'Rotação interna', 'Iniciante', true, '', '', '["Mobilidade e estabilização", "Rotação interna", "Faixa elástica"]'::jsonb, '', '', null, true),
(209, 'Wall slide', 'wall-slide', 'Mobilidade e estabilização', '["Serrátil", "trapézio"]'::jsonb, 'Casa/Academia', 'Parede', 'Elevação de ombro e rotação escapular', 'Iniciante', false, '', '', '["Mobilidade e estabilização", "Elevação de ombro e rotação escapular", "Parede"]'::jsonb, '', '', null, true),
(210, 'Scapular push-up', 'scapular-push-up', 'Mobilidade e estabilização', '["Serrátil", "core"]'::jsonb, 'Casa/Academia', 'Nenhum', 'Protração/retração escapular', 'Iniciante', false, '', '', '["Mobilidade e estabilização", "Protração/retração escapular", "Nenhum"]'::jsonb, '', '', null, true),
(211, 'Scapular pull-up', 'scapular-pull-up', 'Mobilidade e estabilização', '["Trapézio", "dorsais"]'::jsonb, 'Casa/Academia', 'Barra fixa', 'Depressão/retração escapular', 'Intermediário', false, '', '', '["Mobilidade e estabilização", "Depressão/retração escapular", "Barra fixa"]'::jsonb, '', '', null, true),
(212, 'Mobilidade de tornozelo na parede', 'mobilidade-de-tornozelo-na-parede', 'Mobilidade e estabilização', '["Panturrilhas"]'::jsonb, 'Casa/Academia', 'Parede', 'Dorsiflexão', 'Iniciante', true, '', '', '["Mobilidade e estabilização", "Dorsiflexão", "Parede"]'::jsonb, '', '', null, true),
(213, '90/90 de quadril', '90-90-de-quadril', 'Mobilidade e estabilização', '["Glúteos", "adutores"]'::jsonb, 'Casa/Academia', 'Colchonete', 'Rotação de quadril', 'Iniciante', true, '', '', '["Mobilidade e estabilização", "Rotação de quadril", "Colchonete"]'::jsonb, '', '', null, true),
(214, 'Alongamento dinâmico do flexor do quadril', 'alongamento-dinamico-do-flexor-do-quadril', 'Mobilidade e estabilização', '["Quadríceps", "core"]'::jsonb, 'Casa/Academia', 'Colchonete', 'Extensão de quadril', 'Iniciante', true, '', '', '["Mobilidade e estabilização", "Extensão de quadril", "Colchonete"]'::jsonb, '', '', null, true)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  primary_muscle_group = excluded.primary_muscle_group,
  secondary_muscle_groups = excluded.secondary_muscle_groups,
  environment = excluded.environment,
  equipment = excluded.equipment,
  movement_pattern = excluded.movement_pattern,
  technical_level = excluded.technical_level,
  unilateral = excluded.unilateral,
  instructions = excluded.instructions,
  substitution_tags = excluded.substitution_tags,
  is_active = true,
  updated_at = now();
