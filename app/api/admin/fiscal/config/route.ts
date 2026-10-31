import { NextRequest, NextResponse } from 'next/server';
import { fiscalConfigSchema } from '@/lib/fiscal/config';
import { FiscalApiError, requireFiscalAdmin } from '@/lib/fiscal/adminAuth';

export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
const replyError = (error: unknown) => NextResponse.json({ error: error instanceof Error ? error.message : 'Falha na configuração fiscal.' }, { status: error instanceof FiscalApiError ? error.status : 500 });

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireFiscalAdmin(request);
    const { data, error } = await supabase.from('fiscal_configuracoes').select('id,empresa_id,modo,provedor,ambiente,tipo_documento_padrao,serie_nfe,serie_nfce,provider_emitter_ref,api_token_secret_name,webhook_secret_name,max_tentativas,ativo,atualizado_em,empresas(nome_fantasia,cnpj,razao_social,inscricao_estadual,regime_tributario,codigo_municipio_ibge)').maybeSingle();
    if (error) throw error; if (!data) throw new FiscalApiError('Configuração fiscal não encontrada. Aplique a migration do módulo.', 404);
    const [{ count: documentos }, { count: autorizados }, { count: erros }] = await Promise.all([
      supabase.from('documentos_fiscais').select('id', { count:'exact', head:true }),
      supabase.from('documentos_fiscais').select('id', { count:'exact', head:true }).eq('status','authorized'),
      supabase.from('documentos_fiscais').select('id', { count:'exact', head:true }).in('status',['error','rejected']),
    ]);
    return NextResponse.json({ configuracao:data, resumo:{ documentos:documentos||0, autorizados:autorizados||0, erros:erros||0 },
      seguranca:{ tokenNoFrontend:false, secretsEsperados:[data.api_token_secret_name,data.webhook_secret_name], segredoPersistidoNaTabela:false } }, { headers:{'Cache-Control':'no-store'} });
  } catch (error) { return replyError(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await requireFiscalAdmin(request);
    const parsed = fiscalConfigSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new FiscalApiError(parsed.error.issues[0]?.message || 'Configuração inválida.', 400);
    const { confirmacao_risco: _, ...update } = parsed.data;
    const { data: current, error: currentError } = await supabase.from('fiscal_configuracoes').select('*').maybeSingle();
    if (currentError) throw currentError; if (!current) throw new FiscalApiError('Configuração fiscal não encontrada.',404);
    const changes = Object.entries(update).filter(([key,value]) => JSON.stringify(current[key]) !== JSON.stringify(value));
    if (!changes.length) return NextResponse.json({ configuracao:current, alteracoes:0 });
    const { data, error } = await supabase.from('fiscal_configuracoes').update({ ...update, atualizado_por:user.id, atualizado_em:new Date().toISOString() }).eq('id',current.id).select('*').single();
    if (error) throw error;
    await supabase.from('empresa_auditoria').insert(changes.map(([field,value]) => ({ empresa_id:current.empresa_id,administrador_id:user.id,campo:`fiscal.${field}`,valor_anterior:current[field] ?? null,valor_novo:value ?? null })));
    return NextResponse.json({ configuracao:data, alteracoes:changes.length });
  } catch (error) { return replyError(error); }
}
