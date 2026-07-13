alter table public.pedidos
  add column if not exists mercado_pago_status_detail text;

create index if not exists idx_pedidos_mercado_pago_status_detail
  on public.pedidos(mercado_pago_status_detail);
