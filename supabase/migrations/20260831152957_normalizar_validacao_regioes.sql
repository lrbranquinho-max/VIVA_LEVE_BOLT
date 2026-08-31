CREATE OR REPLACE FUNCTION public.normalizar_regiao_atendimento(valor text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog
AS $$
  SELECT regexp_replace(
    translate(
      lower(btrim(valor)),
      'áàâãäéèêëíìîïóòôõöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'
    ),
    '[[:space:]]+',
    ' ',
    'g'
  )
$$;

COMMENT ON FUNCTION public.normalizar_regiao_atendimento(text)
IS 'Normaliza nomes de regiões para comparação sem diferença de acentos, caixa ou espaços.';

-- Mantém o nome exibido no cadastro alinhado à grafia utilizada no aplicativo.
UPDATE public.regioes_atendimento
SET regiao = 'Valparaíso de Goiás', atualizado_em = now()
WHERE uf = 'GO'
  AND public.normalizar_regiao_atendimento(regiao) = 'valparaiso de goias';

-- Corrige perfis existentes que usam outra grafia de uma região ativa.
UPDATE public.perfis_clientes AS perfil
SET regiao_df = regiao.regiao
FROM public.regioes_atendimento AS regiao
WHERE regiao.status = 'ativa'
  AND public.normalizar_regiao_atendimento(perfil.regiao_df)
      = public.normalizar_regiao_atendimento(regiao.regiao)
  AND perfil.regiao_df IS DISTINCT FROM regiao.regiao;

CREATE OR REPLACE FUNCTION public.canonicalizar_regiao_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  nome_canonico text;
BEGIN
  NEW.regiao_df := nullif(btrim(NEW.regiao_df), '');
  IF NEW.regiao_df IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT regiao
  INTO nome_canonico
  FROM public.regioes_atendimento
  WHERE status = 'ativa'
    AND public.normalizar_regiao_atendimento(regiao)
        = public.normalizar_regiao_atendimento(NEW.regiao_df)
  ORDER BY regiao
  LIMIT 1;

  IF nome_canonico IS NOT NULL THEN
    NEW.regiao_df := nome_canonico;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS canonicalizar_regiao_perfil_trigger ON public.perfis_clientes;
CREATE TRIGGER canonicalizar_regiao_perfil_trigger
BEFORE INSERT OR UPDATE OF regiao_df ON public.perfis_clientes
FOR EACH ROW
EXECUTE FUNCTION public.canonicalizar_regiao_perfil();

-- A função de checkout já concentra as regras de preço, estoque e planos.
-- Substituímos somente a comparação textual da região para preservar esse fluxo.
DO $migration$
DECLARE
  definicao text;
  comparacao_antiga constant text := 'lower(regiao)=lower(cli.regiao_df)';
  comparacao_nova constant text := 'public.normalizar_regiao_atendimento(regiao)=public.normalizar_regiao_atendimento(cli.regiao_df)';
BEGIN
  SELECT pg_get_functiondef('public.criar_pedido_com_planos(jsonb,text,text,uuid,uuid)'::regprocedure)
  INTO definicao;

  IF position(comparacao_antiga IN definicao) > 0 THEN
    EXECUTE replace(definicao, comparacao_antiga, comparacao_nova);
  ELSIF position(comparacao_nova IN definicao) = 0 THEN
    RAISE EXCEPTION 'Não foi possível localizar a validação de região no checkout de planos.';
  END IF;
END
$migration$;
