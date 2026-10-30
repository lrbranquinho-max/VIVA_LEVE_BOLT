import LegalPage from '../../components/LegalPage';
import { getCompanySettingsServer } from '@/lib/companySettingsServer';
import { whatsappUrl } from '@/lib/company';

export default async function FaqPage() {
  const company = await getCompanySettingsServer(); const whats = whatsappUrl(company.whatsapp);
  return <LegalPage title="Perguntas Frequentes (FAQ)">
    <section><h2 className="font-black text-gray-900">Qual é o prazo de entrega?</h2><p>O prazo padrão é informado no checkout e na tela de acompanhamento do pedido.</p></section>
    <section><h2 className="font-black text-gray-900">Como devo conservar as refeições?</h2><p>Mantenha os produtos congelados a -18°C ou mais frio e siga as instruções presentes na etiqueta.</p></section>
    <section><h2 className="font-black text-gray-900">Quais pagamentos são aceitos?</h2><p>As opções disponíveis no checkout incluem Pix, cartão, Alelo, Mercado Pago e chave de crédito, conforme habilitação vigente.</p></section>
    <section><h2 className="font-black text-gray-900">Como acompanho meu pedido?</h2><p>Após a compra, abra a opção Pedidos no menu do aplicativo para acompanhar o status.</p></section>
    <section><h2 className="font-black text-gray-900">Como falo com o atendimento?</h2><p>{whats ? <>Entre em contato pelo WhatsApp <a className="font-bold text-viva-roxo" href={whats}>{company.whatsapp}</a>, de segunda a sexta, das 08h às 18h.</> : 'Consulte os canais de atendimento exibidos na loja.'}</p></section>
  </LegalPage>;
}
