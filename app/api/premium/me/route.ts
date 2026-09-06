import { NextRequest } from 'next/server';
import { premiumFailure, premiumResponse, premiumUser } from '@/lib/premium/server';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await premiumUser(request);
    await supabase.rpc('premium_activate_pending', { p_user_id: user.id, p_email: user.email });
    const [grants, periods, checkouts, settings, plans] = await Promise.all([
      supabase.from('premium_grants').select('id,plan_id,plan_snapshot,start_at,expires_at,status,source_type,source_id,partner_id,created_at').eq('user_id',user.id).order('created_at',{ascending:false}),
      supabase.from('premium_resource_periods').select('resource,start_at,expires_at,grant_id').eq('user_id',user.id).order('expires_at',{ascending:false}),
      supabase.from('premium_checkouts').select('id,plan_id,amount_cents,status,created_at,paid_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(20),
      supabase.from('premium_settings').select('commercial_enabled,enforcement_enabled,expiry_alert_days,purchase_minimum_cents,purchase_include_shipping').single(),
      supabase.from('premium_plans').select('id,code,name,description,price_cents,duration_days,resources,highlighted,promotional_text,renewable').eq('active',true).order('display_order'),
    ]);
    for (const result of [grants,periods,checkouts,settings,plans]) if (result.error) throw result.error;
    const partnerIds=Array.from(new Set((grants.data||[]).map(g=>g.partner_id).filter(Boolean)));
    const partners=partnerIds.length ? await supabase.from('premium_partners').select('id,name').in('id',partnerIds) : {data:[],error:null};
    if (partners.error) throw partners.error;
    return premiumResponse({ grants:grants.data,periods:periods.data,checkouts:checkouts.data,settings:settings.data,plans:plans.data,partners:partners.data });
  } catch(error){ return premiumFailure(error); }
}
