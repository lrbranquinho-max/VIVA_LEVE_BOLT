import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

export const runtime = 'nodejs';

const DIAS_SEMANA = ['Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado', 'Domingo'];
const NOTA_SALADA = 'Observação: Folhagens e saladas verdes (sem azeite e sem molho) são de consumo totalmente livre à vontade!';
const LINK_SHAKES = 'https://www.tuasaude.com/suplemento-caseiro-para-ganhar-massa-muscular/';

const ORDEM_REFEICOES = ['Cafe da Manha', 'Lanche da Manha', 'Almoco', 'Lanche da Tarde', 'Jantar', 'Ceia'];

const RefeicaoSchema = z.object({
  nome_refeicao: z.enum(['Cafe da Manha', 'Lanche da Manha', 'Almoco', 'Lanche da Tarde', 'Jantar', 'Ceia']),
  titulo_resumo: z.string().min(3),
  descricao_completa: z.string().min(8),
  modo_preparo: z.string().min(3),
  kcal_total: z.number().nonnegative().max(950),
  carb_total: z.number().nonnegative(),
  prot_total: z.number().nonnegative(),
  gord_total: z.number().nonnegative(),
  produtos_loja_ids: z.array(z.number().int()),
});

const DiaSchema = z.object({
  dia: z.enum(['Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado', 'Domingo']),
  meta_kcal: z.number().positive(),
  kcal_planejadas: z.number().nonnegative(),
  calorias_livres: z.number(),
  nota_salada: z.literal(NOTA_SALADA),
  nota_rodape: z.string(),
  refeicoes: z.array(RefeicaoSchema).min(3),
});

const PlanoNutriSchema = z.object({
  objetivo_estabelecido: z.string(),
  kcal_diaria_meta: z.number().positive(),
  metas_macros_diarias: z.object({
    kcal: z.number().positive(),
    proteinas: z.number().nonnegative(),
    gorduras: z.number().nonnegative(),
    carboidratos: z.number().nonnegative(),
  }),
  dias: z.array(DiaSchema).length(7),
});

type PlanoNutri = z.infer<typeof PlanoNutriSchema>;

type ComplementoNutri = {
  nome: string;
  refeicoes: string[];
  kcal: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  porcao: string;
  detalhe: string;
  foco: 'proteina' | 'carboidrato' | 'gordura' | 'kcal';
};

const COMPLEMENTOS_NUTRI: ComplementoNutri[] = [
  {
    nome: 'Shake de whey com leite',
    refeicoes: ['Cafe da Manha', 'Lanche da Manha', 'Lanche da Tarde', 'Ceia'],
    kcal: 330,
    proteinas: 32,
    carboidratos: 28,
    gorduras: 8,
    porcao: '300ml',
    detalhe: 'Misturar whey protein com leite. Opcao pratica para elevar proteinas sem aumentar muito o volume.',
    foco: 'proteina',
  },
  {
    nome: 'Vitamina de banana com aveia e pasta de amendoim',
    refeicoes: ['Cafe da Manha', 'Lanche da Manha', 'Lanche da Tarde'],
    kcal: 620,
    proteinas: 22,
    carboidratos: 82,
    gorduras: 22,
    porcao: '350ml',
    detalhe: 'Bater banana, aveia, leite e pasta de amendoim. Indicada para dias de maior meta calorica.',
    foco: 'kcal',
  },
  {
    nome: 'Iogurte com aveia e mel',
    refeicoes: ['Cafe da Manha', 'Lanche da Manha', 'Lanche da Tarde', 'Ceia'],
    kcal: 360,
    proteinas: 16,
    carboidratos: 55,
    gorduras: 8,
    porcao: '250g',
    detalhe: 'Combinar iogurte, aveia e pequena porcao de mel.',
    foco: 'carboidrato',
  },
  {
    nome: 'Mix de castanhas',
    refeicoes: ['Lanche da Manha', 'Lanche da Tarde', 'Ceia'],
    kcal: 190,
    proteinas: 5,
    carboidratos: 7,
    gorduras: 16,
    porcao: '30g',
    detalhe: 'Consumir porcao medida de castanhas para completar gorduras boas.',
    foco: 'gordura',
  },
  {
    nome: 'Suco de laranja natural',
    refeicoes: ['Almoco', 'Jantar', 'Lanche da Manha', 'Lanche da Tarde'],
    kcal: 140,
    proteinas: 2,
    carboidratos: 32,
    gorduras: 0,
    porcao: '300ml',
    detalhe: 'Suco natural sem acucar. Bom complemento para refeicoes principais em metas altas.',
    foco: 'carboidrato',
  },
  {
    nome: 'Tapioca extra com queijo branco',
    refeicoes: ['Cafe da Manha', 'Lanche da Manha', 'Lanche da Tarde'],
    kcal: 420,
    proteinas: 18,
    carboidratos: 56,
    gorduras: 12,
    porcao: '180g',
    detalhe: 'Preparar tapioca com queijo branco. Complemento solido e de facil aceitacao.',
    foco: 'kcal',
  },
  {
    nome: 'Sobremesa fit Viva Leve ou fruta planejada',
    refeicoes: ['Almoco', 'Jantar'],
    kcal: 220,
    proteinas: 8,
    carboidratos: 32,
    gorduras: 6,
    porcao: '1 unidade',
    detalhe: 'Usar sobremesa fit disponivel ou fruta planejada como complemento, sem misturar no prato principal.',
    foco: 'kcal',
  },
];

