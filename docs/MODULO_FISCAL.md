# Módulo Fiscal

O módulo fiscal é desacoplado do checkout e usa o cadastro-mestre da empresa como fonte de CNPJ, razão social, inscrições, endereço, município, UF e regime tributário. A integração inicial usa o provedor DotCompany por uma interface `FiscalProvider`, permitindo substituir o provedor sem alterar pedidos ou pagamentos.

## Estado seguro inicial

- A migration cria a configuração em `disabled` e no ambiente `homologacao`.
- Nenhum pedido histórico gera documento durante a migration.
- Somente a transição de pagamento para `approved` pode enfileirar emissão automática, e apenas quando o modo `automatic` estiver explicitamente ativo.
- Falhas fiscais nunca desfazem nem bloqueiam a confirmação do pagamento.
- Um pedido pode ter no máximo um documento de cada tipo (`nfe` ou `nfce`).

## Segredos

Os valores nunca são gravados no banco, frontend ou Git. Devem existir somente como Secrets das Edge Functions:

- `DOTCOMPANY_API_TOKEN`: token `dc_test_...` para homologação ou `dc_live_...` para produção.
- `DOTCOMPANY_WEBHOOK_SECRET`: segredo usado para validar `X-Webhook-Signature-256`.

A tabela armazena somente os nomes desses secrets. O webhook valida HMAC SHA-256, timestamp e janela antirreplay.

## Fluxo

1. O pagamento é confirmado pelo backend existente.
2. O banco cria um registro idempotente em `documentos_fiscais` quando o modo automático está ativo, ou o administrador solicita manualmente.
3. A Edge Function `fiscal-dispatch` valida cadastro-mestre, destinatário e tributação dos itens.
4. A emissão é enviada server-side com `Idempotency-Key`.
5. XML e DANFE ficam no bucket privado `documentos-fiscais`; o admin recebe apenas URLs assinadas e temporárias.
6. Erros transitórios (408, 429 e 5xx) usam retry exponencial limitado. Erros de validação não são repetidos indefinidamente.

## Preparação para homologação

Antes de ativar:

1. Validar com a contabilidade os NCM, CEST, CFOP, CST/CSOSN, origem, unidade e alíquota de cada produto.
2. Completar o cadastro-mestre, inclusive código IBGE do município.
3. Cadastrar os secrets e o emitente no provedor.
4. Publicar a Edge Function com verificação JWT desativada somente porque ela implementa autenticação própria para cron/service-role e assinatura HMAC no webhook.
5. Configurar no provedor o webhook `https://<project-ref>.supabase.co/functions/v1/fiscal-dispatch?webhook=dotcompany`.
6. Manter `homologacao`, executar emissões simuladas e conferir os resultados no admin.
7. Somente após validação contábil, trocar token/ambiente e confirmar a ativação de produção na tela administrativa.

## Referências oficiais do provedor

- Quickstart: https://app.dotcompany.com.br/auth/demo/supermercado/developer/quickstart
- API: https://dotcompany.com.br/api
- Webhooks: https://app.dotcompany.com.br/auth/demo/supermercado/api-dev/webhooks
