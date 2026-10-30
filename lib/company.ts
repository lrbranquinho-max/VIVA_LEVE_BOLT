import { z } from 'zod';

export type CompanySettings = {
  id: string;
  slug: string;
  principal: boolean;
  ativo: boolean;
  nome_fantasia: string;
  razao_social: string | null;
  cnpj: string | null;
  inscricao_estadual: string | null;
  inscricao_municipal: string | null;
  regime_tributario: string | null;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  site: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  linkedin_url: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  cidade: string | null;
  uf: string | null;
  codigo_municipio_ibge: string | null;
  pais: string;
  missao: string | null;
  visao: string | null;
  valores: string[];
  descricao_empresa: string | null;
  slogan: string | null;
  texto_sobre: string | null;
  mensagem_institucional: string | null;
  descricao_curta_loja: string | null;
  mensagem_rodape: string | null;
  logo_url: string | null;
  simbolo_url: string | null;
  logo_reduzida_url: string | null;
  favicon_url: string | null;
  logo_fundo_claro_url: string | null;
  logo_fundo_escuro_url: string | null;
  imagem_institucional_url: string | null;
  cor_primaria: string | null;
  cor_secundaria: string | null;
  cor_destaque: string | null;
  cor_fundo: string | null;
  cor_texto: string | null;
  cor_botao: string | null;
  cor_texto_botao: string | null;
  seo_titulo: string | null;
  seo_descricao: string | null;
  seo_imagem_url: string | null;
  seo_nome_empresa: string | null;
};

export const DEFAULT_COMPANY: CompanySettings = {
  id: 'fallback', slug: 'viva-leve', principal: true, ativo: true,
  nome_fantasia: 'Viva Leve', razao_social: '62.496.248 LUIZ RICARDO MENDES BRANQUINHO',
  cnpj: '62496248000142', inscricao_estadual: null, inscricao_municipal: null,
  regime_tributario: null, email: 'vivaleve.df@gmail.com', telefone: '6191299996',
  whatsapp: '556191299996', site: 'https://www.vivalevedf.com.br', instagram_url: null,
  facebook_url: null, tiktok_url: null, youtube_url: null, linkedin_url: null,
  endereco: 'Rua 91, Quadra 51, Lote 5', numero: 'Loja 2', complemento: null,
  bairro: null, cep: '72871091', cidade: 'Valparaíso de Goiás', uf: 'GO',
  codigo_municipio_ibge: null, pais: 'Brasil', missao: null, visao: null, valores: [],
  descricao_empresa: 'Alimentação saudável e prática para transformar sua rotina.',
  slogan: 'Saúde e praticidade', texto_sobre: null, mensagem_institucional: null,
  descricao_curta_loja: 'Comida saudável e rastreamento de dieta.',
  mensagem_rodape: 'Transformando sua rotina com alimentação saudável e prática.',
  logo_url: null, simbolo_url: null, logo_reduzida_url: null, favicon_url: null,
  logo_fundo_claro_url: null, logo_fundo_escuro_url: null, imagem_institucional_url: null,
  cor_primaria: '#4B0082', cor_secundaria: '#BFFF00', cor_destaque: '#BFFF00',
  cor_fundo: '#F1F5F2', cor_texto: '#111827', cor_botao: '#BFFF00',
  cor_texto_botao: '#4B0082', seo_titulo: 'Viva Leve',
  seo_descricao: 'Comida saudável e rastreamento de dieta.', seo_imagem_url: null,
  seo_nome_empresa: 'Viva Leve',
};

