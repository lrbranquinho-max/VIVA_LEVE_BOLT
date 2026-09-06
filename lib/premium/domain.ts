import { z } from 'zod';

export const resourceNames = {
  'diet.generate': 'Geração de plano alimentar',
  'diet.advanced': 'Recursos avançados de Dieta',
  'training.access': 'Treino personalizado',
} as const;
export type PremiumResource = keyof typeof resourceNames;
export const planSchema = z.object({
  id: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
  code: z.string().regex(/^[a-z][a-z0-9_]{1,49}$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(4000),
  price_cents: z.number().int().min(0).max(2147483647),
  duration_days: z.number().int().min(1).max(3660),
  resources: z.array(z.enum(['diet.generate', 'diet.advanced', 'training.access'])).min(1).max(3)
    .refine(values => new Set(values).size === values.length, 'Recursos duplicados.'),
  active: z.boolean(), highlighted: z.boolean(), renewable: z.boolean(),
  display_order: z.number().int().min(0).max(10000),
  promotional_text: z.string().max(1000),
}).strict().refine(value => !value.id || Boolean(value.version), 'Versão do cadastro ausente.');
export type PremiumPlan = z.infer<typeof planSchema>;

export function remainingDays(expiresAt: string, now = new Date()): number {
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(expires) || !Number.isFinite(now.getTime())) return 0;
  return Math.max(0, Math.ceil((expires - now.getTime()) / 86400000));
}

export function expiryAlert(expiresAt: string, alertDays: number, now = new Date()): boolean {
  const delta = Date.parse(expiresAt) - now.getTime();
  return Number.isFinite(delta) && Number.isInteger(alertDays) && alertDays >= 0
    && delta > 0 && delta <= alertDays * 86400000;
}

export function periodIsActive(period: { start_at: string; expires_at: string; status: string }, now = new Date()): boolean {
  return ['ACTIVE', 'REVIEW_REQUIRED'].includes(period.status)
    && Date.parse(period.start_at) <= now.getTime() && Date.parse(period.expires_at) > now.getTime();
}
