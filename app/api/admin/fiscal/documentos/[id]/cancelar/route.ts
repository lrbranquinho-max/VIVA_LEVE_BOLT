import { NextRequest, NextResponse } from 'next/server';
import { FiscalApiError, requireFiscalAdmin } from '@/lib/fiscal/adminAuth';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function POST(request:NextRequest,{params}:{params:{id:string}}){try{const {supabase,user}=await requireFiscalAdmin(request);const body=await request.json().catch(()=>({}));const justification=String(body.justificativa||'').trim();if(justification.length<15||justification.length>255)throw new FiscalApiError('A justificativa deve ter entre 15 e 255 caracteres.',400);
  await supabase.from('fiscal_eventos').insert({documento_fiscal_id:params.id,evento:'cancel_requested',ator_id:user.id,detalhes:{justificativa:justification}});
  const {data,error}=await supabase.functions.invoke('fiscal-dispatch',{body:{action:'cancel',document_id:params.id,justification}});if(error)throw error;return NextResponse.json(data);
}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Falha ao cancelar.'},{status:error instanceof FiscalApiError?error.status:500})}}
