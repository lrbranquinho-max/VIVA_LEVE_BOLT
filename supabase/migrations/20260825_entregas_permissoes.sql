-- A política RLS do histórico chama este helper; o retorno expõe apenas um booleano de autorização.
grant execute on function public.pode_ver_historico_entrega(bigint) to authenticated;
