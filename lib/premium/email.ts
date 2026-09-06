import { criarSupabaseAdmin } from '@/lib/supabaseAdmin';
const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>'"]/g,char=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]!));
function render(template:string,variables:Record<string,unknown>,html=false){return template.replace(/{{([a-z_]+)}}/g,(_,key)=>html&&key!=='activation_url'?escapeHtml(variables[key]):String(variables[key]??''));}
export async function processPremiumEmailOutbox(limit=25){
  const apiKey=process.env.RESEND_API_KEY,from=process.env.PREMIUM_EMAIL_FROM;
  if(!apiKey||!from)return{configured:false,sent:0,failed:0};
  const supabase=criarSupabaseAdmin();const pending=await supabase.from('premium_email_outbox').select('*,premium_email_templates(*)').eq('status','PENDING').order('created_at').limit(limit);
  if(pending.error)throw pending.error;let sent=0,failed=0;
  for(const item of pending.data||[]){await supabase.from('premium_email_outbox').update({status:'SENDING',attempts:item.attempts+1}).eq('id',item.id).eq('status','PENDING');
    try{const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[item.recipient_email],subject:render(item.premium_email_templates.subject_template,item.variables),html:render(item.premium_email_templates.html_template,item.variables,true)})});const result=await response.json();if(!response.ok)throw new Error(`Resend HTTP ${response.status}`);await supabase.from('premium_email_outbox').update({status:'SENT',provider_message_id:result.id,sent_at:new Date().toISOString(),last_error:null}).eq('id',item.id);sent++;}
    catch(error){await supabase.from('premium_email_outbox').update({status:'FAILED',last_error:error instanceof Error?error.message.slice(0,500):'Falha no provedor'}).eq('id',item.id);failed++;}}
  return{configured:true,sent,failed};
}
