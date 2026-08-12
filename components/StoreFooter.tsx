import Link from 'next/link';
import Logo from './Logo';

const links = [
  ['Sobre o Viva Leve', '/sobre'],
  ['Perguntas Frequentes (FAQ)', '/faq'],
  ['Termos de Uso', '/termos-de-uso'],
  ['Política de Privacidade', '/politica-de-privacidade'],
  ['Política de Entregas e Reembolso', '/politica-de-entregas-e-reembolso'],
] as const;

export default function StoreFooter() {
  return (
    <footer className="border-t border-gray-200 bg-gray-950 px-5 pb-32 pt-8 text-gray-200 md:px-8 md:pb-10">
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        <section>
          <div className="w-36 rounded bg-white px-2 py-1">
            <Logo />
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-gray-300">
            Transformando sua rotina com alimentação saudável e prática.
          </p>
        </section>

        <nav aria-label="Links úteis">
          <h2 className="text-sm font-black text-viva-verde">Links Úteis</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {links.map(([rotulo, href]) => (
              <li key={href}><Link href={href} className="transition hover:text-viva-verde">{rotulo}</Link></li>
            ))}
          </ul>
        </nav>

        <section>
          <h2 className="text-sm font-black text-viva-verde">Atendimento</h2>
          <div className="mt-3 space-y-2 text-sm leading-relaxed">
            <p><strong className="text-white">WhatsApp:</strong> <a href="https://wa.me/556191299996" target="_blank" rel="noreferrer" className="hover:text-viva-verde">(61) 9129-9996</a></p>
            <p><strong className="text-white">E-mail:</strong> <a href="mailto:vivaleve.df@gmail.com" className="break-all hover:text-viva-verde">vivaleve.df@gmail.com</a></p>
            <p><strong className="text-white">Horário:</strong> Segunda a Sexta, das 08h às 18h</p>
          </div>

          <h2 className="mt-6 text-sm font-black text-viva-verde">Pagamento Seguro</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Visa, Mastercard, Elo, Pix e Alelo">
            <span className="flex h-6 min-w-11 items-center justify-center rounded bg-white px-2 text-[9px] font-black italic text-[#1434CB]">VISA</span>
            <span className="flex h-6 min-w-11 items-center justify-center rounded bg-white px-2" title="Mastercard"><span className="h-4 w-4 rounded-full bg-[#EB001B]" /><span className="-ml-1.5 h-4 w-4 rounded-full bg-[#F79E1B] opacity-90" /></span>
            <span className="flex h-6 min-w-11 items-center justify-center rounded bg-[#111827] px-2 text-[9px] font-black lowercase text-[#FFCB05] ring-1 ring-gray-700">elo</span>
            <span className="flex h-6 min-w-11 items-center justify-center rounded bg-[#32BCAD] px-2 text-[9px] font-black text-white">PIX</span>
            <span className="flex h-6 min-w-11 items-center justify-center rounded bg-[#00A859] px-2 text-[9px] font-black lowercase text-white">alelo</span>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-black text-viva-verde">Informações Legais</h2>
          <div className="mt-3 space-y-2 text-xs leading-relaxed text-gray-300">
            <p><strong className="text-white">CNPJ:</strong> 62.496.248/0001-42</p>
            <p><strong className="text-white">Razão Social:</strong> 62.496.248 LUIZ RICARDO MENDES BRANQUINHO</p>
            <p><strong className="text-white">Endereço:</strong> Rua 91, Quadra 51, Lote 5, Loja 2 - CEP 72871-091 - Valparaíso de Goiás/GO</p>
          </div>
        </section>
      </div>

      <div className="mt-8 border-t border-gray-800 pt-4 text-center text-xs text-gray-400">
        © 2026 Viva Leve. Todos os direitos reservados.
      </div>
    </footer>
  );
}