function parseNumero(valor: unknown) {
  const numero = Number(String(valor ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(numero) ? numero : 0;
}

function calcularTdee(perfil: any, perfilCliente: any) {
  const peso = parseNumero(perfilCliente?.peso_kg);
  const altura = parseNumero(perfilCliente?.altura_cm);
  const idade = parseNumero(perfilCliente?.idade);
  const sexo = String(perfilCliente?.sexo ?? '');

  if (peso && altura && idade && sexo) {
    const tmb = (10 * peso) + (6.25 * altura) - (5 * idade) + (sexo === 'masculino' ? 5 : -161);
    const fatores: Record<string, number> = {
      sedentario: 1.2,
      leve: 1.375,
      moderado: 1.55,
      muito_ativo: 1.725,
      extremo: 1.9,
    };
    return Math.round(tmb * (fatores[perfilCliente?.nivel_atividade] ?? 1.2));
  }

  const meta = Number(perfil?.meta_calorias ?? 0);
  return meta > 0 ? meta : 2000;
}

function metaPorObjetivo(tdee: number, objetivo: string) {
  if (objetivo === 'Perda de Peso') return Math.round(tdee * 0.77);
  if (objetivo === 'Ganho de Massa') return Math.round(tdee * 1.23);
  return Math.round(tdee);
}

function metasMacros(metaKcal: number, perfilCliente: any) {
  const peso = parseNumero(perfilCliente?.peso_kg);

  if (!peso) {
    return {
      kcal: metaKcal,
      proteinas: Math.round((metaKcal * 0.25) / 4),
      gorduras: Math.round((metaKcal * 0.25) / 9),
      carboidratos: Math.round((metaKcal * 0.5) / 4),
    };
  }

  const proteinas = Math.round(peso * 2);
  const gorduras = Math.round(peso);
  const kcalRestantes = Math.max(0, metaKcal - (proteinas * 4) - (gorduras * 9));

  return {
    kcal: metaKcal,
    proteinas,
    gorduras,
    carboidratos: Math.round(kcalRestantes / 4),
  };
}

function normalizarTexto(valor: unknown) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function categoriaProduto(produto: any) {
  return normalizarTexto(produto?.categoria);
}

function tipoReceitaExterna(refeicao: string) {
  if (refeicao === 'Cafe da Manha') return 'Cafe da Manha';
  if (refeicao === 'Lanche da Manha' || refeicao === 'Lanche da Tarde') return 'Lanche';
  if (refeicao === 'Almoco' || refeicao === 'Jantar') return 'Almoco_Jantar';
  if (refeicao === 'Ceia') return 'Ceia';
  return '';
}

function refeicoesSelecionadas(padrao: any) {
  const selecionadas = ORDEM_REFEICOES.filter(nome => Boolean(padrao?.[nome]));
  return selecionadas;
}

function produtoPermitidoNaRefeicao(produto: any, refeicao: string) {
  const categoria = categoriaProduto(produto);
  if (categoria.includes('marmita')) return ['Almoco', 'Jantar'].includes(refeicao);
  if (categoria.includes('caldo')) return refeicao === 'Ceia';
  return false;
}

function porcaoReceitaExterna(receita: any) {
  const porcao = Number(receita?.porcao);
  return Number.isFinite(porcao) && porcao > 0 ? Math.round(porcao) : 100;
}

function macrosPorGramas(base100g: any, gramas: number) {
  const fator = gramas / 100;
  return {
    kcal: Math.round(Number(base100g.kcal_100g ?? base100g.kcal ?? 0) * fator),
    carboidratos: Number((Number(base100g.carb_100g ?? base100g.carboidratos ?? 0) * fator).toFixed(1)),
    proteinas: Number((Number(base100g.prot_100g ?? base100g.proteinas ?? 0) * fator).toFixed(1)),
    gorduras: Number((Number(base100g.gord_100g ?? base100g.gorduras ?? 0) * fator).toFixed(1)),
  };
}

function itemProdutoParaContexto(produto: any) {
  const porcao = Number(produto.porcao_g ?? 100) || 100;
  return {
    id: produto.id,
    nome: produto.nome,
    descricao: produto.descricao,
    categoria: produto.categoria,
    porcao_g: porcao,
    preco: Number(produto.preco ?? 0),
    kcal_por_porcao: Math.round(Number(produto.kcal ?? 0) * (porcao / 100)),
    carb_por_porcao: Number(Number(produto.carboidratos ?? 0).toFixed(1)),
    prot_por_porcao: Number(Number(produto.proteinas ?? 0).toFixed(1)),
    gord_por_porcao: Number(Number(produto.gorduras ?? 0).toFixed(1)),
  };
}

function itemReceitaParaContexto(receita: any) {
  const porcao = porcaoReceitaExterna(receita);
  const macros = macrosPorGramas(receita, porcao);
  return {
    id: receita.id,
    tipo_refeicao: receita.tipo_refeicao,
    nome_receita: receita.nome_receita,
    modo_preparo: receita.modo_preparo,
    porcao,
    kcal_por_porcao: macros.kcal,
    carb_por_porcao: macros.carboidratos,
    prot_por_porcao: macros.proteinas,
    gord_por_porcao: macros.gorduras,
  };
}

function somarRefeicao(refeicao: any) {
  return {
    kcal: Math.round(Number(refeicao.kcal_total ?? 0)),
    carboidratos: Number(Number(refeicao.carb_total ?? 0).toFixed(1)),
    proteinas: Number(Number(refeicao.prot_total ?? 0).toFixed(1)),
    gorduras: Number(Number(refeicao.gord_total ?? 0).toFixed(1)),
  };
}

function arredondarMacro(valor: number) {
  return Number(Number(valor).toFixed(1));
}

function somarDia(refeicoes: any[]) {
  return refeicoes.reduce((total, refeicao) => ({
    kcal: total.kcal + Number(refeicao.kcal ?? refeicao.kcal_total ?? 0),
    proteinas: total.proteinas + Number(refeicao.proteinas ?? refeicao.prot_total ?? 0),
    carboidratos: total.carboidratos + Number(refeicao.carboidratos ?? refeicao.carb_total ?? 0),
    gorduras: total.gorduras + Number(refeicao.gorduras ?? refeicao.gord_total ?? 0),
  }), { kcal: 0, proteinas: 0, carboidratos: 0, gorduras: 0 });
}

function escolherComplemento(refeicao: any, metas: ReturnType<typeof metasMacros>, totalDia: ReturnType<typeof somarDia>, metaKcal: number, tentativa: number) {
  const disponiveis = COMPLEMENTOS_NUTRI
    .filter(complemento => complemento.refeicoes.includes(refeicao.refeicao))
    .filter(complemento => Number(refeicao.kcal ?? 0) + complemento.kcal <= 950)
    .filter(complemento => totalDia.kcal + complemento.kcal <= metaKcal + 90);

  if (disponiveis.length === 0) return null;

  const proteinaBaixa = totalDia.proteinas < metas.proteinas * 0.95;
  const gorduraBaixa = totalDia.gorduras < metas.gorduras * 0.95;
  const carboBaixo = totalDia.carboidratos < metas.carboidratos * 0.95;
  const kcalMuitoBaixa = totalDia.kcal < metaKcal * 0.9;

  const foco = proteinaBaixa ? 'proteina' : gorduraBaixa ? 'gordura' : carboBaixo ? 'carboidrato' : kcalMuitoBaixa ? 'kcal' : 'kcal';
  const preferidos = disponiveis.filter(complemento => complemento.foco === foco);
  const lista = preferidos.length > 0 ? preferidos : disponiveis;

  return lista[tentativa % lista.length];
}

function aplicarComplemento(refeicao: any, complemento: ComplementoNutri) {
  const nomeBase = String(refeicao.nome ?? refeicao.titulo_resumo ?? refeicao.descricao_completa ?? refeicao.refeicao);
  const detalheBase = String(refeicao.modo_preparo || refeicao.descricao || refeicao.descricao_completa || '');
  const detalheComplemento = `${complemento.nome} (${complemento.porcao}): ${complemento.detalhe}`;

  return {
    ...refeicao,
    nome: `${nomeBase} + ${complemento.nome} (${complemento.porcao})`,
    descricao: [String(refeicao.descricao || refeicao.descricao_completa || ''), detalheComplemento].filter(Boolean).join('\n\nComplemento: '),
    modo_preparo: [detalheBase, detalheComplemento].filter(Boolean).join('\n\nComplemento: '),
    porcao: '',
    kcal: Math.round(Number(refeicao.kcal ?? 0) + complemento.kcal),
    proteinas: arredondarMacro(Number(refeicao.proteinas ?? 0) + complemento.proteinas),
    carboidratos: arredondarMacro(Number(refeicao.carboidratos ?? 0) + complemento.carboidratos),
    gorduras: arredondarMacro(Number(refeicao.gorduras ?? 0) + complemento.gorduras),
    kcal_total: Math.round(Number(refeicao.kcal_total ?? refeicao.kcal ?? 0) + complemento.kcal),
    prot_total: arredondarMacro(Number(refeicao.prot_total ?? refeicao.proteinas ?? 0) + complemento.proteinas),
    carb_total: arredondarMacro(Number(refeicao.carb_total ?? refeicao.carboidratos ?? 0) + complemento.carboidratos),
    gord_total: arredondarMacro(Number(refeicao.gord_total ?? refeicao.gorduras ?? 0) + complemento.gorduras),
  };
}

function recalcularDia(dia: any, metas: ReturnType<typeof metasMacros>) {
  const total = somarDia(dia.refeicoes ?? []);
  const kcalPlanejadas = Math.round(total.kcal);
  const caloriasLivres = Math.round(metas.kcal - kcalPlanejadas);
  const notaRodape = caloriasLivres > 200
    ? `Saldo acima de 200 kcal: complementar com shakes/vitaminas caseiras pode ajudar. Referencia: ${LINK_SHAKES}`
    : '';

  return {
    ...dia,
    meta_kcal: metas.kcal,
    kcal_planejadas: kcalPlanejadas,
    calorias_livres: caloriasLivres,
    nota_salada: NOTA_SALADA,
    nota_rodape: notaRodape,
  };
}

function reduzirExcessoCaloricoDia(dia: any, metas: ReturnType<typeof metasMacros>, receitas: any[]) {
  let refeicoes = [...(dia.refeicoes ?? [])];
  let total = somarDia(refeicoes);
  let tentativas = 0;

  while (total.kcal > metas.kcal + 90 && tentativas < refeicoes.length * 2) {
    const candidatas = refeicoes
      .map((refeicao, index) => ({ refeicao, index }))
      .sort((a, b) => Number(b.refeicao.kcal ?? b.refeicao.kcal_total ?? 0) - Number(a.refeicao.kcal ?? a.refeicao.kcal_total ?? 0));

    const alvo = candidatas[tentativas % Math.max(1, candidatas.length)];
    if (!alvo) break;

    const nomeRefeicao = String(alvo.refeicao.refeicao ?? alvo.refeicao.nome_refeicao ?? '');
    const receitasDoTipo = (receitas ?? [])
      .filter((receita: any) => receita.tipo_refeicao === tipoReceitaExterna(nomeRefeicao))
      .map((receita: any) => criarRefeicaoReceitaExterna(nomeRefeicao, receita))
      .filter((receita: any) => Number(receita.kcal ?? 0) < Number(alvo.refeicao.kcal ?? alvo.refeicao.kcal_total ?? 0))
      .sort((a: any, b: any) => {
        const totalA = total.kcal - Number(alvo.refeicao.kcal ?? alvo.refeicao.kcal_total ?? 0) + Number(a.kcal ?? 0);
        const totalB = total.kcal - Number(alvo.refeicao.kcal ?? alvo.refeicao.kcal_total ?? 0) + Number(b.kcal ?? 0);
        return Math.abs(metas.kcal - totalA) - Math.abs(metas.kcal - totalB);
      });

    const substituta = receitasDoTipo.find((receita: any) => (
      total.kcal - Number(alvo.refeicao.kcal ?? alvo.refeicao.kcal_total ?? 0) + Number(receita.kcal ?? 0)
    ) <= metas.kcal + 90);

    if (!substituta) {
      const kcalAtual = Number(alvo.refeicao.kcal ?? alvo.refeicao.kcal_total ?? 0);
      const totalSemAlvo = {
        kcal: total.kcal - kcalAtual,
        proteinas: total.proteinas - Number(alvo.refeicao.proteinas ?? alvo.refeicao.prot_total ?? 0),
        carboidratos: total.carboidratos - Number(alvo.refeicao.carboidratos ?? alvo.refeicao.carb_total ?? 0),
        gorduras: total.gorduras - Number(alvo.refeicao.gorduras ?? alvo.refeicao.gord_total ?? 0),
      };
      const kcalAlvo = Math.max(120, metas.kcal + 90 - totalSemAlvo.kcal);
      const ajustada = criarRefeicaoAjustada(nomeRefeicao, kcalAlvo, metas, totalSemAlvo);
      refeicoes = refeicoes.map((refeicao, index) => index === alvo.index ? ajustada : refeicao);
      total = somarDia(refeicoes);
      tentativas += 1;
      continue;
    }

    refeicoes = refeicoes.map((refeicao, index) => index === alvo.index ? substituta : refeicao);
    total = somarDia(refeicoes);
    tentativas += 1;
  }

  return { ...dia, refeicoes };
}

function reforcarPlano(plano: any, metas: ReturnType<typeof metasMacros>, receitas: any[] = []) {
  return {
    ...plano,
    dias: (plano.dias ?? []).map((dia: any) => {
      let diaAjustado = reduzirExcessoCaloricoDia(dia, metas, receitas);
      let refeicoes = [...(diaAjustado.refeicoes ?? [])];
      let tentativa = 0;
      let total = somarDia(refeicoes);

      while (total.kcal < metas.kcal * 0.95 && tentativa < 36) {
        const ordenadas = refeicoes
          .map((refeicao, index) => ({ refeicao, index }))
          .filter(({ refeicao }) => Number(refeicao.kcal ?? 0) < 930)
          .sort((a, b) => Number(a.refeicao.kcal ?? 0) - Number(b.refeicao.kcal ?? 0));

        const alvo = ordenadas.find(({ refeicao }) => Number(refeicao.kcal ?? 0) < Math.min(950, metas.kcal / Math.max(3, refeicoes.length) * 1.25));
        if (!alvo) break;

        const complemento = escolherComplemento(alvo.refeicao, metas, total, metas.kcal, tentativa);
        if (!complemento) break;

        refeicoes = refeicoes.map((refeicao, index) => index === alvo.index ? aplicarComplemento(refeicao, complemento) : refeicao);
        total = somarDia(refeicoes);
        tentativa += 1;
      }

      diaAjustado = reduzirExcessoCaloricoDia({ ...diaAjustado, refeicoes }, metas, receitas);
      return recalcularDia(diaAjustado, metas);
    }),
  };
}

function criarRefeicaoReceitaExterna(nomeRefeicao: string, receita: any) {
  const item = itemReceitaParaContexto(receita);
  return {
    nome_refeicao: nomeRefeicao,
    refeicao: nomeRefeicao,
    titulo_resumo: `${item.nome_receita} (Porcao: ${item.porcao}g)`,
    nome: `${item.nome_receita} (Porcao: ${item.porcao}g)`,
    descricao_completa: `${item.nome_receita} (Porcao: ${item.porcao}g) - ${item.modo_preparo ?? ''}`.trim(),
    descricao: `${item.nome_receita} (Porcao: ${item.porcao}g) - ${item.modo_preparo ?? ''}`.trim(),
    modo_preparo: item.modo_preparo || 'Preparo simples conforme receita externa cadastrada.',
    porcao: `${item.porcao}g`,
    gramas: item.porcao,
    kcal_total: item.kcal_por_porcao,
    carb_total: item.carb_por_porcao,
    prot_total: item.prot_por_porcao,
    gord_total: item.gord_por_porcao,
    kcal: item.kcal_por_porcao,
    carboidratos: item.carb_por_porcao,
    proteinas: item.prot_por_porcao,
    gorduras: item.gord_por_porcao,
    produtos_loja_ids: [],
    produto_id: null,
    receita_externa_id: String(item.id),
  };
}

function criarRefeicaoAjustada(nomeRefeicao: string, kcalAlvo: number, metas: ReturnType<typeof metasMacros>, totalAtual: ReturnType<typeof somarDia>) {
  const kcal = Math.max(120, Math.round(kcalAlvo));
  const proteinasRestantes = Math.max(0, metas.proteinas - totalAtual.proteinas);
  const gordurasRestantes = Math.max(0, metas.gorduras - totalAtual.gorduras);
  const proteinas = arredondarMacro(Math.min(proteinasRestantes || (kcal * 0.28) / 4, (kcal * 0.45) / 4));
  const gorduras = arredondarMacro(Math.min(gordurasRestantes || (kcal * 0.25) / 9, (kcal * 0.4) / 9));
  const kcalRestante = Math.max(0, kcal - (proteinas * 4) - (gorduras * 9));
  const carboidratos = arredondarMacro(kcalRestante / 4);
  const nome = `${nomeRefeicao}: refeicao externa ajustada (${kcal} kcal)`;

  return {
    nome_refeicao: nomeRefeicao,
    refeicao: nomeRefeicao,
    titulo_resumo: nome,
    nome,
    descricao_completa: `${nome}. Refeicao externa calibrada para respeitar o limite diario de kcal e aproximar os macros do usuario.`,
    descricao: `${nome}. Refeicao externa calibrada para respeitar o limite diario de kcal e aproximar os macros do usuario.`,
    modo_preparo: 'Montar com alimentos externos coerentes para o horario, priorizando proteinas magras, gorduras boas e carboidratos conforme a meta restante.',
    porcao: '',
    gramas: 0,
    kcal_total: kcal,
    carb_total: carboidratos,
    prot_total: proteinas,
    gord_total: gorduras,
    kcal,
    carboidratos,
    proteinas,
    gorduras,
    produtos_loja_ids: [],
    produto_id: null,
    receita_externa_id: null,
  };
}

function textoRefeicao(refeicao: any) {
  return [
    refeicao.nome,
    refeicao.titulo_resumo,
    refeicao.descricao,
    refeicao.descricao_completa,
    refeicao.modo_preparo,
  ].filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function temPorcaoAbsurda(texto: string, refeicao: string) {
  const limite = ['Cafe da Manha', 'Lanche da Manha', 'Lanche da Tarde', 'Ceia'].includes(refeicao) ? 450 : 750;
  const gramas = Array.from(texto.matchAll(/(\d{3,4})\s*g\b/g)).map(match => Number(match[1]));
  return gramas.some(valor => valor > limite);
}

function refeicaoIncoerente(refeicao: any, produtoPorId: Map<number, any>) {
  const nomeRefeicao = String(refeicao.refeicao ?? refeicao.nome_refeicao ?? '');
  const texto = textoRefeicao(refeicao);
  const produtos = (refeicao.produtos_loja_ids ?? []).map((id: number) => produtoPorId.get(Number(id))).filter(Boolean);
  const produtoInvalido = produtos.some((produto: any) => !produtoPermitidoNaRefeicao(produto, nomeRefeicao));

  if (produtoInvalido) return true;
  if (temPorcaoAbsurda(texto, nomeRefeicao)) return true;
  if (/(pote inteiro|pote de|embalagem inteira|900\s*g|whey protein.*900|900.*whey protein)/i.test(texto)) return true;
  if (nomeRefeicao === 'Cafe da Manha' && /(marmita|caldo|arroz|feijao|feijao|macarrao|patinho|isca de carne)/i.test(texto)) return true;
  if ((nomeRefeicao === 'Lanche da Manha' || nomeRefeicao === 'Lanche da Tarde') && /(marmita|caldo|prato completo|arroz|feijao)/i.test(texto)) return true;
  if (nomeRefeicao === 'Ceia' && /(marmita|prato completo|arroz|feijao|macarrao)/i.test(texto)) return true;

  return false;
}

function substituirRefeicoesIncoerentes(plano: any, receitas: any[], produtos: any[]) {
  const produtoPorId = new Map((produtos ?? []).map((produto: any) => [Number(produto.id), produto]));

  return {
    ...plano,
    dias: (plano.dias ?? []).map((dia: any, diaIndex: number) => ({
      ...dia,
      refeicoes: (dia.refeicoes ?? []).map((refeicao: any, refeicaoIndex: number) => {
        if (!refeicaoIncoerente(refeicao, produtoPorId)) return refeicao;

        const nomeRefeicao = String(refeicao.refeicao ?? refeicao.nome_refeicao ?? '');
        const tipo = tipoReceitaExterna(nomeRefeicao);
        const candidatas = (receitas ?? []).filter((receita: any) => receita.tipo_refeicao === tipo);
        const substituta = candidatas[(diaIndex + refeicaoIndex) % Math.max(1, candidatas.length)];

        return substituta
          ? criarRefeicaoReceitaExterna(nomeRefeicao, substituta)
          : {
              ...refeicao,
              nome: `${nomeRefeicao}: refeicao externa equilibrada`,
              titulo_resumo: `${nomeRefeicao}: refeicao externa equilibrada`,
              descricao: `${nomeRefeicao}: refeicao externa equilibrada, sem produto da loja inadequado para o horario.`,
              descricao_completa: `${nomeRefeicao}: refeicao externa equilibrada, sem produto da loja inadequado para o horario.`,
              modo_preparo: 'Montar com alimento externo adequado ao horario e as preferencias informadas.',
              produtos_loja_ids: [],
              produto_id: null,
            };
      }),
    })),
  };
}

function adaptarParaApp(plano: PlanoNutri, metaKcal: number) {
  return {
    ...plano,
    kcal_diaria_meta: metaKcal,
    dias: plano.dias
      .slice()
      .sort((a, b) => DIAS_SEMANA.indexOf(a.dia) - DIAS_SEMANA.indexOf(b.dia))
      .map(dia => {
        const refeicoes = dia.refeicoes
          .filter(refeicao => ORDEM_REFEICOES.includes(refeicao.nome_refeicao))
          .sort((a, b) => ORDEM_REFEICOES.indexOf(a.nome_refeicao) - ORDEM_REFEICOES.indexOf(b.nome_refeicao))
          .map(refeicao => {
            const macros = somarRefeicao(refeicao);
            const produtos = refeicao.produtos_loja_ids ?? [];

            return {
              ...refeicao,
              refeicao: refeicao.nome_refeicao,
              nome: refeicao.titulo_resumo,
              descricao: refeicao.descricao_completa,
              modo_preparo: refeicao.modo_preparo,
              porcao: '',
              gramas: 0,
              kcal: macros.kcal,
              proteinas: macros.proteinas,
              carboidratos: macros.carboidratos,
              gorduras: macros.gorduras,
              produto_id: produtos[0] ?? null,
              produtos_loja_ids: produtos,
              receita_externa_id: null,
            };
          });

        const kcalPlanejadas = refeicoes.reduce((total, refeicao) => total + Number(refeicao.kcal ?? 0), 0);
        const caloriasLivres = Math.round(metaKcal - kcalPlanejadas);
        const notaRodape = caloriasLivres > 200
          ? `Saldo acima de 200 kcal: complementar com shakes/vitaminas caseiras pode ajudar. Referencia: ${LINK_SHAKES}`
          : String(dia.nota_rodape ?? '');

        return {
          ...dia,
          meta_kcal: metaKcal,
          kcal_planejadas: Math.round(kcalPlanejadas),
          calorias_livres: caloriasLivres,
          nota_salada: NOTA_SALADA,
          nota_rodape: notaRodape,
          refeicoes,
        };
      }),
  };
}

function gerarFallback(metaKcal: number, objetivo: string, produtos: any[], receitas: any[], requisicao: any, perfilCliente: any) {
  const refeicoes = refeicoesSelecionadas(requisicao.padrao_refeicoes);
  const metas = metasMacros(metaKcal, perfilCliente);

  const planoBase = adaptarParaApp({
    objetivo_estabelecido: objetivo,
    kcal_diaria_meta: metaKcal,
    metas_macros_diarias: metas,
    dias: DIAS_SEMANA.map((dia, diaIndex) => ({
      dia: dia as any,
      meta_kcal: metaKcal,
      kcal_planejadas: 0,
      calorias_livres: metaKcal,
      nota_salada: NOTA_SALADA,
      nota_rodape: '',
      refeicoes: refeicoes.map((nome, refeicaoIndex) => {
        const produto = produtos.filter(item => produtoPermitidoNaRefeicao(item, nome))[(diaIndex + refeicaoIndex) % Math.max(1, produtos.filter(item => produtoPermitidoNaRefeicao(item, nome)).length)];
        const receita = receitas.filter(item => item.tipo_refeicao === tipoReceitaExterna(nome))[(diaIndex + refeicaoIndex) % Math.max(1, receitas.filter(item => item.tipo_refeicao === tipoReceitaExterna(nome)).length)];

        if (produto) {
          const item = itemProdutoParaContexto(produto);
          return {
            nome_refeicao: nome as any,
            titulo_resumo: `${item.nome} (${item.porcao_g}g)`,
            descricao_completa: `${item.nome} (${item.porcao_g}g) - ${item.descricao ?? ''}`.trim(),
            modo_preparo: item.descricao || 'Produto Viva Leve pronto para consumo conforme orientacao da embalagem.',
            kcal_total: item.kcal_por_porcao,
            carb_total: item.carb_por_porcao,
            prot_total: item.prot_por_porcao,
            gord_total: item.gord_por_porcao,
            produtos_loja_ids: [Number(item.id)],
          };
        }

        if (receita) {
          const item = itemReceitaParaContexto(receita);
          return {
            nome_refeicao: nome as any,
            titulo_resumo: `${item.nome_receita} (Porcao: ${item.porcao}g)`,
            descricao_completa: `${item.nome_receita} (Porcao: ${item.porcao}g) - ${item.modo_preparo ?? ''}`.trim(),
            modo_preparo: item.modo_preparo || 'Preparo simples conforme receita externa cadastrada.',
            kcal_total: item.kcal_por_porcao,
            carb_total: item.carb_por_porcao,
            prot_total: item.prot_por_porcao,
            gord_total: item.gord_por_porcao,
            produtos_loja_ids: [],
          };
        }

        const kcal = Math.round(metaKcal / refeicoes.length);
        return {
          nome_refeicao: nome as any,
          titulo_resumo: `${nome}: refeicao equilibrada`,
          descricao_completa: `${nome}: refeicao externa equilibrada conforme preferencias do usuario.`,
          modo_preparo: 'Montar a refeicao com alimentos preferidos do usuario, respeitando porcoes humanas e equilibrio de macros.',
          kcal_total: kcal,
          carb_total: Math.round((kcal * 0.5) / 4),
          prot_total: Math.round((kcal * 0.25) / 4),
          gord_total: Math.round((kcal * 0.25) / 9),
          produtos_loja_ids: [],
        };
      }),
    })),
  }, metaKcal);

  return reforcarPlano(planoBase, metas, receitas);
}

async function salvarPlanoGerado(supabase: any, requisicao: any, plano: any) {
  const { error: insertError } = await supabase.from('planos_gerados').insert([{
    user_id: requisicao.user_id,
    requisicao_id: requisicao.id,
    data_plano: new Date().toISOString().slice(0, 10),
    objetivo_estabelecido: plano.objetivo_estabelecido ?? requisicao.objetivo,
    kcal_diaria_meta: Number(plano.kcal_diaria_meta ?? 2000),
    plano_semanal: plano.dias ?? plano.plano_semanal ?? plano,
  }]);

  if (insertError) throw insertError;

  const { error: updateError } = await supabase
    .from('planos_requisicoes')
    .update({ status: 'concluido' })
    .eq('id', requisicao.id);

  if (updateError) throw updateError;
}

function montarSystemPrompt() {
  return `Voce e um Nutricionista Especialista da Viva Leve. Atue com rigor clinico, matematico e anti-alucinacao.

REGRAS ESTRITAS:
1. Retorne apenas o objeto validado pelo schema. Nao use markdown.
2. Monte exatamente 7 dias: Segunda, Terca, Quarta, Quinta, Sexta, Sabado, Domingo.
3. Use apenas e estritamente as refeicoes selecionadas pelo usuario. Nao force 6 refeicoes. Minimo de 3 refeicoes.
4. Respeite preferencias e preferencias.outros como prioridade alimentar.
5. Se houver receita_url, analise a imagem. Restricoes, alergias, metas e orientacoes medicas da imagem tem soberania absoluta.
6. Produtos da loja NAO sao obrigatorios. Use produtos da loja apenas quando forem a melhor opcao nutricional para aquela refeicao.
7. Produtos da loja permitidos: Marmitas exclusivamente em Almoco ou Jantar; Caldos exclusivamente em Ceia. E proibido usar suplementos, whey, lanches, doces, bebidas, moda fitness ou qualquer outro produto da loja no plano.
8. Para produtos da loja permitidos, use exatamente nome, descricao, porcao_g e macros por porcao informados no contexto. Nao invente produto, ingrediente, porcao ou macro.
9. Se nao houver marmita ou caldo adequado, use receitas_externas normalmente.
10. Cafe da Manha: alimentos matinais coerentes, ricos em proteinas e gorduras saudaveis, com volume humano. Nunca use marmita, caldo, arroz, feijao, macarrao ou pote de suplemento.
11. Lanches: refeicoes leves, rapidas e faceis de consumir. Nunca use marmita, caldo, prato completo ou grandes quantidades de suplemento.
12. Almoco e Jantar: refeicoes completas, equilibradas e nutricionalmente adequadas. Marmitas podem entrar aqui se forem a melhor opcao.
13. Ceia: refeicoes leves, de facil digestao, preferencialmente com mais gorduras boas e menor carga de carboidratos. Caldos podem entrar aqui se forem adequados.
14. Antes de finalizar cada refeicao, valide se ela e compativel com horario, contexto e volume humano. Se parecer estranho para uma pessoa comer naquele horario, substitua por uma receita externa adequada.
15. Para receitas_externas, use exatamente a porcao e os macros por porcao calculados no contexto. E proibido alterar gramatura, calorias ou macros estaticos.
16. Se uma porcao nao bater a meta, escolha outro item ou empilhe multiplos alimentos logicos. Nunca aumente uma porcao fixa.
17. Empilhamento logico: refeicao pode conter marmita + acompanhamento simples apenas no Almoco/Jantar. Para lanches, combine alimentos externos leves e coerentes.
18. Limite 950 kcal por refeicao. Se a meta diaria ainda nao fechar, deixe saldo em calorias_livres.
19. O total do dia NUNCA pode ultrapassar meta_kcal + 90 kcal. Exemplo: meta 2334 permite no maximo 2424 kcal planejadas.
20. Trabalhe para chegar o mais proximo possivel de meta_kcal sem ultrapassar meta_kcal + 90.
21. Metas de macros obrigatorias: proteinas = 2g por kg do usuario; gorduras = 1g por kg do usuario; carboidratos = calorias restantes da meta diaria dividido por 4.
22. Ajuste as escolhas para aproximar proteinas, gorduras e carboidratos dessas metas. Nao use calorias acima do limite para tentar fechar macros.
23. kcal_total, carb_total, prot_total e gord_total de cada refeicao devem ser a soma exata dos componentes descritos.
24. kcal_planejadas deve ser a soma exata das refeicoes do dia. calorias_livres = meta_kcal - kcal_planejadas.
25. Antirrepeticao: nao repita o mesmo prato, marmita ou combinacao em refeicoes ou dias sequenciais.
26. Para ganho de massa, priorize alta densidade calorica sem criar porcoes absurdas. Para perda de peso, priorize alto volume e baixa densidade calorica.
27. Se calorias_livres > 200, use nota_rodape recomendando complemento com shakes/vitaminas caseiras e inclua este link: ${LINK_SHAKES}
28. nota_salada deve ser exatamente: "${NOTA_SALADA}".
29. produtos_loja_ids deve conter todos os IDs dos produtos da loja usados naquela refeicao; vazio para refeicao totalmente externa.
30. titulo_resumo deve conter somente o nome curto da refeicao/receita e porcao principal. Nao coloque modo de preparo neste campo.
31. descricao_completa deve detalhar itens, marcas, porcoes e componentes usados.
32. modo_preparo deve conter apenas preparo, orientacao de consumo ou descricao detalhada para abrir no modal.`;
}

function montarPromptUsuario(contexto: any) {
  return `Gere o Plano Nutri com estes dados reais:
${JSON.stringify(contexto, null, 2)}`;
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const authorization = request.headers.get('authorization');

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase nao configurado no servidor.' }, { status: 500 });
    }
    if (!authorization) {
      return NextResponse.json({ error: 'Usuario nao autenticado.' }, { status: 401 });
    }

    const { requisicaoId, salvarAutomaticamente } = await request.json() as { requisicaoId?: string; salvarAutomaticamente?: boolean };
    if (!requisicaoId) {
      return NextResponse.json({ error: 'requisicaoId e obrigatorio.' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });

    const [{ data: authUser }, { data: isAdmin, error: adminError }, { data: configData }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.rpc('is_viva_leve_admin'),
      supabase.from('app_config').select('valor').eq('chave', 'plano_nutri_modo').maybeSingle(),
    ]);

    const modoAutomatico = (configData?.valor as any)?.modo === 'automatico';
    const userId = authUser?.user?.id;

    const { data: requisicao, error: reqError } = await supabase
      .from('planos_requisicoes')
      .select('*')
      .eq('id', requisicaoId)
      .maybeSingle();

    if (reqError) throw reqError;
    if (!requisicao) return NextResponse.json({ error: 'Requisicao nao encontrada.' }, { status: 404 });

    if (adminError && !modoAutomatico) {
      return NextResponse.json({ error: adminError.message || 'Acesso restrito ao administrador.' }, { status: 403 });
    }
    if (!isAdmin && (!modoAutomatico || requisicao.user_id !== userId)) {
      return NextResponse.json({ error: 'Acesso restrito ao administrador ou ao modo automatico ativo.' }, { status: 403 });
    }

    const refeicoes = refeicoesSelecionadas(requisicao.padrao_refeicoes);
    if (refeicoes.length < 3) {
      return NextResponse.json({ error: 'Selecione pelo menos 3 refeicoes para gerar o Plano Nutri.' }, { status: 400 });
    }

    const [{ data: perfil }, { data: perfilCliente }, { data: produtos, error: produtosError }, { data: receitas, error: receitasError }] = await Promise.all([
      supabase.from('perfis').select('*').eq('id', requisicao.user_id).maybeSingle(),
      supabase.from('perfis_clientes').select('*').eq('id', requisicao.user_id).maybeSingle(),
      supabase
        .from('produtos')
        .select('id,nome,descricao,categoria,porcao_g,kcal,proteinas,carboidratos,gorduras,preco')
        .eq('tipo_produto', 'avulso')
        .eq('ativo', true)
        .gt('estoque', 0)
        .order('categoria', { ascending: true })
        .order('nome', { ascending: true }),
      supabase
        .from('receitas_externas')
        .select('id,tipo_refeicao,nome_receita,modo_preparo,kcal_100g,carb_100g,prot_100g,gord_100g,porcao')
        .order('tipo_refeicao', { ascending: true })
        .order('nome_receita', { ascending: true }),
    ]);

    if (produtosError) throw produtosError;
    if (receitasError) throw receitasError;

    const tdee = calcularTdee(perfil, perfilCliente);
    const metaKcal = metaPorObjetivo(tdee, requisicao.objetivo);
    const metas = metasMacros(metaKcal, perfilCliente);

    const contexto = {
      requisicao: {
        id: requisicao.id,
        objetivo: requisicao.objetivo,
        preferencias: requisicao.preferencias,
        padrao_refeicoes: requisicao.padrao_refeicoes,
        receita_url: requisicao.receita_url,
      },
      usuario: {
        perfil,
        perfilCliente,
        tdee_estimado: tdee,
        meta_kcal: metaKcal,
        metas_macros_diarias: metas,
      },
      refeicoes_selecionadas: refeicoes,
      produtos_ativos_viva_leve: (produtos ?? [])
        .filter(produto => refeicoes.some(refeicao => produtoPermitidoNaRefeicao(produto, refeicao)))
        .map(itemProdutoParaContexto),
      receitas_externas: (receitas ?? [])
        .filter(receita => refeicoes.some(refeicao => tipoReceitaExterna(refeicao) === receita.tipo_refeicao))
        .map(itemReceitaParaContexto),
      densidade_calorica: {
        baixa: 'morango 100g = 32 kcal',
        alta: 'castanha do para 100g = 656 kcal',
      },
    };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const fallback = gerarFallback(metaKcal, requisicao.objetivo, produtos ?? [], receitas ?? [], requisicao, perfilCliente);
      if (salvarAutomaticamente || (!isAdmin && modoAutomatico)) {
        await salvarPlanoGerado(supabase, requisicao, fallback);
        return NextResponse.json({ plano: fallback, status: 'concluido', aviso: 'OPENAI_API_KEY ausente; plano matematico salvo automaticamente.' });
      }
      await supabase.from('planos_requisicoes').update({ status: 'em_revisao' }).eq('id', requisicaoId);
      return NextResponse.json({ plano: fallback, aviso: 'OPENAI_API_KEY ausente; rascunho matematico gerado para revisao.' });
    }

    const prompt = montarPromptUsuario(contexto);
    const messages: any[] = requisicao.receita_url
      ? [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image', image: requisicao.receita_url },
          ],
        }]
      : [{ role: 'user', content: prompt }];

    const { object } = await generateObject({
      model: openai(process.env.OPENAI_MODEL || 'gpt-4o'),
      schema: PlanoNutriSchema,
      system: montarSystemPrompt(),
      messages,
      temperature: 0.15,
      maxRetries: 2,
    });

    const plano = reforcarPlano(
      substituirRefeicoesIncoerentes(adaptarParaApp(object, metaKcal), receitas ?? [], produtos ?? []),
      metas,
      receitas ?? [],
    );

    if (salvarAutomaticamente || (!isAdmin && modoAutomatico)) {
      await salvarPlanoGerado(supabase, requisicao, plano);
      return NextResponse.json({ plano, status: 'concluido' });
    }

    await supabase.from('planos_requisicoes').update({ status: 'em_revisao' }).eq('id', requisicaoId);
    return NextResponse.json({ plano });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro ao gerar plano nutri.' }, { status: 500 });
  }
}