const optionalText = z.string().trim().max(2000).nullable();
const httpUrl = z.string().trim().url().refine(v => /^https?:\/\//i.test(v), 'Use uma URL HTTP ou HTTPS válida.');
const optionalUrl = z.union([z.literal(''), httpUrl]).nullable().transform(v => v || null);
const optionalEmail = z.union([z.literal(''), z.string().trim().email()]).nullable().transform(v => v || null);
const optionalColor = z.union([z.literal(''), z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use uma cor hexadecimal como #4B0082.')]).nullable().transform(v => v || null);

export function validarCnpj(value: string) {
  const cnpj = value.replace(/\D/g, '');
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digito = (tamanho: number) => {
    let soma = 0; let peso = tamanho - 7;
    for (let i = 0; i < tamanho; i += 1) { soma += Number(cnpj[i]) * peso--; if (peso < 2) peso = 9; }
    const resto = soma % 11; return resto < 2 ? 0 : 11 - resto;
  };
  return digito(12) === Number(cnpj[12]) && digito(13) === Number(cnpj[13]);
}

export const companyUpdateSchema = z.object({
  nome_fantasia: z.string().trim().min(2).max(120), razao_social: optionalText,
  cnpj: z.union([z.literal(''), z.string()]).nullable().transform(v => v?.replace(/\D/g, '') || null)
    .refine(v => v === null || validarCnpj(v), 'CNPJ inválido.'),
  inscricao_estadual: optionalText, inscricao_municipal: optionalText, regime_tributario: optionalText,
  email: optionalEmail, telefone: optionalText, whatsapp: optionalText, site: optionalUrl,
  instagram_url: optionalUrl, facebook_url: optionalUrl, tiktok_url: optionalUrl,
  youtube_url: optionalUrl, linkedin_url: optionalUrl, endereco: optionalText, numero: optionalText,
  complemento: optionalText, bairro: optionalText,
  cep: z.union([z.literal(''), z.string()]).nullable().transform(v => v?.replace(/\D/g, '') || null)
    .refine(v => v === null || /^\d{8}$/.test(v), 'CEP inválido.'),
  cidade: optionalText, uf: z.union([z.literal(''), z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/)]).nullable().transform(v => v || null),
  codigo_municipio_ibge: z.union([z.literal(''), z.string().regex(/^\d{7}$/)]).nullable().transform(v => v || null),
  pais: z.string().trim().min(2).max(80), missao: optionalText, visao: optionalText,
  valores: z.array(z.string().trim().min(1).max(200)).max(30), descricao_empresa: optionalText,
  slogan: optionalText, texto_sobre: optionalText, mensagem_institucional: optionalText,
  descricao_curta_loja: optionalText, mensagem_rodape: optionalText,
  logo_url: optionalUrl, simbolo_url: optionalUrl, logo_reduzida_url: optionalUrl,
  favicon_url: optionalUrl, logo_fundo_claro_url: optionalUrl, logo_fundo_escuro_url: optionalUrl,
  imagem_institucional_url: optionalUrl, cor_primaria: optionalColor, cor_secundaria: optionalColor,
  cor_destaque: optionalColor, cor_fundo: optionalColor, cor_texto: optionalColor,
  cor_botao: optionalColor, cor_texto_botao: optionalColor, seo_titulo: optionalText,
  seo_descricao: optionalText, seo_imagem_url: optionalUrl, seo_nome_empresa: optionalText,
}).strict();

export type CompanyUpdate = z.infer<typeof companyUpdateSchema>;

export function formatarCnpj(cnpj?: string | null) {
  const value = (cnpj || '').replace(/\D/g, '');
  return value.length === 14 ? value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : value;
}

export function whatsappUrl(value?: string | null) {
  const digits = (value || '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : null;
}

export function enderecoEmpresa(company: CompanySettings) {
  return [company.endereco, company.numero, company.complemento, company.bairro,
    company.cep ? `CEP ${company.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2')}` : null,
    [company.cidade, company.uf].filter(Boolean).join('/')].filter(Boolean).join(' - ');
}

export function companyCssVariables(company: CompanySettings): Record<string, string> {
  const rgb = (value: string) => {
    const hex = value.replace('#', '');
    return `${parseInt(hex.slice(0, 2), 16)} ${parseInt(hex.slice(2, 4), 16)} ${parseInt(hex.slice(4, 6), 16)}`;
  };
  const primary = company.cor_primaria || DEFAULT_COMPANY.cor_primaria!;
  const secondary = company.cor_secundaria || DEFAULT_COMPANY.cor_secundaria!;
  const accent = company.cor_destaque || DEFAULT_COMPANY.cor_destaque!;
  return {
    '--brand-primary': primary,
    '--brand-primary-rgb': rgb(primary),
    '--brand-secondary': secondary,
    '--brand-secondary-rgb': rgb(secondary),
    '--brand-accent': accent,
    '--brand-accent-rgb': rgb(accent),
    '--brand-background': company.cor_fundo || DEFAULT_COMPANY.cor_fundo!,
    '--brand-text': company.cor_texto || DEFAULT_COMPANY.cor_texto!,
    '--brand-button': company.cor_botao || DEFAULT_COMPANY.cor_botao!,
    '--brand-button-text': company.cor_texto_botao || DEFAULT_COMPANY.cor_texto_botao!,
  };
}
