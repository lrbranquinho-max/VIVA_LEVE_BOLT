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

function gerarFallback(metaKcal: number, objetivo: string, produtos: any[], preferencias: any, padrao: any) {
  const dias = ['Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado', 'Domingo'];
  const refeicoes = Object.entries(padrao ?? {}).filter(([, ativo]) => ativo).map(([nome]) => nome);
  const produtoPrincipal = produtos[0];

  return {
    objetivo_estabelecido: objetivo,
    kcal_diaria_meta: metaKcal,
    dias: dias.map((dia, idx) => ({
      dia,
      refeicoes: refeicoes.length ? refeicoes.map((refeicao, refIdx) => {
        const usarProduto = produtoPrincipal && ['Almoco', 'Jantar', 'Ceia'].includes(refeicao);
        return {
          refeicao,
          nome: usarProduto ? produtoPrincipal.nome : `${preferencias?.principais?.[refIdx] ?? 'Refeicao caseira equilibrada'} com ${preferencias?.frutas?.[0] ?? 'fruta'}`,
          porcao: usarProduto ? `${produtoPrincipal.porcao_g ?? 300}g` : '1 porcao',
          kcal: usarProduto ? Number(produtoPrincipal.kcal ?? 0) * ((Number(produtoPrincipal.porcao_g ?? 100)) / 100) : Math.round(metaKcal / Math.max(refeicoes.length, 1)),
          proteinas: usarProduto ? Number(produtoPrincipal.proteinas ?? 0) : 25,
          carboidratos: usarProduto ? Number(produtoPrincipal.carboidratos ?? 0) : 45,
          gorduras: usarProduto ? Number(produtoPrincipal.gorduras ?? 0) : 12,
          produto_id: usarProduto ? produtoPrincipal.id : null,
        };
      }) : [{
        refeicao: 'Almoco',
        nome: produtoPrincipal?.nome ?? 'Prato equilibrado Viva Leve',
        porcao: `${produtoPrincipal?.porcao_g ?? 300}g`,
        kcal: Math.round(metaKcal / 3),
        proteinas: 30,
        carboidratos: 45,
        gorduras: 12,
        produto_id: produtoPrincipal?.id ?? null,
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
      supabase.from('produtos').select('id,nome,descricao,categoria,porcao_g,kcal,proteinas,carboidratos,gorduras,preco').eq('ativo', true).gt('estoque', 0).limit(40),
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
Regras:
- Plano semanal para 7 dias.
- Priorize produtos ativos da loja em almoco, jantar e ceia quando fizer sentido.
- Misture alimentos caseiros nas demais refeicoes.
- Se houver receita_url, considere que ela pode conter orientacoes de nutricionista e respeite macros/kcal quando legiveis.
- Objetivo: Perda de Peso = TDEE - 23%; Manutencao = TDEE; Ganho de Massa = TDEE + 23%.
- Retorne no formato:
{"objetivo_estabelecido":"...","kcal_diaria_meta":2000,"dias":[{"dia":"Segunda","refeicoes":[{"refeicao":"Almoco","nome":"...","porcao":"300g","kcal":420,"proteinas":40,"carboidratos":45,"gorduras":12,"produto_id":123|null}]}]}
Contexto: ${JSON.stringify(contexto).slice(0, 15000)}`;

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

    const plano = extrairJson(extrairTextoOpenAI(json));
    await supabase.from('planos_requisicoes').update({ status: 'em_revisao' }).eq('id', requisicaoId);

    return NextResponse.json({ plano });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro ao gerar plano nutri.' }, { status: 500 });
  }
}
