# Viva Leve Planos & Benefícios

## Situação em 06/09/2026

Implementação incremental **parcial**. A etapa de fundação está implementada e a migration
`20260906112026_premium_planos_base.sql` foi aplicada somente ao projeto oficial
`kdhdtdwayqdbkxbbpawm`. Não ativar cobrança/bloqueios antes das próximas etapas.

Disponível no código:

- `/admin/premium`: criação/edição de planos, consulta inicial do parceiro VIP e auditoria recente.
- `/api/admin/premium`: autenticação no servidor, email confirmado, papel administrativo ativo,
  validação de entrada e controle de concorrência por versão.
- Planos iniciais Dieta/Treino R$9,90 e Completo R$15,90, 30 dias, configurados no banco.
- Motor interno de concessões idempotentes, saldo por recurso e renovação sem perda de dias.
- Concessões somente via chave de serviço; cliente não altera validade nem escolhe beneficiário.
- RLS de leitura dos próprios acessos; auditoria sem permissões de exclusão/alteração pelo serviço.
- Parceiro GRUPO VIP VIVA LEVE criado pelo mesmo modelo de parceiros.

Não implementado nesta etapa:

- Checkout de assinatura e validação de valor pago no gateway; recompensa automática por compra.
- Gestão completa de regras/parceiros, CSV/XLSX, lotes, pendentes, fila e envio de email.
- Meu Plano, modal comercial e proteção integrada nas APIs/tabelas de Dieta e Treino.
- Concessões administrativas pela interface, revisão de estornos e evento periódico de expiração.
- Analytics e testes end-to-end dos vinte cenários comerciais completos.

## Segurança e compatibilidade

Todas as seis tabelas públicas novas têm RLS. As tabelas de configuração/auditoria são
exclusivas do servidor: não têm grants nem políticas para anon/authenticated. O advisor
`rls_enabled_no_policy` nessas quatro tabelas é informativo e corresponde ao bloqueio intencional.
Não criar políticas permissivas para apenas eliminar esse aviso.

As únicas funções SECURITY DEFINER novas são duas verificações booleanas em `premium_private`,
fora da API, com search_path fixo e execução exclusivamente pelo serviço. Não expõem usuários
nem ampliam os privilégios de leitura de `auth.users`.

As primitivas de concessão são internas: o próximo adaptador de pagamento deve confirmar o
pagamento no provedor antes de invocá-las. O motor, sozinho, não comprova um pagamento.
Nunca disponibilizar `premium_grant_access` como endpoint genérico que aceite source_type,
user_id, duração ou confirmação de pagamento do navegador.

`commercial_enabled`, `enforcement_enabled` e `purchase_reward_enabled` permanecem false.
Nenhuma tabela, política ou função existente de pedidos/estoque/entregas foi modificada.
Nenhuma conta real recebeu acesso na implantação da base.

Cada recurso recebe um período independente: a compra de Completo por quem já tem Dieta
estende Dieta e libera Treino imediatamente. O vencimento geral da concessão é o maior
vencimento de seus recursos; Meu Plano deverá mostrar cada saldo, sem indicar erroneamente
que todos os recursos têm esse mesmo prazo.

Uma concessão KEEP_ACTIVE sem extensão mantém sua origem no histórico, sem criar saldo
duplicado. Renovações pagas sempre estendem. Recursos contratados são preservados no snapshot.

## Próximos incrementos

1. Gestão de regras/parceiros e importação com prévia, confirmação atômica e chave de lote.
2. Benefícios pendentes por email verificado; outbox com reenvio idempotente e templates.
3. Meu Plano e telas comerciais; proteção nas APIs e RLS sem bloquear refeições gratuitas.
4. Adapter de pagamento, checkout próprio de planos, eventos e reconciliação de estornos.
5. Recompensa por compra usando valor real confirmado, não valor enviado pelo cliente.
6. Analytics com definições de origem/conversão e cobertura dos 20 cenários da especificação.
7. Homologação administrativa e ativação comercial controlada.

## Decisões e configuração necessárias

- Definir se frete conta no mínimo de R$150 e tratamento de créditos pagos/promocionais.
- Definir transição dos usuários existentes antes de ativar exigência de assinatura.
- Escolher provedor de email transacional e verificar remetente/domínio.
- Configurar chave de servidor Supabase e credenciais de gateway no ambiente local/deploy,
  somente em variáveis privadas. Não colocar valores no Git ou neste documento.
- Primeira versão proposta: renovação manual de período, sem débito recorrente automático.

O `.env.local` desta cópia tinha ausência total de configuração. Foram adicionadas somente
a URL e a chave pública oficiais e a URL pública do site. A chave privada de servidor não foi
recuperada nem criada. Sem ela, operações administrativas locais retornam erro de configuração.

## Validação reproduzível

```text
npm test
npm run test:premium
npx tsc --noEmit
npm run lint
npm run build
```

PGlite 0.5.8 é dependência de desenvolvimento fixada no lockfile. Os testes de banco usam
PostgreSQL isolado em memória, quatro contas fictícias e transações revertidas. Não executam
pagamentos, não enviam emails e não alteram clientes reais. Incluem permissões equivalentes
às do ambiente hospedado, onde service_role não pode ler auth.users diretamente.

Resultado desta etapa: 53 testes aprovados (27 novos), TypeScript e build aprovados.
Servidor local respondeu HTTP 200 em `/admin/premium`; a API exige autenticação.
Não foi homologada a edição pela interface com uma sessão administrativa real, pois falta
a chave privada de servidor neste ambiente. Testes de edição/ator/concorrência foram feitos
na API isolada e no PostgreSQL local. A implantação web no domínio depende do pipeline do Git.

A auditoria npm identificou 30 alertas no conjunto atual de dependências, incluindo 2 críticos
(Next e tar). PGlite não aparece na lista. Não foi usado `npm audit fix --force`; atualização
do framework/PWA requer uma etapa própria de compatibilidade. O lint mantém avisos existentes
sobre imagens sem Next/Image, sem novos erros no módulo.

Referências consultadas: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[funções e privilégios](https://supabase.com/docs/guides/database/functions),
[aviso RLS sem política](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
