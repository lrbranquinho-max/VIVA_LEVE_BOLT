import LegalPage from '../../components/LegalPage';
import { getCompanySettingsServer } from '@/lib/companySettingsServer';

export default async function SobrePage() {
  const company = await getCompanySettingsServer();
  return <LegalPage title={`Sobre ${company.nome_fantasia}`}>
    <p>{company.texto_sobre || company.descricao_empresa}</p>
    <p>Além da loja, reunimos recursos de acompanhamento de dieta e treino para ajudar cada cliente a manter hábitos consistentes.</p>
    <p>Atendemos {company.cidade || 'as regiões ativas exibidas no aplicativo'} e regiões ativas exibidas no aplicativo.</p>
  </LegalPage>;
}
