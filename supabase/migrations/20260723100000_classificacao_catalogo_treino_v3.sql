alter table public.exercise_catalog
  add column if not exists is_compound boolean not null default false,
  add column if not exists exercise_order_priority smallint not null default 50,
  add column if not exists audience text not null default 'todos',
  add column if not exists advanced_technique_tags jsonb not null default '[]'::jsonb;

alter table public.exercise_catalog
  drop constraint if exists exercise_catalog_audience_check;
alter table public.exercise_catalog
  add constraint exercise_catalog_audience_check
  check (audience in ('todos', 'feminino', 'masculino'));

update public.exercise_catalog
set is_compound = (
  translate(lower(name), 'áàãâéêíóôõúüç', 'aaaaeeiooouuc') ~
  '(agachamento|leg press|hack squat|v squat|pendulum|afundo|passada|step-up|levantamento terra|stiff|good morning|hip thrust|supino|flexao de braco|paralela|desenvolvimento|remada|puxada|barra fixa|pull-up|chin-up|pulldown|clean|thruster|burpee|sled|kettlebell swing)'
);

update public.exercise_catalog
set exercise_order_priority = case
  when is_compound and translate(lower(name), 'áàãâéêíóôõúüç', 'aaaaeeiooouuc') ~
    '(agachamento|levantamento terra|stiff|leg press|supino|desenvolvimento|remada|puxada|barra fixa|clean|thruster)'
    then 10
  when is_compound then 20
  when translate(lower(primary_muscle_group), 'áàãâéêíóôõúüç', 'aaaaeeiooouuc') ~
    '(biceps|triceps|antebracos|panturrilhas|core|abdomen|mobilidade|cardiorrespiratorio)'
    then 70
  else 50
end;

update public.exercise_catalog
set audience = 'feminino'
where translate(lower(name), 'áàãâéêíóôõúüç', 'aaaaeeiooouuc') ~
  '(gluteo.*(polia|cabo)|quatro apoios.*(polia|cabo)|coice na polia)';

update public.exercise_catalog
set advanced_technique_tags = case
  when translate(lower(coalesce(equipment, '')), 'áàãâéêíóôõúüç', 'aaaaeeiooouuc') ~ '(maquina|polia|cabo)'
    and translate(lower(primary_muscle_group), 'áàãâéêíóôõúüç', 'aaaaeeiooouuc') !~ '(mobilidade|cardiorrespiratorio)'
    then '["drop-set","rest-pause","sst"]'::jsonb
  when translate(lower(coalesce(equipment, '')), 'áàãâéêíóôõúüç', 'aaaaeeiooouuc') ~ '(halter|barra)'
    and not is_compound
    and translate(lower(primary_muscle_group), 'áàãâéêíóôõúüç', 'aaaaeeiooouuc') !~ '(core|mobilidade|cardiorrespiratorio)'
    then '["drop-set"]'::jsonb
  else '[]'::jsonb
end;

create index if not exists idx_exercise_catalog_generation_order
  on public.exercise_catalog(audience, exercise_order_priority, primary_muscle_group)
  where is_active = true;

comment on column public.exercise_catalog.is_compound is
  'Identifica exercicios multiarticulares para ordenacao no inicio do treino.';
comment on column public.exercise_catalog.exercise_order_priority is
  'Menor valor indica maior prioridade na ordem de execucao.';
comment on column public.exercise_catalog.audience is
  'Publico recomendado pelo gerador: todos, feminino ou masculino.';
comment on column public.exercise_catalog.advanced_technique_tags is
  'Tecnicas avancadas permitidas de acordo com estabilidade e equipamento.';

update public.app_config
set valor = jsonb_set(valor, '{generation_version}', '"treino-v3"'::jsonb, true),
    atualizado_em = now()
where chave = 'training_settings';
