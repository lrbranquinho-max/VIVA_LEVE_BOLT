import 'server-only';
import { CompanySettings, DEFAULT_COMPANY } from './company';

export async function getCompanySettingsServer(): Promise<CompanySettings> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return DEFAULT_COMPANY;
  try {
    const response = await fetch(`${base}/rest/v1/empresas?select=*&ativo=eq.true&principal=eq.true&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 300, tags: ['company-settings'] },
    });
    if (!response.ok) return DEFAULT_COMPANY;
    const [company] = await response.json() as CompanySettings[];
    return company ? { ...DEFAULT_COMPANY, ...company, valores: Array.isArray(company.valores) ? company.valores : [] } : DEFAULT_COMPANY;
  } catch { return DEFAULT_COMPANY; }
}
