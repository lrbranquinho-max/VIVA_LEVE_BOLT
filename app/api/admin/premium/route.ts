import { NextRequest } from 'next/server';
import { planSchema } from '@/lib/premium/domain';
import { PremiumError, premiumAdmin, premiumFailure, premiumResponse } from '@/lib/premium/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await premiumAdmin(request);
    const [plans, settings, partners, audit] = await Promise.all([
      supabase.from('premium_plans').select('*').order('display_order').order('name'),
      supabase.from('premium_settings').select('*').single(),
      supabase.from('premium_partners').select('*').order('name'),
      supabase.from('premium_audit').select('id,action,entity,entity_id,actor_id,origin,created_at').order('created_at', { ascending: false }).limit(100),
    ]);
    for (const result of [plans, settings, partners, audit]) if (result.error) throw result.error;
    return premiumResponse({ plans: plans.data, settings: settings.data, partners: partners.data, audit: audit.data });
  } catch (error) { return premiumFailure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await premiumAdmin(request);
    const raw = await request.text();
    if (raw.length > 16000) throw new PremiumError('Cadastro excede o tamanho permitido.', 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new PremiumError('Cadastro inválido.', 400); }
    const parsed = planSchema.safeParse(body);
    if (!parsed.success) throw new PremiumError('Revise os campos do plano: valores, duração e recursos.', 400);
    const { data, error } = await supabase.rpc('premium_admin_save_plan', { p_actor_id: user.id, p_data: parsed.data });
    if (error) {
      if (error.code === '23505') throw new PremiumError('Já existe um plano com esse código.', 409);
      if (error.message?.includes('Configuration changed')) throw new PremiumError('Este plano foi alterado. Recarregue antes de salvar.', 409);
      throw error;
    }
    return premiumResponse({ id: data });
  } catch (error) { return premiumFailure(error); }
}
