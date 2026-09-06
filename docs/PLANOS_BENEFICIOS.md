# Viva Leve Planos & Benefícios

## Situação em 06/09/2026

Implementação incremental **parcial**. As migrations de fundação, configuração comercial e
operações foram aplicadas somente ao projeto oficial `kdhdtdwayqdbkxbbpawm`. A migration
operacional registrada no banco é `20260906215923_premium_operacoes.sql`. Cobrança,
bloqueios e recompensas ainda não estão ativados.

Disponível no código:

- `/admin/premium`: criação/edição de planos, consulta inicial do parceiro VIP e auditoria recente.
- `/api/admin/premium`: autenticação no servidor, email confirmado, papel administrativo ativo,
  validação de entrada e controle de concorrência por versão.
- Planos iniciais Dieta/Treino R$9,90 e Completo R$15,90, 30 dias, configurados no banco.
- Motor interno de concessões idempotentes, saldo por recurso e renovação sem perda de dias.
- Concessões somente via chave de serviço; cliente não altera validade nem escolhe beneficiário.
- RLS de leitura dos próprios acessos; auditoria sem permissões de exclusão/alteração pelo serviço.
- Parceiro GRUPO VIP VIVA LEVE criado pelo mesmo modelo de parceiros.

Implementado no código e no banco oficial (migration `20260906215923_premium_operacoes.sql`):

- Meu Plano, checkout Mercado Pago com preço do banco e confirmação server-side do valor.
- Recompensa automática de pedidos Mercado Pago aprovados, usando o total realmente pago no
  gateway (que já inclui o frete) e uma concessão idempotente por pedido.
- Parceiros, importação CSV/XLSX com prévia, lote histórico, duplicados, inválidos, usuários
  existentes e benefícios pendentes. Benefícios ativos são estendidos na confirmação do lote.
- Ativação do pendente no primeiro acesso com o mesmo email verificado.
- Templates, outbox e envio transacional via Resend; sem senha gerada ou enviada.
- Proteção no backend da geração de Dieta e Treino, controlada por `enforcement_enabled`.
- Analytics administrativos com dados reais de assinaturas, receita, origens e parceiros.
- Estorno/chargeback sinaliza `REVIEW_REQUIRED` sem apagar dias automaticamente.
- Ativação comercial explícita e auditada, com 30 dias de Completo aos usuários existentes.

Ainda depende de implantação/configuração:

- Configurar `SUPABASE_SERVICE_ROLE_KEY`, `MERCADOPAGO_ACCESS_TOKEN`, `RESEND_API_KEY` e
  `PREMIUM_EMAIL_FROM` no deploy. Sem Resend, convites ficam na outbox, não são perdidos.
- Executar a ativação comercial somente depois de um pagamento sandbox aprovado e um email
  transacional entregue. O endpoint exige a frase `ATIVAR PLANOS E TRANSICAO`.
- A recompensa de compras está integrada ao Mercado Pago; meios Cielo/voucher precisam chamar
  o mesmo motor após confirmação efetiva se também forem elegíveis comercialmente.

## Segurança e compatibilidade

Todas as tabelas públicas novas têm RLS. As tabelas de configuração/auditoria e operação
exclusiva do servidor são
exclusivas do servidor: não têm grants nem políticas para anon/authenticated. O advisor
`rls_enabled_no_policy` nessas tabelas é informativo e corresponde ao bloqueio intencional.
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
Nenhuma conta real recebeu acesso na implantação das migrations; a auditoria pós-aplicação
confirmou zero concessões, checkouts, pagamentos, importações e benefícios pendentes.

Cada recurso recebe um período independente: a compra de Completo por quem já tem Dieta
estende Dieta e libera Treino imediatamente. O vencimento geral da concessão é o maior
vencimento de seus recursos; Meu Plano deverá mostrar cada saldo, sem indicar erroneamente
que todos os recursos têm esse mesmo prazo.

Uma concessão KEEP_ACTIVE sem extensão mantém sua origem no histórico, sem criar saldo
duplicado. Renovações pagas sempre estendem. Recursos contratados são preservados no snapshot.

## Próximos incrementos

1. Configurar os quatro segredos privados no ambiente de produção.
2. Homologar checkout, webhook, email e uma importação pequena de parceiro.
3. Ativar comercialmente e conferir o relatório da concessão de transição.
4. Acompanhar pagamentos, outbox, pendências e auditoria nas primeiras 24 horas.

## Decisões e configuração necessárias

- Confirmado pelo administrador em 06/09/2026: frete efetivamente pago conta no mínimo de
  R$150. Exemplo: R$140 de produtos + R$10 de frete pagos qualificam. Quando o total do
  provedor já inclui o frete, não somá-lo novamente. Créditos/estornos ainda precisam ser
  conciliados pelo adaptador antes de conceder.
- Confirmado: usuários atuais recebem 30 dias de transição do Plano Completo. A configuração
  está preparada, mas o prazo começa na ativação comercial, não durante o desenvolvimento.
  `transition_starts_at` permanece nulo. A rotina de concessão em lote está implementada com
  elegibilidade validada, idempotência por usuário e preservação de saldos existentes, mas só
  roda mediante ativação administrativa explícita.
- Verificar o remetente/domínio no Resend.
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

Resultado local atual: 62 testes aprovados, TypeScript, lint e build aprovados. As páginas
`/meu-plano`, `/admin/premium`, `/admin/premium/importar`, `/admin/premium/parceiros` e
`/admin/premium/analytics` responderam HTTP 200 no servidor de produção local; a API de usuário
sem sessão respondeu 401. No Supabase oficial, todas as oito tabelas operacionais existem com
RLS; as funções sensíveis são executáveis somente por `service_role`; há um template de email
ativo e zero concessões, checkouts, pagamentos, importações ou benefícios pendentes.
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
