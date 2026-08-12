import Link from 'next/link';
import Logo from './Logo';

export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white px-5 py-8 md:px-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="block w-36" aria-label="Voltar para a Loja"><Logo /></Link>
        <Link href="/" className="mt-5 inline-flex text-sm font-bold text-viva-roxo">← Voltar para a Loja</Link>
        <h1 className="mt-6 text-2xl font-black text-gray-900">{title}</h1>
        <div className="mt-6 space-y-5 text-sm leading-7 text-gray-700">{children}</div>
        <p className="mt-10 border-t border-gray-200 pt-5 text-xs text-gray-400">Última atualização: 12 de agosto de 2026.</p>
      </div>
    </main>
  );
}
