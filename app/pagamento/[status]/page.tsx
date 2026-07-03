import Link from 'next/link';
import Logo from '../../../components/Logo';

const STATUS_CONFIG: Record<string, {
  titulo: string;
  descricao: string;
  classe: string;
  pagamentoQuery: string;
}> = {
  sucesso: {
    titulo: 'Pagamento aprovado',
    descricao: 'Recebemos a confirmacao do Mercado Pago. Acompanhe o preparo do seu pedido.',
    classe: 'border-green-200 bg-green-50 text-green-800',
    pagamentoQuery: 'sucesso',
  },
  falha: {
    titulo: 'Pagamento nao aprovado',
    descricao: 'O Mercado Pago nao aprovou esse pagamento. Voce pode tentar pagar novamente em seus pedidos.',
    classe: 'border-red-200 bg-red-50 text-red-800',
    pagamentoQuery: 'falha',
  },
  pendente: {
    titulo: 'Pagamento pendente',
    descricao: 'Seu pagamento ainda esta em processamento. Acompanhe o status em seus pedidos.',
    classe: 'border-yellow-200 bg-yellow-50 text-yellow-800',
    pagamentoQuery: 'pendente',
  },
};

export default function PagamentoStatusPage({ params }: { params: { status: string } }) {
  const status = STATUS_CONFIG[params.status] ?? STATUS_CONFIG.pendente;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-gray-50 p-5 font-sans shadow-2xl md:max-w-6xl">
      <header className="rounded-2xl bg-white p-5 shadow-sm">
        <Logo />
      </header>

      <section className="mt-5 flex flex-1 items-center justify-center">
        <div className={`w-full rounded-2xl border p-6 text-center shadow-sm ${status.classe}`}>
          <p className="text-xs font-black uppercase tracking-widest">Mercado Pago</p>
          <h1 className="mt-2 text-2xl font-black">{status.titulo}</h1>
          <p className="mt-3 text-sm font-semibold leading-relaxed">{status.descricao}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href={`/pedidos?pagamento=${status.pagamentoQuery}`}
              className="rounded-xl bg-viva-roxo px-4 py-3 text-sm font-black text-white shadow-sm"
            >
              Ver meus pedidos
            </Link>
            <Link
              href="/"
              className="rounded-xl bg-white px-4 py-3 text-sm font-black text-gray-700 ring-1 ring-gray-200"
            >
              Voltar para loja
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
