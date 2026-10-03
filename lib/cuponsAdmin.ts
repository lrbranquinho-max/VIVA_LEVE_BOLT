import { z } from 'zod';
import { PerfilUsuario } from './usuariosAdmin';

export type StatusCupom = 'aberto' | 'finalizado';
export type SituacaoCupom = 'ativo' | 'expirado' | 'utilizado';

export interface CupomAdmin {
  id: string;
  cliente_id: string;
  percentual_desconto: number;
  criado_em: string;
  data_validade: string;
  data_utilizacao: string | null;
  status: StatusCupom;
}

export const novoCupomAdminSchema = z.object({
  clienteId: z.uuid('Cliente inválido.'),
  percentual: z.number().positive('Informe um desconto maior que zero.').max(100, 'O desconto não pode passar de 100%.')
    .refine(valor => Number.isInteger(valor * 100), 'Use no máximo duas casas decimais.'),
  dataValidade: z.string().datetime({ offset: true, message: 'Informe uma data de validade válida.' }),
}).strict();

export function situacaoCupom(cupom: Pick<CupomAdmin, 'status' | 'data_validade'>, agora = new Date()): SituacaoCupom {
  if (cupom.status === 'finalizado') return 'utilizado';
  return new Date(cupom.data_validade).getTime() >= agora.getTime() ? 'ativo' : 'expirado';
}

export function usuarioEhEquipe(perfis: PerfilUsuario[]) {
  return perfis.some(perfil => perfil !== 'student');
}
