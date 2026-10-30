import LegalPage from '../../components/LegalPage';
import { getCompanySettingsServer } from '@/lib/companySettingsServer';
import { whatsappUrl } from '@/lib/company';

export default async function TermosDeUsoPage() {
  const company = await getCompanySettingsServer(); const whats = whatsappUrl(company.whatsapp);
  return <LegalPage title="Termos de Uso">
    <p>Ao acessar ou utilizar {company.nome_fantasia}, você concorda com estes termos e com as regras apresentadas durante a compra.</p>
    <section><h2 className="font-black text-gray-900">Pedidos e cadastro</h2><p>O cliente é responsável por fornecer informações verdadeiras, completas e atualizadas, especialmente nome, telefone e endereço de entrega.</p></section>
    <section><h2 className="font-black text-gray-900">Preços e pagamentos</h2><p>Os preços, descontos, disponibilidade e meios de pagamento válidos são os exibidos no momento da confirmação. Um pedido somente é encaminhado para preparo após a confirmação do pagamento.</p></section>
    <section><h2 className="font-black text-gray-900">Disponibilidade</h2><p>Os produtos dependem de estoque. Caso um item fique indisponível após a compra, entraremos em contato para oferecer substituição ou reembolso.</p></section>
    <section><h2 className="font-black text-gray-900">Uso responsável</h2><p>As informações de dieta e treino possuem caráter informativo e não substituem avaliação médica, nutricional ou acompanhamento profissional individualizado.</p></section>
    <section><h2 className="font-black text-gray-900">Contato</h2><p>Dúvidas podem ser enviadas {company.email && <>para <a className="font-bold text-viva-roxo" href={`mailto:${company.email}`}>{company.email}</a></>} {company.email && whats && ' ou '} {whats && <>pelo WhatsApp <a className="font-bold text-viva-roxo" href={whats}>{company.whatsapp}</a></>}.</p></section>
  </LegalPage>;
}
