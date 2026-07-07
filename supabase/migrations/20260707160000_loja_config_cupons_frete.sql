insert into public.app_config (chave, valor)
values (
  'loja_config',
  '{
    "cupom_boas_vindas_percentual": 30,
    "taxa_entrega_padrao": 10,
    "cupom_dia_d_percentual": 0,
    "cupom_dia_d_ativo": false
  }'::jsonb
)
on conflict (chave) do update
set valor = excluded.valor || public.app_config.valor;

drop policy if exists "Usuarios autenticados leem configuracoes" on public.app_config;
drop policy if exists "Publico le configuracoes" on public.app_config;

create policy "Publico le configuracoes"
on public.app_config for select to anon, authenticated
using (true);
