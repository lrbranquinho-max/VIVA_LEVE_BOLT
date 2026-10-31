-- Índices de cobertura para as chaves estrangeiras introduzidas pelo
-- cadastro-mestre e pelo módulo fiscal. Todos são aditivos e concorrência
-- não é necessária porque as tabelas fiscais ainda estão vazias na ativação.
create index if not exists empresa_auditoria_administrador_idx
  on public.empresa_auditoria(administrador_id);

create index if not exists fiscal_configuracoes_atualizado_por_idx
  on public.fiscal_configuracoes(atualizado_por);

create index if not exists documentos_fiscais_configuracao_idx
  on public.documentos_fiscais(configuracao_id);

create index if not exists documentos_fiscais_solicitado_por_idx
  on public.documentos_fiscais(solicitado_por);

create index if not exists fiscal_eventos_ator_idx
  on public.fiscal_eventos(ator_id);

create index if not exists fiscal_webhook_eventos_documento_idx
  on public.fiscal_webhook_eventos(documento_fiscal_id);
