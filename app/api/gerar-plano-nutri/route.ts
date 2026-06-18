import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { criarSupabaseAdmin } from '../../../lib/supabaseAdmin';

export const runtime = 'nodejs';

function parseNumero(valor: unknown) {
  const numero = Number(String(valor ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(numero) ? numero : 0;
}

function calcularTdee(perfil: any, perfilCliente: any) {
  const meta = Number(perfil?.meta_calorias ?? 0);
  if (meta > 0) return meta;

  const peso = parseNumero(perfilCliente?.peso_kg);
  const altura = parseNumero(perfilCliente?.altura_cm);
  const idade = parseNumero(perfilCliente?.idade);
  const sexo = String(perfilCliente?.sexo ?? '');
  if (!peso || !altura || !idade) return 2000;

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

function metaPorObjetivo(tdee: number, objetivo: string) {
  if (objetivo === 'Perda de Peso') return Math.round(tdee * 0.77);
  if (objetivo === 'Ganho de Massa') return Math.round(tdee * 1.23);
  return Math.round(tdee);
}

function extrairTextoOpenAI(resposta: any) {
  if (typeof resposta.output_text === 'string') return resposta.output_text;
  const partes = resposta.output?.flatMap((item: any) => item.content ?? []) ?? [];
  return partes.map((item: any) => item.text ?? '').filter(Boolean).join('\n');
}

function extrairJson(texto: string) {
  const limpo = texto.trim().replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(limpo);
  } catch {
    const inicio = limpo.indexOf('{');
    const fim = limpo.lastIndexOf('}');
    if (inicio >= 0 && fim > inicio) return JSON.parse(limpo.slice(inicio, fim + 1));
    throw new Error('A IA nao retornou um JSON valido.');
  }
}

function produtoPorId(produtos: any[]) {
  return new Map(produtos.map(produto => [String(produto.id), produto]));
}

function receitaPorId(receitas: any[]) {
  return new Map(receitas.map(receita => [String(receita.id), receita]));
}

const ORDEM_REFEICOES = ['Cafe da Manha', 'Lanche da Manha', 'Almoco', 'Lanche da Tarde', 'Jantar', 'Ceia'];

function ordemRefeicao(refeicao: unknown) {
  const texto = String(refeicao ?? '');
  const index = ORDEM_REFEICOES.indexOf(texto);
  return index >= 0 ? index : ORDEM_REFEICOES.length;
}

function tipoExternoParaRefeicao(refeicao: string) {
  if (refeicao === 'Cafe da Manha') return 'Cafe da Manha';
  if (refeicao === 'Lanche da Manha' || refeicao === 'Lanche da Tarde') return 'Lanche';
  if (refeicao === 'Almoco' || refeicao === 'Jantar') return 'Almoco_Jantar';
  if (refeicao === 'Ceia') return 'Ceia';
  return '';
}

function categoriaProduto(produto: any) {
  return String(produto?.categoria ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function produtoPermitidoNaRefeicao(produto: any, refeicao: string) {
  const categoria = categoriaProduto(produto);
  if (categoria.includes('marmita')) return ['Almoco', 'Jantar'].includes(refeicao);
  if (categoria.includes('lanche') || categoria.includes('suplemento')) return ['Cafe da Manha', 'Lanche da Manha', 'Lanche da Tarde'].includes(refeicao);
  if (categoria.includes('caldo')) return ['Jantar', 'Ceia'].includes(refeicao);
  return ['Almoco', 'Jantar', 'Ceia'].includes(refeicao);
}

function gramasDoItem(item: any, fallback = 100) {
  const direto = Number(item?.gramas);
  if (Number.isFinite(direto) && direto > 0) return Math.round(direto);
  const texto = `${item?.porcao ?? ''} ${item?.nome ?? ''}`;
  const match = texto.match(/(\d+(?:[,.]\d+)?)\s*g/i);
  if (match) {
    const gramas = Number(match[1].replace(',', '.'));
    if (Number.isFinite(gramas) && gramas > 0) return Math.round(gramas);
  }
  return fallback;
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

function removerFrutasDeAlmocoJantar(texto: unknown) {
  const frutas = /\b(banana|maca|maçã|morango|mamao|mamão|melancia|uva|abacaxi|abacate|laranja|kiwi|melao|melão|pera|goiaba|manga)\b/gi;
  return String(texto ?? '').replace(frutas, 'salada').replace(/\s{2,}/g, ' ').trim();
}

function normalizarPlano(plano: any, produtos: any[], receitas: any[]) {
  const mapaProdutos = produtoPorId(produtos);
  const mapaReceitas = receitaPorId(receitas);
  const refeicoesComProduto = ['Almoco', 'Jantar', 'Ceia'];
  const dias = Array.isArray(plano?.dias) ? plano.dias : Array.isArray(plano?.plano_semanal) ? plano.plano_semanal : [];

  return {
    ...plano,
    dias: dias.map((dia: any) => ({
      ...dia,
      refeicoes: Array.isArray(dia?.refeicoes) ? dia.refeicoes.map((item: any) => {
        const refeicao = String(item?.refeicao ?? '');
        const produto = item?.produto_id ? mapaProdutos.get(String(item.produto_id)) : null;
        const receita = item?.receita_externa_id ? mapaReceitas.get(String(item.receita_externa_id)) : null;

        if (receita) {
          const tipoEsperado = tipoExternoParaRefeicao(refeicao);
          if (receita.tipo_refeicao === tipoEsperado) {
            const gramas = gramasDoItem(item, 100);
            const macros = macrosPorGramas(receita, gramas);
            return {
              ...item,
              nome: `${receita.nome_receita} (${gramas}g)`,
              descricao: receita.modo_preparo ?? '',
              modo_preparo: receita.modo_preparo ?? '',
              porcao: `${gramas}g`,
              gramas,
              ...macros,
              produto_id: null,
              receita_externa_id: receita.id,
            };
          }
        }

        if (!produto) {
          const gramas = gramasDoItem(item, 100);
          const semProduto = { ...item, gramas, porcao: item?.porcao ?? `${gramas}g`, produto_id: null, receita_externa_id: null };
          if (['Almoco', 'Jantar'].includes(refeicao)) {
            return {
              ...semProduto,
              nome: removerFrutasDeAlmocoJantar(semProduto.nome),
              descricao: removerFrutasDeAlmocoJantar(semProduto.descricao),
            };
          }
          return semProduto;
        }

        if (!refeicoesComProduto.includes(refeicao) || !produtoPermitidoNaRefeicao(produto, refeicao)) {
          return { ...item, produto_id: null, receita_externa_id: null };
        }

        const gramas = Number(produto.porcao_g ?? 300) || 300;
        return {
          ...item,
          nome: `${produto.nome} (${gramas}g)`,
          descricao: produto.descricao ?? item.descricao ?? '',
          modo_preparo: produto.descricao ?? item.modo_preparo ?? '',
          porcao: `${gramas}g`,
          gramas,
          kcal: Math.round(Number(produto.kcal ?? item.kcal ?? 0) * (gramas / 100)),
          proteinas: Number(produto.proteinas ?? item.proteinas ?? 0),
          carboidratos: Number(produto.carboidratos ?? item.carboidratos ?? 0),
          gorduras: Number(produto.gorduras ?? item.gorduras ?? 0),
          produto_id: produto.id,
          receita_externa_id: null,
        };
      }).sort((a: any, b: any) => ordemRefeicao(a.refeicao) - ordemRefeicao(b.refeicao)) : [],
    })),
  };
}

function receitasPorTipo(receitas: any[], tipo: string) {
  return receitas.filter(receita => receita.tipo_refeicao === tipo);
}

function gerarFallback(metaKcal: number, objetivo: string, produtos: any[], receitas: any[], preferencias: any, padrao: any) {
  const dias = ['Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado', 'Domingo'];
  const refeicoes = Object.entries(padrao ?? {})
    .filter(([, ativo]) => ativo)
    .map(([nome]) => nome)
    .sort((a, b) => ordemRefeicao(a) - ordemRefeicao(b));
  const principais = [...(preferencias?.principais ?? []), ...String(preferencias?.outros?.principais ?? '').split(',').map((item: string) => item.trim()).filter(Boolean)];
  const frutas = [...(preferencias?.frutas ?? []), ...String(preferencias?.outros?.frutas ?? '').split(',').map((item: string) => item.trim()).filter(Boolean)];
  const lanches = [...(preferencias?.lanches ?? []), ...String(preferencias?.outros?.lanches ?? '').split(',').map((item: string) => item.trim()).filter(Boolean)];
  const saladas = [...(preferencias?.saladas ?? []), ...String(preferencias?.outros?.saladas ?? '').split(',').map((item: string) => item.trim()).filter(Boolean)];
  const produtosPorRefeicao = (refeicao: string) => produtos.filter(produto => produtoPermitidoNaRefeicao(produto, refeicao));

  return {
    objetivo_estabelecido: objetivo,
    kcal_diaria_meta: metaKcal,
    dias: dias.map((dia, idx) => ({
      dia,
      refeicoes: refeicoes.length ? refeicoes.map((refeicao, refIdx) => {
        const produtosValidos = produtosPorRefeicao(refeicao);
        const produtoDia = produtosValidos[(idx + refIdx) % Math.max(produtosValidos.length, 1)];
        const tipoReceita = tipoExternoParaRefeicao(refeicao);
        const receitasValidas = receitasPorTipo(receitas, tipoReceita);
        const receita = receitasValidas[(idx + refIdx) % Math.max(receitasValidas.length, 1)];
        const usarProduto = produtoDia && (idx + refIdx) % 2 === 0;
        const principal = principais[(idx + refIdx) % Math.max(principais.length, 1)] ?? 'Refeicao caseira equilibrada';
        const fruta = frutas[(idx + refIdx) % Math.max(frutas.length, 1)] ?? 'fruta';
        const lanche = lanches[(idx + refIdx) % Math.max(lanches.length, 1)] ?? 'iogurte natural';
        const salada = saladas[(idx + refIdx) % Math.max(saladas.length, 1)] ?? 'salada crua';
        const produtoEscolhido = usarProduto ? produtoDia : null;
        const receitaEscolhida = produtoEscolhido ? null : receita;
        const gramas = produtoEscolhido ? Number(produtoEscolhido.porcao_g ?? 300) || 300 : receitaEscolhida ? 120 : 100;
        const macrosReceita = receitaEscolhida ? macrosPorGramas(receitaEscolhida, gramas) : null;
        return {
          refeicao,
          nome: produtoEscolhido ? `${produtoEscolhido.nome} (${gramas}g)` : receitaEscolhida ? `${receitaEscolhida.nome_receita} (${gramas}g)` : (
            refeicao === 'Cafe da Manha' ? `Ovos ou tapioca com ${fruta}` :
            refeicao.includes('Lanche') ? `${lanche} com ${fruta}` :
            refeicao === 'Ceia' ? `Ceia leve com ${fruta} ou iogurte` :
            `${principal} com ${salada}`
          ),
          descricao: produtoEscolhido?.descricao ?? receitaEscolhida?.modo_preparo ?? '',
          modo_preparo: produtoEscolhido?.descricao ?? receitaEscolhida?.modo_preparo ?? '',
          porcao: `${gramas}g`,
          gramas,
          kcal: produtoEscolhido ? Math.round(Number(produtoEscolhido.kcal ?? 0) * (gramas / 100)) : macrosReceita?.kcal ?? Math.round(metaKcal / Math.max(refeicoes.length, 1)),
          proteinas: produtoEscolhido ? Number(produtoEscolhido.proteinas ?? 0) : macrosReceita?.proteinas ?? 25,
          carboidratos: produtoEscolhido ? Number(produtoEscolhido.carboidratos ?? 0) : macrosReceita?.carboidratos ?? 45,
          gorduras: produtoEscolhido ? Number(produtoEscolhido.gorduras ?? 0) : macrosReceita?.gorduras ?? 12,
          produto_id: produtoEscolhido?.id ?? null,
          receita_externa_id: receitaEscolhida?.id ?? null,
        };
      }) : [{
        refeicao: 'Almoco',
        nome: produtosPorRefeicao('Almoco')[0]?.nome ?? 'Prato equilibrado com frango, arroz e legumes',
        porcao: `${produtosPorRefeicao('Almoco')[0]?.porcao_g ?? 300}g`,
        kcal: Math.round(metaKcal / 3),
        proteinas: 30,
        carboidratos: 45,
        gorduras: 12,
        produto_id: produtosPorRefeicao('Almoco')[0]?.id ?? null,
      }],
    })),
  };
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

    const [{ data: perfil }, { data: perfilCliente }, { data: produtos, error: produtosError }, { data: receitas, error: receitasError }] = await Promise.all([
      supabase.from('perfis').select('*').eq('id', requisicao.user_id).maybeSingle(),
      supabase.from('perfis_clientes').select('*').eq('id', requisicao.user_id).maybeSingle(),
      supabase.from('produtos').select('id,nome,descricao,categoria,porcao_g,kcal,proteinas,carboidratos,gorduras,preco').eq('ativo', true).gt('estoque', 0).order('categoria', { ascending: true }).order('nome', { ascending: true }),
      supabase.from('receitas_externas').select('id,tipo_refeicao,nome_receita,modo_preparo,kcal_100g,carb_100g,prot_100g,gord_100g').order('tipo_refeicao', { ascending: true }).order('nome_receita', { ascending: true }),
    ]);
    if (produtosError) throw produtosError;
    if (receitasError) throw receitasError;

    const tdee = calcularTdee(perfil, perfilCliente);
    const metaKcal = metaPorObjetivo(tdee, requisicao.objetivo);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const fallback = normalizarPlano(gerarFallback(metaKcal, requisicao.objetivo, produtos ?? [], receitas ?? [], requisicao.preferencias, requisicao.padrao_refeicoes), produtos ?? [], receitas ?? []);
      if (salvarAutomaticamente || (!isAdmin && modoAutomatico)) {
        await salvarPlanoGerado(isAdmin ? supabase : criarSupabaseAdmin(), requisicao, fallback);
        return NextResponse.json({ plano: fallback, status: 'concluido', aviso: 'OPENAI_API_KEY ausente; plano matematico salvo automaticamente.' });
      }
      await supabase.from('planos_requisicoes').update({ status: 'em_revisao' }).eq('id', requisicaoId);
      return NextResponse.json({ plano: fallback, aviso: 'OPENAI_API_KEY ausente; rascunho matematico gerado para revisao.' });
    }

    const contexto = {
      requisicao,
      perfil,
      perfilCliente,
      tdee_estimado: tdee,
      kcal_meta_por_objetivo: metaKcal,
      produtos_ativos_viva_leve: produtos ?? [],
      receitas_externas: receitas ?? [],
    };

    const prompt = `Voce e um nutricionista assistente da Viva Leve. Gere APENAS JSON valido.
Objetivo: criar um plano semanal util, variado, coerente com horarios de refeicao e pronto para revisao humana no painel admin.

Regras obrigatorias:
1. Plano semanal para 7 dias.
2. Se houver receita_url, leia a imagem com prioridade. Se a receita do nutricionista exigir alimento especifico que a Viva Leve nao vende, obedeca a receita e use produto_id null.
3. Se nao houver receita, use a meta calculada: Perda de Peso = TDEE - 23%; Manutencao = TDEE; Ganho de Massa = TDEE + 23%.
4. Use as preferencias selecionadas e tambem preferencias.outros, que traz texto livre separado por virgulas.
5. Leia todos os itens de produtos_ativos_viva_leve, principalmente nome, categoria e descricao. Use a descricao para entender o que o produto realmente contem antes de encaixa-lo em uma refeicao.
6. Leia receitas_externas e use apenas receitas cujo tipo_refeicao seja compativel com a refeicao.
7. Ordem obrigatoria do array refeicoes em cada dia: Cafe da Manha, Lanche da Manha, Almoco, Lanche da Tarde, Jantar, Ceia. Omita somente refeicoes desmarcadas pelo usuario.

Regras de coerencia por refeicao:
- Cafe da Manha: somente itens leves e matinais, como ovos mexidos, paes/torradas, frutas, cafe, vitaminas, tapioca ou aveia. NUNCA colocar marmita de almoco ou prato pesado no cafe da manha.
- Lanche da Manha e Lanche da Tarde: praticos e leves, como frutas com iogurte/castanhas, whey protein, pequenos sanduiches saudaveis, tapioca pequena ou queijo branco.
- Almoco e Jantar: priorize marmitas/refeicoes completas da Viva Leve quando existirem produtos adequados. Nestas refeicoes, adicione no maximo saladas como complemento externo. NAO colocar frutas em almoco ou jantar.
- Ceia: leve e facil de digerir, como caldo leve, cha, fruta pequena ou iogurte. Evite marmitas pesadas.

Uso exclusivo de produtos da loja:
- Categoria Marmitas: SOMENTE Almoco e Jantar. NUNCA Cafe da Manha, Lanche ou Ceia.
- Categorias Lanches Rapidos e Suplementos: SOMENTE Cafe da Manha, Lanche da Manha ou Lanche da Tarde.
- Categoria Caldos: SOMENTE Jantar ou Ceia. NUNCA Almoco.
- Se o produto nao encaixar pela categoria e horario, nao use produto_id.

Uso da tabela receitas_externas:
- Cafe da Manha usa apenas receitas_externas.tipo_refeicao = "Cafe da Manha".
- Lanche da Manha e Lanche da Tarde usam apenas tipo_refeicao = "Lanche".
- Almoco e Jantar usam apenas tipo_refeicao = "Almoco_Jantar".
- Ceia usa apenas tipo_refeicao = "Ceia".
- Mescle produtos da loja com receitas_externas para variar o plano. O mesmo almoco ou jantar em dias seguidos, mesmo com gramatura diferente, e proibido.

Regra antirrepeticao:
- E proibido repetir o mesmo prato, mesma combinacao ou mesmo lanche em dias seguidos.
- Intercale proteinas, carboidratos, frutas e lanches. Exemplo: se segunda usa patinho com arroz integral, terca deve usar frango/peixe/ovos com batata, pure, mandioca ou outro acompanhamento.
- Nao use a mesma fruta ou o mesmo lanche todos os dias. O plano deve ser dinamico e prazeroso.
- Nao faca combinacoes bizarras. Exemplo proibido: "ovos com abacaxi" como prato unico. Se houver dois itens de categorias diferentes, separe de forma logica: "Ovos mexidos (100g) + abacaxi em cubos (80g)".
- Todo nome deve trazer gramatura visivel. Exemplos: "Escondidinho de Frango Viva Leve (300g)", "Iogurte natural (170g) + morango (80g)".

Equilibrio loja x alimentos externos:
- Nao coloque produtos Viva Leve em todas as refeicoes.
- Alimentos naturais e frescos externos devem aparecer normalmente: frutas, ovos, paes, saladas cruas, leite, iogurte, castanhas.
- Produtos da loja devem obedecer as categorias permitidas por refeicao. Nunca use marmita em Cafe da Manha, Lanche da Manha ou Lanche da Tarde.
- Produtos com produto_id devem corresponder a itens da lista produtos_ativos_viva_leve. Quando usar produto da loja, o campo nome deve ser EXATAMENTE igual ao nome cadastrado do produto, e o campo descricao deve repetir a descricao cadastrada, sem inventar variacoes.
- Receitas externas devem usar produto_id null e receita_externa_id com o id real de receitas_externas.
- Alimentos externos livres devem usar produto_id null e receita_externa_id null.

Retorne no formato:
{"objetivo_estabelecido":"...","kcal_diaria_meta":2000,"dias":[{"dia":"Segunda","refeicoes":[{"refeicao":"Almoco","nome":"... (300g)","descricao":"...","modo_preparo":"...","porcao":"300g","gramas":300,"kcal":420,"proteinas":40,"carboidratos":45,"gorduras":12,"produto_id":123|null,"receita_externa_id":"uuid"|null}]}]}
Contexto: ${JSON.stringify(contexto).slice(0, 50000)}`;

    const content: any[] = [{ type: 'input_text', text: prompt }];
    if (requisicao.receita_url) {
      content.push({ type: 'input_image', image_url: requisicao.receita_url });
    }

    const resposta = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        input: [{ role: 'user', content }],
        temperature: 0.35,
      }),
    });

    const json = await resposta.json();
    if (!resposta.ok) {
      throw new Error(json.error?.message || 'Erro ao chamar OpenAI.');
    }

    const plano = normalizarPlano(extrairJson(extrairTextoOpenAI(json)), produtos ?? [], receitas ?? []);
    if (salvarAutomaticamente || (!isAdmin && modoAutomatico)) {
      await salvarPlanoGerado(isAdmin ? supabase : criarSupabaseAdmin(), requisicao, plano);
      return NextResponse.json({ plano, status: 'concluido' });
    }
    await supabase.from('planos_requisicoes').update({ status: 'em_revisao' }).eq('id', requisicaoId);

    return NextResponse.json({ plano });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro ao gerar plano nutri.' }, { status: 500 });
  }
}
