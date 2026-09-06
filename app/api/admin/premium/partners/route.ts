import {NextRequest} from 'next/server';
import {z} from 'zod';
import {PremiumError,premiumAdmin,premiumFailure,premiumResponse} from '@/lib/premium/server';
const schema=z.object({id:z.string().uuid().optional(),name:z.string().trim().min(1).max(160),logo_url:z.string().url().nullable().optional(),
  description:z.string().max(4000).default(''),responsible_name:z.string().max(160).default(''),email:z.string().email().nullable().optional(),phone:z.string().max(30).nullable().optional(),
  partner_type:z.string().trim().min(1).max(80),partnership_type:z.string().trim().min(1).max(120),plan_id:z.string().uuid(),duration_days:z.number().int().min(1).max(3660),
  active:z.boolean(),start_at:z.string().datetime(),end_at:z.string().datetime().nullable().optional(),notes:z.string().max(5000).default('')}).strict();
export async function POST(request:NextRequest){try{const {supabase,user}=await premiumAdmin(request);const raw=await request.text();if(raw.length>20000)throw new PremiumError('Cadastro muito grande.',413);
  let input;try{input=schema.parse(JSON.parse(raw));}catch{throw new PremiumError('Revise os dados do parceiro.',400);}const {id,...values}=input;
  const result=id?await supabase.from('premium_partners').update(values).eq('id',id).select().single():await supabase.from('premium_partners').insert(values).select().single();
  if(result.error)throw result.error;await supabase.from('premium_audit').insert({actor_id:user.id,action:id?'UPDATE_PARTNER':'CREATE_PARTNER',entity:'premium_partners',entity_id:result.data.id,after_state:result.data,origin:'admin_api'});
  return premiumResponse({partner:result.data});}catch(error){return premiumFailure(error);}}
