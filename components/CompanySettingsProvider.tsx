'use client';

import { createContext, useContext } from 'react';
import { CompanySettings, DEFAULT_COMPANY } from '@/lib/company';

const CompanySettingsContext = createContext<CompanySettings>(DEFAULT_COMPANY);

export function CompanySettingsProvider({ company, children }: { company: CompanySettings; children: React.ReactNode }) {
  return <CompanySettingsContext.Provider value={company}>{children}</CompanySettingsContext.Provider>;
}

export function useCompanySettings() { return useContext(CompanySettingsContext); }
