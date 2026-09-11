export const MAX_PRODUCT_IMAGE_UPLOAD_BYTES = 3 * 1024 * 1024;
export const PRODUCT_IMAGE_CACHE_CONTROL_SECONDS = '31536000';

export interface ProductImageVariant {
  blob: Blob;
  path: string;
  contentType: string;
}

export interface OptimizedProductImages {
  hash: string;
  original: ProductImageVariant;
  thumbnail: ProductImageVariant;
  detail: ProductImageVariant;
}

function extensionFor(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(fromName)) return fromName;
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/avif') return 'avif';
  return 'png';
}

async function sha256Prefix(file: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('O navegador nao conseguiu gerar a imagem WebP.')),
      'image/webp',
      quality,
    );
  });
}

async function webpVariant(
  bitmap: ImageBitmap,
  maxDimension: number,
  targetMaxBytes: number,
) {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('Nao foi possivel preparar a imagem neste navegador.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);

  let selected = await canvasToBlob(canvas, 0.82);
  for (const quality of [0.74, 0.66, 0.58, 0.5, 0.42]) {
    if (selected.size <= targetMaxBytes) break;
    selected = await canvasToBlob(canvas, quality);
  }
  return selected;
}

export async function optimizeProductImage(file: File, baseName: string): Promise<OptimizedProductImages> {
  if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem valido.');
  if (file.size > MAX_PRODUCT_IMAGE_UPLOAD_BYTES) throw new Error('A imagem deve ter no maximo 3 MB.');

  const hash = await sha256Prefix(file);
  const bitmap = await createImageBitmap(file);
  try {
    const [thumbnailBlob, detailBlob] = await Promise.all([
      webpVariant(bitmap, 480, 80 * 1024),
      webpVariant(bitmap, 1200, 250 * 1024),
    ]);
    const prefix = `produtos/versionados/${baseName}-${hash}`;
    return {
      hash,
      original: {
        blob: file,
        path: `${prefix}-original.${extensionFor(file)}`,
        contentType: file.type || 'application/octet-stream',
      },
      thumbnail: {
        blob: thumbnailBlob,
        path: `${prefix}-thumb-480.webp`,
        contentType: 'image/webp',
      },
      detail: {
        blob: detailBlob,
        path: `${prefix}-detail-1200.webp`,
        contentType: 'image/webp',
      },
    };
  } finally {
    bitmap.close();
  }
}

