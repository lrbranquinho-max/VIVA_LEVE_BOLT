import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { criarSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const corpoSchema = z.object({ sessaoId: z.string().uuid() }).strict();

export async function POST(request: NextRequest) {
  try {
    const corpo = corpoSchema.parse(await request.json());
    const { error } = await criarSupabaseAdmin()
      .from('loja_acessos')
      .insert({ sessao_id: corpo.sessaoId });

    if (error && error.code !== '23505') throw error;
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Identificador de sessão inválido.' }, { status: 400 });
    }
    console.error('Falha ao registrar acesso à loja:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Não foi possível registrar o acesso.' }, { status: 500 });
  }
}
