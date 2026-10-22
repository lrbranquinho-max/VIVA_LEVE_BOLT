# Mensuração da loja e Meta

## Diagnóstico anterior à implementação (22/10/2026)

- Não existiam `fbq`, script do Meta Pixel, eventos padrão ou Conversions API.
- `loja_acessos` guardava somente UUID da sessão e horário; UTMs, `fbclid`, first/last touch e vínculo com pedido eram perdidos.
- A criação do pedido não podia ser tratada como compra. Mercado Pago, Cielo e chave de crédito já convergiam para `pedidos.pagamento_status = approved`, que passou a ser a fonte autoritativa de `Purchase`.
- O projeto oficial é `kdhdtdwayqdbkxbbpawm` (Viva Leve App). A integração Meta existente no Marketing Manager é de Instagram/OAuth e não substitui Pixel/CAPI.
- A amostra de 30 dias consultada antes da mudança tinha 1.679 sessões, 15 pedidos-raiz online, 8 pagamentos aprovados e R$ 2.347,98 de faturamento. A diferença para contagens operacionais maiores decorre de pedidos-filho de kits e/ou janelas distintas.
- Nenhum Pixel ID ou token CAPI estava disponível no código, `.env.local`, Vault ou configuração consultada. Por isso a infraestrutura é segura e feature-gated, mas não inventa credenciais nem envia eventos reais até a configuração descrita abaixo.

## Ativação segura

O funil interno funciona sem credenciais da Meta. Para ativar Pixel/CAPI, configure o mesmo ID em dois ambientes:

- Vercel: `NEXT_PUBLIC_META_PIXEL_ID` (o ID numérico é público e não é uma credencial);
- Supabase Edge Function: `META_PIXEL_ID` e `META_CAPI_ACCESS_TOKEN`;
- opcional durante homologação: `META_TEST_EVENT_CODE`;
- Supabase Edge Function: `META_GRAPH_VERSION`, usando a versão já validada pelo Marketing Manager.

Nunca coloque `META_CAPI_ACCESS_TOKEN` no frontend, `.env.example`, banco ou Git. O Pixel e a CAPI só recebem dados após consentimento. E-mail, telefone e ID do usuário são normalizados e enviados apenas como SHA-256.

Implante `meta-conversions` com verificação JWT desativada no gateway (`supabase functions deploy meta-conversions --no-verify-jwt`), pois a função aplica autenticação própria: service role para o backend Next.js e `x-cron-secret` vindo do Vault para banco/cron.

## Fluxo e deduplicação

O navegador gera um UUID `event_id`, registra o evento interno e usa o mesmo valor em `fbq(..., { eventID })`. A Edge Function envia esse UUID como `event_id` à CAPI. Para `Purchase`, o UUID é criado pelo trigger do banco somente na primeira transição do pedido raiz online para `pagamento_status = approved`; chegar ao checkout ou criar o pedido nunca gera compra.

O vínculo `pedidos.analytics_sessao_id` preserva a sessão e os snapshots `analytics_first_touch` e `analytics_last_touch`. A fila `meta_capi_entregas` é idempotente e reprocessada a cada cinco minutos sem bloquear pagamentos.

## Consulta do funil

Use uma conexão administrativa/backend e consulte:

```sql
select *
from public.vw_funil_loja_diario
where dia >= current_date - 30
order by dia desc, faturamento desc;
```

Pedido, campanha e faturamento:

```sql
select id, valor_total, pagamento_status, analytics_sessao_id,
       analytics_first_touch, analytics_last_touch
from public.pedidos
where pedido_origem_id is null
order by criado_em desc;
```

## Validação no Meta Events Manager

1. Configure temporariamente `META_TEST_EVENT_CODE` no Supabase.
2. Abra uma URL com UTMs e `fbclid` de teste, aceite a mensuração e percorra catálogo, produto, carrinho e checkout.
3. Aprove um pagamento controlado em sandbox/homologação.
4. Confira `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout` e `Purchase` em Test Events.
5. Confirme que browser e servidor apresentam o mesmo `event_id` e aparecem deduplicados.
6. Remova `META_TEST_EVENT_CODE` depois da homologação.
