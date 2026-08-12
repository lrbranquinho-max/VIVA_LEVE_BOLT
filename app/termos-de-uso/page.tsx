import LegalPage from '../../components/LegalPage';

export default function TermosDeUsoPage() {
  return <LegalPage title="Termos de Uso">
    <p>Ao acessar ou utilizar o Viva Leve, você concorda com estes termos e com as regras apresentadas durante a compra.</p>
    <section><h2 className="font-black text-gray-900">Pedidos e cadastro</h2><p>O cliente é responsável por fornecer informações verdadeiras, completas e atualizadas, especialmente nome, telefone e endereço de entrega.</p></section>
    <section><h2 className="font-black text-gray-900">Preços e pagamentos</h2><p>Os preços, descontos, disponibilidade e meios de pagamento válidos são os exibidos no momento da confirmação. Um pedido somente é encaminhado para preparo após a confirmação do pagamento.</p></section>
    <section><h2 className="font-black text-gray-900">Disponibilidade</h2><p>Os produtos dependem de estoque. Caso um item fique indisponível após a compra, entraremos em contato para oferecer substituição ou reembolso.</p></section>
    <section><h2 className="font-black text-gray-900">Uso responsável</h2><p>As informações de dieta e treino possuem caráter informativo e não substituem avaliação médica, nutricional ou acompanhamento profissional individualizado.</p></section>
    <section><h2 className="font-black text-gray-900">Contato</h2><p>Dúvidas podem ser enviadas para <a className="font-bold text-viva-roxo" href="mailto:vivaleve.df@gmail.com">vivaleve.df@gmail.com</a> ou pelo WhatsApp <a className="font-bold text-viva-roxo" href="https://wa.me/556191299996">(61) 9129-9996</a>.</p></section>
  </LegalPage>;
}
