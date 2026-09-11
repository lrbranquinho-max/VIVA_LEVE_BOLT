import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'produtos-viva-leve';
const BACKUP_TAG = 'storage-cdn-before-2026-09-11';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function slug(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72) || 'produto';
}

function storagePath(publicUrl: string) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const parsed = new URL(publicUrl);
  const position = parsed.pathname.indexOf(marker);
  if (position < 0) throw new Error('A imagem original nao pertence ao bucket oficial.');
  return decodeURIComponent(parsed.pathname.slice(position + marker.length));
}

function encodedPath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function digestPrefix(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

async function renderVariant(baseUrl: string, path: string, width: number, maxBytes: number, qualities: number[]) {
  let selected: Uint8Array | null = null;
  for (const quality of qualities) {
    const url = `${baseUrl}/storage/v1/render/image/public/${BUCKET}/${encodedPath(path)}?width=${width}&resize=contain&quality=${quality}`;
    const response = await fetch(url, { headers: { Accept: 'image/webp' } });
    if (!response.ok) throw new Error(`Falha ao transformar ${path}: HTTP ${response.status}`);
    selected = new Uint8Array(await response.arrayBuffer());
    if (selected.byteLength <= maxBytes) break;
  }
  if (!selected?.byteLength) throw new Error(`Transformacao vazia para ${path}.`);
  return selected;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) throw new Error('Configuracao interna do Supabase ausente.');
    const authorization = request.headers.get('Authorization') || '';
    const token = authorization.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Sessao obrigatoria.' }, 401);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user?.email) return json({ error: 'Sessao invalida.' }, 401);
    const { data: role } = await admin.from('admin_usuario_roles').select('email')
      .eq('email', authData.user.email.toLowerCase()).eq('role', 'admin').eq('ativo', true).maybeSingle();
    if (!role) return json({ error: 'Acesso exclusivo de administrador.' }, 403);

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'report');
    const { data: products, error: productsError } = await admin.from('produtos')
      .select('id,nome,imagem_url,imagem_thumbnail_url,imagem_detalhe_url,ativo')
      .eq('ativo', true).not('imagem_url', 'is', null).order('id');
    if (productsError) throw productsError;

    const { data: manifests, error: manifestsError } = await admin.from('produtos_imagens_variantes')
      .select('produto_id,original_url,thumbnail_url,detalhe_url,original_bytes,thumbnail_bytes,detalhe_bytes,hash,preparado_em,aplicado_em');
    if (manifestsError) throw manifestsError;
    const byProduct = new Map((manifests || []).map(item => [Number(item.produto_id), item]));

    if (action === 'report') {
      return json({ products: products?.length || 0, prepared: manifests?.length || 0, variants: manifests || [] });
    }

    if (action === 'prepare') {
      const limit = Math.min(Math.max(Number(body.limit) || 3, 1), 5);
      const pending = (products || []).filter(product => {
        const manifest = byProduct.get(Number(product.id));
        return !manifest || manifest.original_url !== product.imagem_url;
      }).slice(0, limit);
      const prepared = [];

      for (const product of pending) {
        const originalUrl = String(product.imagem_url);
        const originalPath = storagePath(originalUrl);
        const originalResponse = await fetch(originalUrl);
        if (!originalResponse.ok) throw new Error(`Falha ao baixar original do produto ${product.id}: HTTP ${originalResponse.status}`);
        const originalBuffer = await originalResponse.arrayBuffer();
        const hash = await digestPrefix(originalBuffer);
        const prefix = `produtos/versionados/${slug(product.nome)}-${hash}`;
        const thumbnailPath = `${prefix}-thumb-480.webp`;
        const detailPath = `${prefix}-detail-1200.webp`;
        const [thumbnail, detail] = await Promise.all([
          renderVariant(supabaseUrl, originalPath, 480, 80 * 1024, [78, 68, 58, 48]),
          renderVariant(supabaseUrl, originalPath, 1200, 250 * 1024, [82, 72, 62, 52]),
        ]);

        for (const [path, bytes] of [[thumbnailPath, thumbnail], [detailPath, detail]] as const) {
          const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
            contentType: 'image/webp', cacheControl: '31536000', upsert: false,
          });
          if (error && !/already exists|duplicate/i.test(error.message)) throw error;
        }

        const thumbnailUrl = admin.storage.from(BUCKET).getPublicUrl(thumbnailPath).data.publicUrl;
        const detailUrl = admin.storage.from(BUCKET).getPublicUrl(detailPath).data.publicUrl;
        const { error: backupError } = await admin.from('produtos_imagens_backup').upsert({
          backup_tag: BACKUP_TAG,
          produto_id: product.id,
          imagem_url: product.imagem_url,
          imagem_thumbnail_url: product.imagem_thumbnail_url,
          imagem_detalhe_url: product.imagem_detalhe_url,
        }, { onConflict: 'backup_tag,produto_id', ignoreDuplicates: true });
        if (backupError) throw backupError;
        const manifest = {
          produto_id: product.id,
          original_url: originalUrl,
          thumbnail_url: thumbnailUrl,
          detalhe_url: detailUrl,
          original_path: originalPath,
          thumbnail_path: thumbnailPath,
          detalhe_path: detailPath,
          original_bytes: originalBuffer.byteLength,
          thumbnail_bytes: thumbnail.byteLength,
          detalhe_bytes: detail.byteLength,
          hash,
          preparado_em: new Date().toISOString(),
          aplicado_em: null,
        };
        const { error: manifestError } = await admin.from('produtos_imagens_variantes').upsert(manifest);
        if (manifestError) throw manifestError;
        prepared.push(manifest);
      }

      const remaining = Math.max((products?.length || 0) - (manifests?.length || 0) - prepared.length, 0);
      return json({ prepared, remaining });
    }

    if (action === 'apply') {
      if (body.confirmed !== true) return json({ error: 'Confirmacao explicita obrigatoria.' }, 400);
      const missing = (products || []).filter(product => {
        const manifest = byProduct.get(Number(product.id));
        return !manifest || manifest.original_url !== product.imagem_url;
      });
      if (missing.length) return json({ error: 'Existem produtos sem variantes validadas.', missing: missing.map(item => item.id) }, 409);

      for (const product of products || []) {
        const manifest = byProduct.get(Number(product.id));
        const { error } = await admin.from('produtos').update({
          imagem_thumbnail_url: manifest.thumbnail_url,
          imagem_detalhe_url: manifest.detalhe_url,
        }).eq('id', product.id).eq('imagem_url', product.imagem_url);
        if (error) throw error;
        await admin.from('produtos_imagens_variantes').update({ aplicado_em: new Date().toISOString() }).eq('produto_id', product.id);
      }
      return json({ applied: products?.length || 0, originalsPreserved: true });
    }

    return json({ error: 'Acao invalida.' }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500);
  }
});

