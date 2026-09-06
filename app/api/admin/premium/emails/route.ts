import {NextRequest} from 'next/server';import {premiumAdmin,premiumFailure,premiumResponse} from '@/lib/premium/server';import {processPremiumEmailOutbox} from '@/lib/premium/email';
export async function POST(request:NextRequest){try{await premiumAdmin(request);return premiumResponse(await processPremiumEmailOutbox());}catch(error){return premiumFailure(error);}}
