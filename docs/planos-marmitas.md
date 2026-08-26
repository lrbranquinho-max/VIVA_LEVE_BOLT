# Kits e planos de marmitas

## Operacao

- Admin > Cardapio/Estoque: tipo KIT / PLANO. Configure preco, imagem, quantidade, entregas, intervalo (multiplos de 7 dias), sabores e voucher.
- Os modelos Quinzenal (14 / 2 / 7) e Mensal (24 / 4 / 6) foram criados INATIVOS e sem preco comercial. Defina preco/imagem antes de ativar.
- Marque as marmitas avulsas com `Disponivel para Kits/Planos`. Apenas Marmitas ativas e elegiveis sao oferecidas. Estoque zero nao exclui sabores de demanda futura.
- Admin > Planos / Kits vendidos (`/admin/planos`): dias disponiveis, antecedencia, bandeiras, consultas, preparo, reprogramacao, cancelamento, pagamento presencial e acesso as entregas.
- Cliente: produto > sabores e primeira data > sacola > pagamento. Perfil > Meus Planos (`/meus-planos`).
- A inauguracao continua bloqueando novas compras ate 01/09/2026 em Brasilia.
- Voucher presencial exige sacola composta somente de kits habilitados, sem chave de credito. As demais formas de pagamento seguem os controles existentes.

## Modelagem

`produtos` recebe `tipo_produto`, `disponivel_kit`, `plano_config` (JSONB).

`planos_marmitas` guarda contrato, cliente, produto, pedido principal, configuracao/sabores congelados na compra, quantidade, dia da semana e status. Nao e carteira financeira.

`pedidos` continua sendo a base financeira e logistica. Um pedido principal cobra toda a compra. Cada contrato cria pedidos-filhos com valor zero e pagamento `vinculado`. Campos novos: `plano_id`, `pedido_origem_id`, `entrega_numero`, `entrega_prevista`, `plano_estoque_baixado`, `somente_planos`, `voucher_bandeira`, `checkout_idempotencia`.

`planos_marmitas_historico` registra contratacao, mudancas logisticas, reprogramacoes, cancelamentos e tentativas/confirmacoes de voucher. A auditoria e o codigo do modulo de entregas continuam existentes.

`planos_marmitas_resumo` e uma view com `security_invoker=true`: quantidade entregue, saldo, proxima entrega e financeiro do pedido principal, respeitando RLS.

`app_config`, chave `planos_config`: dias 1 a 6 (segunda a sabado), antecedencia em dias e bandeiras Alelo/VR/Ticket/Pluxee individualmente configuraveis.

## Regras

- Distribuicao inicial: divisao inteira por numero de sabores; o resto acrescenta uma unidade aos primeiros. Diferenca maxima de uma unidade. Ajuste manual pode ser desigual, mas exige total exato e cada sabor com pelo menos uma unidade.
- O servidor relê produtos/precos/configuracao, valida min/max, elegibilidade, duplicidade, quantidade inteira, data e forma de pagamento. Nome/preco enviados pelo navegador nao definem o valor cobrado.
- Datas: primeira data autorizada em Brasilia; seguintes avancam pelo intervalo configurado (padrao 7 dias). Uma reprogramacao nao altera as outras datas.
- Sabores do contrato sao distribuidos entre entregas por rodizio, preservando exatamente as quantidades compradas. Nao ha nova escolha semanal nesta fase.
- Saldo = total contratado menos quantidades de pedidos-filhos Entregues. Confirmacao repetida e reabertura de entrega encerrada sao bloqueadas. Saldo zero conclui o plano.
- Estoque: nao baixa na venda do kit. Baixa uma unica vez ao entrar em preparo/pronta/rota de cada entrega. Avulsos em sacola mista continuam baixando no pagamento. Compra isenta de valor baixa apenas avulsos, atomicamente.
- Idempotencia evita duplicacao do contrato ao repetir o mesmo envio. Produtos ja usados em pedidos nao podem mudar de avulso para kit ou vice-versa.
- RLS permite ao cliente ler apenas os proprios contratos. Escritas criticas sao RPCs com autenticacao/autorizacao. Entregadores usam a projecao restrita do modulo existente.

## Pagamento e entregador

Pix/Mercado Pago/Cielo reutilizam as APIs e webhooks existentes, cobrando somente o pedido principal. As rotas bloqueiam pagamento separado de entrega, pedido ja pago/cancelado e plano cancelado. As confirmacoes de gateway continuam reconciliando eventos tardios (inclusive estornos); nunca se deve ignorar um evento real so porque houve cancelamento operacional.

Voucher presencial nao chama API de adquirente: o pagamento acontece na maquininha. A primeira entrega pode preparar/sair pendente. Admin ou entregador atribuido em rota registra aprovacao/recusa e referencia do comprovante. O valor exibido e o TOTAL do pedido, nao uma parcela semanal. Recusa preserva pendencia e auditoria. Aprovacao grava pagamento no pedido principal, ativa os planos e libera as demais entregas. Uma entrega nao pode ser confirmada recebida com pagamento pendente.

Troca para pagamento online usa `preparar_pagamento_plano`, restrita ao servidor, antes de abrir o gateway; bloqueia posterior confirmacao presencial concorrente. Se a abertura do gateway falhar, o cliente pode tentar novamente pelo aplicativo.

