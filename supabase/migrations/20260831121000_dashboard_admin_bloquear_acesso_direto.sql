create policy "Telemetria sem acesso direto"
  on public.loja_acessos
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
