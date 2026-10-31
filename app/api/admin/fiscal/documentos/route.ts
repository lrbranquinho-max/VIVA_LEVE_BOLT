import { NextRequest, NextResponse } from 'next/server';
import { FiscalApiError, requireFiscalAdmin } from '@/lib/fiscal/adminAuth';
import { fiscalReadiness } from '@/lib/fiscal/validation';

export const runtime='nodejs'; export const dynamic='force-dynamic';
const fail=(error:unknown)=>NextResponse.json({error:error instanceof Error?error.message:'Falha fiscal.'},{status:error instanceof FiscalApiError?error.status:500});

export async function GET(request:NextRequest){
  try { const {supabase}=await requireFiscalAdmin(request); const pedidoId=request.nextUrl.searchParams.get('pedido_id');
    let query=supabase.from('documentos_fiscais').select('id,pedido_id,tipo_documento,ambiente,status,numero,serie,chave_acesso,protocolo,valor_total,codigo_erro,mensagem_erro,tentativas,xml_storage_path,danfe_storage_path,solicitado_em,autorizado_em,cancelado_em,atualizado_em').order('solicitado_em',{ascending:false}).limit(100);
    if(pedidoId) query=query.eq('pedido_id',Number(pedidoId));
    const [{data,error},{data:config,error:configError}]=await Promise.all([query,supabase.from('fiscal_configuracoes').select('modo,tipo_documento_padrao,ambiente,ativo').maybeSingle()]); if(error)throw error;if(configError)throw configError;
    const withLinks=await Promise.all((data||[]).map(async doc=>{ const paths=[doc.xml_storage_path,doc.danfe_storage_path].filter(Boolean) as string[]; if(!paths.length)return doc;
      const signed=await Promise.all(paths.map(path=>supabase.storage.from('documentos-fiscais').createSignedUrl(path,300)));
      return {...doc,xml_url:doc.xml_storage_path?signed[paths.indexOf(doc.xml_storage_path)].data?.signedUrl:null,danfe_url:doc.danfe_storage_path?signed[paths.indexOf(doc.danfe_storage_path)].data?.signedUrl:null}; }));
    return NextResponse.json({documentos:withLinks,configuracao:config},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return fail(error)}
}

export async function POST(request:NextRequest){
  try { const {supabase,user}=await requireFiscalAdmin(request); const body=await request.json().catch(()=>({})); const pedidoId=Number(body.pedido_id);
    if(!Number.isInteger(pedidoId)||pedidoId<=0)throw new FiscalApiError('Pedido inválido.',400);
    let type:'nfe'|'nfce';
    if(body.tipo_documento==='nfe'||body.tipo_documento==='nfce')type=body.tipo_documento;
    else { const {data:config,error:configError}=await supabase.from('fiscal_configuracoes').select('tipo_documento_padrao').maybeSingle(); if(configError)throw configError; type=config?.tipo_documento_padrao==='nfe'?'nfe':'nfce'; }
    const {data:id,error:rpcError}=await supabase.rpc('criar_documento_fiscal_manual',{p_pedido_id:pedidoId,p_tipo_documento:type,p_administrador_id:user.id}); if(rpcError)throw new FiscalApiError(rpcError.message,409);
    const {data:doc,error}=await supabase.from('documentos_fiscais').select('id,status,payload_snapshot,tipo_documento').eq('id',id).single(); if(error)throw error;
    const missing=fiscalReadiness(doc.payload_snapshot,type); if(missing.length){ await supabase.from('documentos_fiscais').update({status:'error',codigo_erro:'FISCAL_DATA_INCOMPLETE',mensagem_erro:`Dados fiscais pendentes: ${missing.join(', ')}`}).eq('id',id); return NextResponse.json({documento_id:id,status:'error',pendencias:missing},{status:422}); }
    if(doc.status==='error')await supabase.from('fiscal_eventos').insert({documento_fiscal_id:id,evento:'retry_requested',ator_id:user.id,detalhes:{origem:'admin'}});
    const {data:dispatch,error:dispatchError}=await supabase.functions.invoke('fiscal-dispatch',{body:{action:'process',document_id:id}});
    if(dispatchError)return NextResponse.json({documento_id:id,status:'pending',aviso:`Documento enfileirado. O processamento imediato não pôde ser concluído: ${dispatchError.message}`},{status:202});
    return NextResponse.json({documento_id:id,processamento:dispatch},{status:202});
  }catch(error){return fail(error)}
}