Financeiro reutiliza `pedidos.pagamento_status`/`pago_em`: nenhuma receita duplicada para os filhos, que tem valor zero. Saldo de marmitas nunca gera credito financeiro. Cancelamento nao executa estorno automaticamente; a conciliacao/reembolso exige analise administrativa.

## Endpoints / RPCs

Rotas alteradas: `/api/mercadopago/preference`, `/api/mercadopago/pix`, `/api/cielo/voucher` (tambem usada pelo fluxo `/api/cielo/payment`). Sem novo gateway.

RPCs novas: `criar_pedido_com_planos`, `gerenciar_plano_marmitas`, `registrar_voucher_plano`, `preparar_pagamento_plano`.

Funcoes existentes adaptadas: `aplicar_credito_pedido`, `processar_pagamento_pedido_mp`, `processar_pagamento_pedido_cielo`, `iniciar_entrega_pedido`, `listar_minhas_entregas`, validacao de estoque e triggers de pedidos. Codigo/confirmacao de entrega existentes sao reutilizados.

## Arquivos

- Novos: `lib/planosMarmitas.ts`, `components/PlanoKitSelector.tsx`, `components/PlanosMarmitasPainel.tsx`, `components/VoucherPlanoPagamento.tsx`, `components/admin/PlanosConfiguracao.tsx`, `app/admin/planos/page.tsx`, `app/meus-planos/page.tsx`.
- Integracao: `app/admin/page.tsx`, `app/admin/entregas/page.tsx`, `app/entregas/page.tsx`, `app/page.tsx`, `app/produto/[id]/page.tsx`, `app/pedidos/page.tsx`, `app/perfil/page.tsx`.
- Pagamentos: rotas acima, `lib/orderStock.ts`, `lib/meiosPagamento.ts`, `lib/mercadoPagoPedidos.ts`.
- Exclusao de kits da busca nutricional: `app/dieta/page.tsx`, `app/dieta/plano-nutri/page.tsx`, `app/api/gerar-plano-nutri/route.ts`.
- Testes: `tests/planos-marmitas.test.cjs`, `tests/planos-marmitas.sql`, `scripts/test-planos-browser.cjs`.
- Migrations: `20260826120000_planos_marmitas.sql`, `20260826123000_planos_checkout_correcoes.sql`, `20260826124000_planos_estoque_correcoes.sql`, `20260826125000_planos_distribuicao_correcoes.sql`, `20260826130000_planos_seguranca_pagamento.sql`, `20260826131000_planos_reconciliar_pagamento.sql`, `20260826132000_planos_integridade_checkout.sql`.
- A entrega inclui tambem o trabalho anterior pendente de Usuarios e Perfis: `/admin/usuarios`, `/api/admin/usuarios`, `lib/usuariosAdmin.ts`, migration `20260826100000_gestao_central_usuarios.sql`, redirecionamentos de login/treinador/entregas e testes correspondentes.

## Validacao e limites

- 24 testes automatizados unitarios/API isolada (10 de kits, 14 de usuarios) aprovados.
- SQL integrado aprovado: 14/24, limites de sabores, total, elegibilidade, domingo, preco autoritativo, idempotencia, RLS, voucher aprovado/recusado, codigo incorreto/correto/reutilizado, estoque por etapa, saldo/conclusao, reprogramacao independente, pagamento online simulado na RPC e pedido misto isento.
- SQL usa contas ficticias e subtransacao com rollback obrigatorio. Nao executar testes como migrations nem remover a protecao de rollback. Preferir projeto de homologacao para novas verificacoes.
- UI Playwright isolada em Chrome 390px e 1440px: selecao, limites, distribuicao, edicao, data, CTA, ausencia de overflow e erros de pagina. Nenhuma compra real e feita por esse teste.
- TypeScript/build aprovados; lint sem erros, com avisos de imagens `<img>` existentes e do seletor. Build tambem informa aviso existente de dependencia dinamica no SDK de IA.
- Pagamento real Pix/cartao, terminal de voucher e aplicativo Android fisico nao foram homologados nesta execucao. UI autenticada de admin/entregador deve receber homologacao operacional antes de ativar os produtos.

O advisor do Supabase continua sinalizando funcoes preexistentes com [search_path mutavel](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) e [protecao contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Tambem sinaliza as [RPCs SECURITY DEFINER acessiveis a autenticados](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable): as novas RPCs publicas verificam usuario, papel e vinculo; as de pagamento interno sao restritas ao servidor. Os alertas anteriores nao foram alterados fora do escopo.

## Segunda fase

- Relatorio de demanda por sabor/data usando itens das entregas pendentes, sem movimentar estoque duas vezes.
- Retomada/substituicao de entrega cancelada: atualmente cancelar uma entrega suspende o plano e preserva saldo/historico. Nao ha retomada automatica.
- Troca de sabores com prazo, notificacoes de janela/rota, conciliacao da maquininha, reembolso proporcional e politica de estoque para cancelamento apos preparo.
- Mais de uma configuracao do mesmo produto na sacola: nesta versao, ha uma selecao por produto; quantidade maior replica essa selecao.
- Ambiente Supabase separado para homologacao e testes autenticados completos de pagamento/logistica antes de cada liberacao.
