-- Índices dos relacionamentos opcionais sinalizados pelo advisor do Supabase.
create index if not exists financeiro_lancamentos_centro_custo_idx
  on public.financeiro_lancamentos (centro_custo_id);
create index if not exists financeiro_lancamentos_criado_por_idx
  on public.financeiro_lancamentos (criado_por);
create index if not exists financeiro_lancamentos_insumo_idx
  on public.financeiro_lancamentos (insumo_id) where insumo_id is not null;
create index if not exists financeiro_parcelas_pago_por_idx
  on public.financeiro_parcelas (pago_por) where pago_por is not null;
