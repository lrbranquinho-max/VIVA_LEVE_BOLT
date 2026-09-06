import {criarSupabaseAdmin} from '@/lib/supabaseAdmin';
export async function premiumAccessDecision(userId:string,resource:string,email?:string|null){const supabase=criarSupabaseAdmin();
  const settings=await supabase.from('premium_settings').select('enforcement_enabled').single();if(settings.error)throw settings.error;if(!settings.data.enforcement_enabled)return{allowed:true,enforced:false};
  if(email){const role=await supabase.from('admin_usuario_roles').select('role').eq('email',email.toLowerCase()).eq('ativo',true).in('role',['admin','trainer']).limit(1);if(role.error)throw role.error;if(role.data?.length)return{allowed:true,enforced:true,professional:true};}
  const now=new Date().toISOString();const periods=await supabase.from('premium_resource_periods').select('grant_id,premium_grants!inner(status)').eq('user_id',userId).eq('resource',resource).lte('start_at',now).gt('expires_at',now).in('premium_grants.status',['ACTIVE','REVIEW_REQUIRED']).limit(1);
  if(periods.error)throw periods.error;return{allowed:Boolean(periods.data?.length),enforced:true};}
