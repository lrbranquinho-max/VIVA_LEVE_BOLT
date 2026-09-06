import { NextRequest } from 'next/server';
import MercadoPagoConfig,{Preference} from 'mercadopago';
import { premiumFailure, PremiumError, premiumResponse, premiumUser } from '@/lib/premium/server';

export const runtime='nodejs';
function publicUrl(){
  const raw=process.env.MERCADOPAGO_SITE_URL||process.env.NEXT_PUBLIC_SITE_URL||'https://www.vivalevedf.com.br';
  const url=new URL(raw); if(url.protocol!=='https:'||['localhost','127.0.0.1'].includes(url.hostname)) return 'https://www.vivalevedf.com.br';
  return url.toString().replace(/\/$/,'');
}
export async function POST(request:NextRequest){
  try{
    const {supabase,user}=await premiumUser(request);
    const accessToken=process.env.MERCADOPAGO_ACCESS_TOKEN;
    if(!accessToken||accessToken.includes('seu_access')) throw new PremiumError('Pagamento indisponível. Contate o administrador.',503);
    const raw=await request.text(); if(raw.length>2000) throw new PremiumError('Solicitação inválida.',413);
    let body:{planId?:string,idempotencyKey?:string}; try{body=JSON.parse(raw);}catch{throw new PremiumError('Solicitação inválida.',400);}
    if(!body.planId||!body.idempotencyKey) throw new PremiumError('Escolha um plano.',400);
    const key=body.idempotencyKey;
    if(!/^[0-9a-f-]{36}$/i.test(key)) throw new PremiumError('Identificador da compra inválido.',400);
    const [{data:settings,error:settingsError},{data:plan,error:planError}]=await Promise.all([
      supabase.from('premium_settings').select('commercial_enabled').single(),
      supabase.from('premium_plans').select('*').eq('id',body.planId).eq('active',true).eq('renewable',true).maybeSingle(),
    ]);
    if(settingsError||planError) throw settingsError||planError;
    if(!settings?.commercial_enabled) throw new PremiumError('As assinaturas ainda não foram liberadas.',409);
    if(!plan) throw new PremiumError('Plano indisponível.',404);
    const existing=await supabase.from('premium_checkouts').select('*').eq('idempotency_key',key).eq('user_id',user.id).maybeSingle();
    if(existing.error) throw existing.error;
    let checkout=existing.data;
    if(!checkout){
      const inserted=await supabase.from('premium_checkouts').insert({user_id:user.id,plan_id:plan.id,plan_snapshot:plan,
        amount_cents:plan.price_cents,duration_days:plan.duration_days,gateway:'MERCADO_PAGO',idempotency_key:key}).select().single();
      if(inserted.error) throw inserted.error; checkout=inserted.data;
    } else if(checkout.plan_id!==plan.id||checkout.amount_cents!==plan.price_cents) throw new PremiumError('Identificador já utilizado em outra compra.',409);
    if(checkout.gateway_preference_id) return premiumResponse({checkoutId:checkout.id,preferenceId:checkout.gateway_preference_id});
    const base=publicUrl(); const preference=new Preference(new MercadoPagoConfig({accessToken}));
    const response=await preference.create({body:{external_reference:`premium:${checkout.id}`,
      notification_url:`${base}/api/mercadopago/webhook`,auto_return:'all',back_urls:{success:`${base}/meu-plano?pagamento=sucesso`,pending:`${base}/meu-plano?pagamento=pendente`,failure:`${base}/meu-plano?pagamento=falha`},
      payer:{email:user.email},items:[{id:plan.code,title:plan.name,description:`Acesso Viva Leve por ${plan.duration_days} dias`,quantity:1,currency_id:'BRL',unit_price:plan.price_cents/100,category_id:'services'}],metadata:{premium_checkout_id:checkout.id},statement_descriptor:'VIVA LEVE'}});
    if(!response.id) throw new PremiumError('O provedor não criou a cobrança.',502);
    const updated=await supabase.from('premium_checkouts').update({gateway_preference_id:String(response.id),status:'PENDING',updated_at:new Date().toISOString()}).eq('id',checkout.id);
    if(updated.error) throw updated.error;
    return premiumResponse({checkoutId:checkout.id,preferenceId:response.id,initPoint:response.init_point,sandboxInitPoint:response.sandbox_init_point});
  }catch(error){return premiumFailure(error);}
}
