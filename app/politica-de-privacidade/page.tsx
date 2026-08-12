import LegalPage from '../../components/LegalPage';

export default function PoliticaPrivacidadePage() {
  return <LegalPage title="Política de Privacidade">
    <p>A Viva Leve trata os dados pessoais necessários para manter sua conta, processar pedidos, entregar produtos, receber pagamentos e prestar atendimento.</p>
    <section><h2 className="font-black text-gray-900">Dados tratados</h2><p>Podemos tratar nome, e-mail, telefone, endereço, histórico de pedidos e informações voluntariamente fornecidas nos recursos de dieta e treino. Dados completos de cartão não são armazenados pela Viva Leve.</p></section>
    <section><h2 className="font-black text-gray-900">Finalidades</h2><p>Usamos os dados para autenticação, execução dos serviços contratados, prevenção de fraude, atendimento, cumprimento de obrigações legais e melhoria da experiência.</p></section>
    <section><h2 className="font-black text-gray-900">Compartilhamento</h2><p>Os dados podem ser compartilhados apenas quando necessário com fornecedores de infraestrutura, pagamento, entrega e autoridades competentes, observadas as medidas de segurança aplicáveis.</p></section>
    <section><h2 className="font-black text-gray-900">Direitos do titular</h2><p>Você pode solicitar confirmação do tratamento, acesso, correção ou exclusão de dados, quando legalmente aplicável, pelo e-mail <a className="font-bold text-viva-roxo" href="mailto:vivaleve.df@gmail.com">vivaleve.df@gmail.com</a>.</p></section>
    <section><h2 className="font-black text-gray-900">Segurança</h2><p>Adotamos controles técnicos e organizacionais para reduzir acessos não autorizados, perdas e alterações indevidas.</p></section>
  </LegalPage>;
}
