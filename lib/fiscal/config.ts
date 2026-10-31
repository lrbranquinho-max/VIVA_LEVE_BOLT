import { z } from 'zod';

const optionalText = z.union([z.literal(''), z.string().max(80)]).nullable().transform(value => value?.trim() || null);
export const fiscalConfigSchema = z.object({
  modo: z.enum(['disabled','manual','automatic']),
  provedor: z.literal('dotcompany'),
  ambiente: z.enum(['homologacao','producao']),
  tipo_documento_padrao: z.enum(['nfe','nfce']),
  serie_nfe: optionalText,
  serie_nfce: optionalText,
  provider_emitter_ref: optionalText,
  max_tentativas: z.coerce.number().int().min(1).max(10),
  ativo: z.boolean(),
  confirmacao_risco: z.string().optional(),
}).superRefine((value, context) => {
  if ((value.ambiente === 'producao' || value.modo === 'automatic') && value.confirmacao_risco !== 'CONFIRMAR ATIVACAO FISCAL') {
    context.addIssue({ code: 'custom', path: ['confirmacao_risco'], message: 'Digite CONFIRMAR ATIVACAO FISCAL para produção ou modo automático.' });
  }
});
