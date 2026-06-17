import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

function removerFrutasDeAlmocoJantar(texto: unknown) {
  const frutas = /\b(banana|maca|maçã|morango|mamao|mamão|melancia|uva|abacaxi|abacate|laranja|kiwi|melao|melão|pera|goiaba|manga)\b/gi;
  return String(texto ?? '').replace(frutas, 'salada').replace(/\s{2,}/g, ' ').trim();
}

function normalizarPlanoComProdutos(plano: any, produtos: any[]) {
  const mapaProdutos = produtoPorId(produtos);
  const refeicoesComProduto = ['Almoco', 'Jantar', 'Ceia'];
  const dias = Array.isArray(plano?.dias) ? plano.dias : Array.isArray(plano?.plano_semanal) ? plano.plano_semanal : [];

  return {
    ...plano,
    dias: dias.map((dia: any) => ({
      ...dia,
      refeicoes: Array.isArray(dia?.refeicoes) ? dia.refeicoes.map((item: any) => {
        const refeicao = String(item?.refeicao ?? '');
        const produto = item?.produto_id ? mapaProdutos.get(String(item.produto_id)) : null;
        if (!produto) {
          const semProduto = { ...item, produto_id: null };
          if (['Almoco', 'Jantar'].includes(refeicao)) {
            return {
              ...semProduto,
              nome: removerFrutasDeAlmocoJantar(semProduto.nome),
              descricao: removerFrutasDeAlmocoJantar(semProduto.descricao),
            };
          }
          return semProduto;
        }

        if (!refeicoesComProduto.includes(refeicao)) {
          return { ...item, produto_id: null };
        }

        return {
          ...item,
          nome: produto.nome,
          descricao: produto.descricao ?? item.descricao ?? '',
          porcao: `${produto.porcao_g ?? 300}g`,
          kcal: Math.round(Number(produto.kcal ?? item.kcal ?? 0) * (Number(produto.porcao_g ?? 100) / 100)),
          proteinas: Number(produto.proteinas ?? item.proteinas ?? 0),
          carboidratos: Number(produto.carboidratos ?? item.carboidratos ?? 0),
          gorduras: Number(produto.gorduras ?? item.gorduras ?? 0),
          produto_id: produto.id,
        };
      }) : [],
    })),
  };
}

