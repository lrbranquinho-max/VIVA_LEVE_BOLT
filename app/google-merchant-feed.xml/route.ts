import { createClient } from '@supabase/supabase-js';

export const revalidate = 3600;

const SITE_URL = 'https://www.vivalevedf.com.br';

interface ProdutoMerchant {
  id: number;
  nome: string | null;
  descricao: string | null;
  preco: number | string | null;
  categoria: string | null;
  estoque: number | string | null;
  estoque_disponivel: number | string | null;
  imagem_url: string | null;
}

function escapeXml(valor: string | number | null | undefined) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textoProduto(valor: string | null | undefined, fallback: string) {
  const limpo = String(valor ?? '').replace(/\s+/g, ' ').trim();
  return limpo || fallback;
}

function precoBRL(valor: number | string | null | undefined) {
  const numero = Number(valor ?? 0);
  return `${(Number.isFinite(numero) ? numero : 0).toFixed(2)} BRL`;
}

function urlAbsoluta(caminho: string) {
  if (/^https?:\/\//i.test(caminho)) return caminho;
  return `${SITE_URL}${caminho.startsWith('/') ? caminho : `/${caminho}`}`;
}

function itemXml(produto: ProdutoMerchant) {
  const titulo = textoProduto(produto.nome, `Produto Viva Leve ${produto.id}`);
  const descricao = textoProduto(produto.descricao, titulo);
  const link = `${SITE_URL}/produto/${produto.id}`;
  const imagem = produto.imagem_url ? urlAbsoluta(produto.imagem_url) : `${SITE_URL}/icon-512x512.png`;
  const disponibilidade = Number(produto.estoque_disponivel ?? produto.estoque ?? 0) > 0 ? 'in_stock' : 'out_of_stock';

  return `
    <item>
      <g:id>${escapeXml(produto.id)}</g:id>
      <g:title>${escapeXml(titulo)}</g:title>
      <g:description>${escapeXml(descricao)}</g:description>
      <g:link>${escapeXml(link)}</g:link>
      <g:image_link>${escapeXml(imagem)}</g:image_link>
      <g:availability>${disponibilidade}</g:availability>
      <g:price>${escapeXml(precoBRL(produto.preco))}</g:price>
      <g:condition>new</g:condition>
      <g:brand>Viva Leve</g:brand>
      <g:product_type>${escapeXml(textoProduto(produto.categoria, 'Comida saudavel'))}</g:product_type>
      <g:identifier_exists>no</g:identifier_exists>
    </item>`;
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response('Supabase nao configurado.', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase
    .from('produtos')
    .select('id, nome, descricao, preco, categoria, estoque, estoque_disponivel, imagem_url')
    .eq('ativo', true)
    .order('nome', { ascending: true });

  if (error) {
    return new Response(`Erro ao gerar feed: ${error.message}`, { status: 500 });
  }

  const itens = ((data ?? []) as ProdutoMerchant[]).map(itemXml).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Viva Leve DF</title>
    <link>${SITE_URL}</link>
    <description>Produtos ativos da loja Viva Leve DF</description>
    ${itens}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
