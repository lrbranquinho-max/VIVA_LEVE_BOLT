import { z } from 'zod';

export const PERFIS_ESPECIAIS = ['admin', 'trainer', 'delivery'] as const;
export type PerfilEspecial = typeof PERFIS_ESPECIAIS[number];
export type PerfilUsuario = 'student' | PerfilEspecial;

export interface UsuarioAdmin {
  id: string;
  email: string;
  nome: string;
  telefone: string;
  observacoes: string;
  perfis: PerfilUsuario[];
  criadoEm: string;
  ultimoAcesso: string | null;
  emailConfirmado: boolean;
}

export const dadosUsuarioSchema = z.object({
  userId: z.uuid().optional(),
  nome: z.string().trim().min(2, 'Informe o nome completo.').max(160),
  email: z.string().trim().pipe(z.email('Informe um e-mail válido.')).transform(value => value.toLowerCase()),
  telefone: z.string().trim().max(30).default(''),
  observacoes: z.string().trim().max(2000).default(''),
  senha: z.string().max(128).default('').refine(value => !value || value.length >= 8, 'A senha deve ter pelo menos 8 caracteres.'),
  perfis: z.array(z.enum(['student', ...PERFIS_ESPECIAIS])).min(1, 'Selecione ao menos um perfil.').max(4)
    .transform(value => Array.from(new Set(value)))
    .refine(value => !value.includes('student') || value.length === 1, 'Selecione Aluno ou os acessos profissionais.'),
}).strict();

export function alternarPerfilUsuario(atuais: PerfilUsuario[], perfil: PerfilUsuario): PerfilUsuario[] {
  if (perfil === 'student') return ['student'];
  const especiais = atuais.filter(item => item !== 'student');
  const proximos = especiais.includes(perfil)
    ? especiais.filter(item => item !== perfil)
    : [...especiais, perfil];
  return proximos.length ? proximos : ['student'];
}

export function perfisAtivos(roles: Array<{ role: string; ativo: boolean }>): PerfilUsuario[] {
  const especiais = PERFIS_ESPECIAIS.filter(role => roles.some(item => item.role === role && item.ativo));
  return especiais.length ? especiais : ['student'];
}

export function urlConviteUsuario(site?: string): string {
  const padrao = 'https://vivalevedf.com.br';
  try {
    const url = new URL(site || padrao);
    if (url.protocol !== 'https:' || url.username || url.password || !['vivalevedf.com.br', 'www.vivalevedf.com.br'].includes(url.hostname)) {
      return `${padrao}/login?definir_senha=1`;
    }
    return `${url.origin}/login?definir_senha=1`;
  } catch {
    return `${padrao}/login?definir_senha=1`;
  }
}
