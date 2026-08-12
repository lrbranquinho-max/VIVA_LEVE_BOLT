import LegalPage from '../../components/LegalPage';

export default function PoliticaEntregasPage() {
  return <LegalPage title="Política de Entregas e Reembolso">
    <section><h2 className="font-black text-gray-900">Entregas</h2><p>O prazo estimado é informado durante a compra e começa após a confirmação do pagamento. A entrega depende de endereço completo, região atendida e disponibilidade para recebimento.</p></section>
    <section><h2 className="font-black text-gray-900">Conferência do pedido</h2><p>Confira os produtos assim que recebê-los. Mantenha os itens congelados conforme as instruções da embalagem.</p></section>
    <section className="border-l-4 border-viva-verde pl-4"><h2 className="font-black text-gray-900">Troca ou reembolso</h2><p>Caso seu pedido chegue com avarias ou fora da temperatura ideal, entre em contato via WhatsApp <a className="font-black text-viva-roxo" href="https://wa.me/556191299996">(61) 9129-9996</a> em até 12 horas para realizarmos a troca ou o reembolso do valor.</p></section>
    <section><h2 className="font-black text-gray-900">Análise</h2><p>Poderemos solicitar fotos do produto e da embalagem para identificação do ocorrido. Após a análise, informaremos o procedimento de troca ou reembolso pelo mesmo canal de atendimento.</p></section>
  </LegalPage>;
}