function gerarFallback(metaKcal: number, objetivo: string, produtos: any[], preferencias: any, padrao: any) {
  const dias = ['Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado', 'Domingo'];
  const refeicoes = Object.entries(padrao ?? {}).filter(([, ativo]) => ativo).map(([nome]) => nome);
  const principais = [...(preferencias?.principais ?? []), ...String(preferencias?.outros?.principais ?? '').split(',').map((item: string) => item.trim()).filter(Boolean)];
  const frutas = [...(preferencias?.frutas ?? []), ...String(preferencias?.outros?.frutas ?? '').split(',').map((item: string) => item.trim()).filter(Boolean)];
  const lanches = [...(preferencias?.lanches ?? []), ...String(preferencias?.outros?.lanches ?? '').split(',').map((item: string) => item.trim()).filter(Boolean)];
  const saladas = [...(preferencias?.saladas ?? []), ...String(preferencias?.outros?.saladas ?? '').split(',').map((item: string) => item.trim()).filter(Boolean)];
  const produtosRefeicao = produtos.filter(produto => !/doce|sobremesa|lanche|snack/i.test(`${produto.categoria} ${produto.nome}`));
  const produtosLeves = produtos.filter(produto => /caldo|sopa|lanche|doce|fit|sobremesa/i.test(`${produto.categoria} ${produto.nome}`));

  return {
    objetivo_estabelecido: objetivo,
    kcal_diaria_meta: metaKcal,
    dias: dias.map((dia, idx) => ({
      dia,
      refeicoes: refeicoes.length ? refeicoes.map((refeicao, refIdx) => {
        const produtoDia = produtosRefeicao[(idx + refIdx) % Math.max(produtosRefeicao.length, 1)];
        const produtoLeve = produtosLeves[(idx + refIdx) % Math.max(produtosLeves.length, 1)];
        const usarProduto = produtoDia && ['Almoco', 'Jantar'].includes(refeicao);
        const usarProdutoLeve = produtoLeve && refeicao === 'Ceia';
        const principal = principais[(idx + refIdx) % Math.max(principais.length, 1)] ?? 'Refeicao caseira equilibrada';
        const fruta = frutas[(idx + refIdx) % Math.max(frutas.length, 1)] ?? 'fruta';
        const lanche = lanches[(idx + refIdx) % Math.max(lanches.length, 1)] ?? 'iogurte natural';
        const salada = saladas[(idx + refIdx) % Math.max(saladas.length, 1)] ?? 'salada crua';
        const produtoEscolhido = usarProduto ? produtoDia : usarProdutoLeve ? produtoLeve : null;
        return {
          refeicao,
          nome: produtoEscolhido?.nome ?? (
            refeicao === 'Cafe da Manha' ? `Ovos ou tapioca com ${fruta}` :
            refeicao.includes('Lanche') ? `${lanche} com ${fruta}` :
            refeicao === 'Ceia' ? `Ceia leve com ${fruta} ou iogurte` :
            `${principal} com ${salada}`
          ),
          descricao: produtoEscolhido?.descricao ?? '',
          porcao: produtoEscolhido ? `${produtoEscolhido.porcao_g ?? 300}g` : '1 porcao',
          kcal: produtoEscolhido ? Math.round(Number(produtoEscolhido.kcal ?? 0) * ((Number(produtoEscolhido.porcao_g ?? 100)) / 100)) : Math.round(metaKcal / Math.max(refeicoes.length, 1)),
          proteinas: produtoEscolhido ? Number(produtoEscolhido.proteinas ?? 0) : 25,
          carboidratos: produtoEscolhido ? Number(produtoEscolhido.carboidratos ?? 0) : 45,
          gorduras: produtoEscolhido ? Number(produtoEscolhido.gorduras ?? 0) : 12,
          produto_id: produtoEscolhido?.id ?? null,
        };
      }) : [{
        refeicao: 'Almoco',
        nome: produtosRefeicao[0]?.nome ?? 'Prato equilibrado com frango, arroz e legumes',
        porcao: `${produtosRefeicao[0]?.porcao_g ?? 300}g`,
        kcal: Math.round(metaKcal / 3),
        proteinas: 30,
        carboidratos: 45,
        gorduras: 12,
        produto_id: produtosRefeicao[0]?.id ?? null,
      }],
    })),
  };
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

    const { requisicaoId } = await request.json() as { requisicaoId?: string };
    if (!requisicaoId) {
      return NextResponse.json({ error: 'requisicaoId e obrigatorio.' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });

    const { data: isAdmin, error: adminError } = await supabase.rpc('is_viva_leve_admin');
    if (adminError || !isAdmin) {
      return NextResponse.json({ error: adminError?.message || 'Acesso restrito ao administrador.' }, { status: 403 });
    }

    const { data: requisicao, error: reqError } = await supabase
      .from('planos_requisicoes')
      .select('*')
      .eq('id', requisicaoId)
      .maybeSingle();
    if (reqError) throw reqError;
    if (!requisicao) return NextResponse.json({ error: 'Requisicao nao encontrada.' }, { status: 404 });

    const [{ data: perfil }, { data: perfilCliente }, { data: produtos, error: produtosError }] = await Promise.all([
      supabase.from('perfis').select('*').eq('id', requisicao.user_id).maybeSingle(),
      supabase.from('perfis_clientes').select('*').eq('id', requisicao.user_id).maybeSingle(),
      supabase.from('produtos').select('id,nome,descricao,categoria,porcao_g,kcal,proteinas,carboidratos,gorduras,preco').eq('ativo', true).gt('estoque', 0).order('categoria', { ascending: true }).order('nome', { ascending: true }),
    ]);
    if (produtosError) throw produtosError;

    const tdee = calcularTdee(perfil, perfilCliente);
    const metaKcal = metaPorObjetivo(tdee, requisicao.objetivo);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const fallback = gerarFallback(metaKcal, requisicao.objetivo, produtos ?? [], requisicao.preferencias, requisicao.padrao_refeicoes);
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
    };

    const prompt = `Voce e um nutricionista assistente da Viva Leve. Gere APENAS JSON valido.
Objetivo: criar um plano semanal util, variado, coerente com horarios de refeicao e pronto para revisao humana no painel admin.

Regras obrigatorias:
1. Plano semanal para 7 dias.
2. Se houver receita_url, leia a imagem com prioridade. Se a receita do nutricionista exigir alimento especifico que a Viva Leve nao vende, obedeca a receita e use produto_id null.
3. Se nao houver receita, use a meta calculada: Perda de Peso = TDEE - 23%; Manutencao = TDEE; Ganho de Massa = TDEE + 23%.
4. Use as preferencias selecionadas e tambem preferencias.outros, que traz texto livre separado por virgulas.
5. Leia todos os itens de produtos_ativos_viva_leve, principalmente nome, categoria e descricao. Use a descricao para entender o que o produto realmente contem antes de encaixa-lo em uma refeicao.

Regras de coerencia por refeicao:
- Cafe da Manha: somente itens leves e matinais, como ovos mexidos, paes/torradas, frutas, cafe, vitaminas, tapioca ou aveia. NUNCA colocar marmita de almoco ou prato pesado no cafe da manha.
- Lanche da Manha e Lanche da Tarde: praticos e leves, como frutas com iogurte/castanhas, whey protein, pequenos sanduiches saudaveis, tapioca pequena ou queijo branco.
- Almoco e Jantar: priorize marmitas/refeicoes completas da Viva Leve quando existirem produtos adequados. Nestas refeicoes, adicione no maximo saladas como complemento externo. NAO colocar frutas em almoco ou jantar.
- Ceia: leve e facil de digerir, como caldo leve, cha, fruta pequena ou iogurte. Evite marmitas pesadas.

Regra antirrepeticao:
- E proibido repetir o mesmo prato, mesma combinacao ou mesmo lanche em dias seguidos.
- Intercale proteinas, carboidratos, frutas e lanches. Exemplo: se segunda usa patinho com arroz integral, terca deve usar frango/peixe/ovos com batata, pure, mandioca ou outro acompanhamento.
- Nao use a mesma fruta ou o mesmo lanche todos os dias. O plano deve ser dinamico e prazeroso.

Equilibrio loja x alimentos externos:
- Nao coloque produtos Viva Leve em todas as refeicoes.
- Alimentos naturais e frescos externos devem aparecer normalmente: frutas, ovos, paes, saladas cruas, leite, iogurte, castanhas.
- Produtos da loja so podem aparecer em Almoco, Jantar e Ceia. Nunca use produto_id em Cafe da Manha, Lanche da Manha ou Lanche da Tarde.
- Produtos com produto_id devem corresponder a itens da lista produtos_ativos_viva_leve. Quando usar produto da loja, o campo nome deve ser EXATAMENTE igual ao nome cadastrado do produto, e o campo descricao deve repetir a descricao cadastrada, sem inventar variacoes.
- Alimentos externos devem usar produto_id null.

Retorne no formato:
{"objetivo_estabelecido":"...","kcal_diaria_meta":2000,"dias":[{"dia":"Segunda","refeicoes":[{"refeicao":"Almoco","nome":"...","descricao":"...","porcao":"300g","kcal":420,"proteinas":40,"carboidratos":45,"gorduras":12,"produto_id":123|null}]}]}
Contexto: ${JSON.stringify(contexto).slice(0, 30000)}`;

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

    const plano = normalizarPlanoComProdutos(extrairJson(extrairTextoOpenAI(json)), produtos ?? []);
    await supabase.from('planos_requisicoes').update({ status: 'em_revisao' }).eq('id', requisicaoId);

    return NextResponse.json({ plano });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro ao gerar plano nutri.' }, { status: 500 });
  }
}
