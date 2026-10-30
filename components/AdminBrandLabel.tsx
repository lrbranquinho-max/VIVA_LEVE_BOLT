'use client';

import { useCompanySettings } from './CompanySettingsProvider';

export default function AdminBrandLabel({ className = 'text-xs font-black uppercase text-viva-roxo' }: { className?: string }) {
  const company = useCompanySettings();
  return <p className={className}>{company.nome_fantasia} Admin</p>;
}
