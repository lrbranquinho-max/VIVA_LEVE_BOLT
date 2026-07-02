"use client";

import { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '../../components/Logo';

const REGIOES_DF = [
  'Asa Norte', 'Asa Sul', 'Águas Claras', 'Ceilândia', 'Gama', 'Guará',
  'Lago Norte', 'Lago Sul', 'Planaltina', 'Samambaia', 'Santa Maria',
  'Sobradinho', 'Taguatinga', 'Vicente Pires', 'Cruzeiro', 'Núcleo Bandeirante',
  'Park Way', 'Riacho Fundo', 'SIA', 'Estrutural', 'Valparaíso de Goiás',
  'Luziânia', 'Novo Gama', 'Pedregal',
];

export default function Perfil() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ texto: string; tipo: 'sucesso' | 'erro' } | null>(null);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [enderecoRua, setEnderecoRua] = useState('');
  const [enderecoNumero, setEnderecoNumero] = useState('');
  const [enderecoComplemento, setEnderecoComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [regiaoDf, setRegiaoDf] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    async function carregarPerfil() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      setEmail(user.email ?? '');

      const { data: perfil } = await supabase
        .from('perfis')
        .select('nome, telefone')
        .eq('id', user.id)
        .maybeSingle();

      if (perfil) {
        setNome(perfil.nome ?? '');
        setTelefone(perfil.telefone ?? '');
      }

      const { data: perfilCliente } = await supabase
        .from('perfis_clientes')
        .select('endereco_rua, endereco_numero, endereco_complemento, bairro, regiao_df')
        .eq('id', user.id)
        .maybeSingle();

      if (perfilCliente) {
        setEnderecoRua(perfilCliente.endereco_rua ?? '');
        setEnderecoNumero(perfilCliente.endereco_numero ?? '');
        setEnderecoComplemento(perfilCliente.endereco_complemento ?? '');
        setBairro(perfilCliente.bairro ?? '');
        setRegiaoDf(perfilCliente.regiao_df ?? '');
      }

      setLoading(false);
    }
    carregarPerfil();
  }, [router]);

  const salvarPerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setMensagem(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error: errPerfil } = await supabase
      .from('perfis')
      .upsert({ id: user.id, nome, telefone });

    if (errPerfil) {
      setMensagem({ texto: 'Erro ao salvar: ' + errPerfil.message, tipo: 'erro' });
      setSalvando(false);
      return;
    }

    const { error: errCliente } = await supabase
      .from('perfis_clientes')
      .upsert({
        id: user.id,
        nome_completo: nome,
        telefone,
        endereco_rua: enderecoRua,
        endereco_numero: enderecoNumero,
        endereco_complemento: enderecoComplemento,
        bairro,
        regiao_df: regiaoDf,
      });

    if (errCliente) {
      setMensagem({ texto: 'Erro ao salvar endereço: ' + errCliente.message, tipo: 'erro' });
    } else {
      setMensagem({ texto: 'Perfil atualizado com sucesso!', tipo: 'sucesso' });
    }
    setSalvando(false);
  };

  const sair = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 animate-pulse">Carregando perfil...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans max-w-md mx-auto shadow-2xl relative pb-24 md:max-w-6xl">
      <header className="bg-white border-b border-gray-100 p-4 shadow-sm space-y-3">
        <div className="max-w-xs">
          <Logo />
        </div>
        <p className="text-center text-xs text-gray-600">{email}</p>
      </header>

      <main className="p-5">
        {mensagem && (
          <div className={`p-4 rounded-xl text-sm font-bold mb-5 text-center ${
            mensagem.tipo === 'sucesso' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {mensagem.texto}
          </div>
        )}

        <form onSubmit={salvarPerfil} className="space-y-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Dados Pessoais</h2>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Nome completo</label>
              <input
                type="text"
                value={nome}
                onChange={e => setNome(e.target.value)}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-viva-verde transition text-sm text-gray-900"
                placeholder="Seu nome"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">WhatsApp / Telefone</label>
              <input
                type="tel"
                value={telefone}
                onChange={e => setTelefone(e.target.value)}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-viva-verde transition text-sm text-gray-900"
                placeholder="(61) 98888-8888"
              />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Endereço de Entrega</h2>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-600 mb-1">Rua / Quadra</label>
                <input
                  type="text"
                  value={enderecoRua}
                  onChange={e => setEnderecoRua(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-viva-verde transition text-sm text-gray-900"
                  placeholder="Ex: QNN 21"
                />
              </div>
              <div className="w-24">
                <label className="block text-xs font-bold text-gray-600 mb-1">Número</label>
                <input
                  type="text"
                  value={enderecoNumero}
                  onChange={e => setEnderecoNumero(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-viva-verde transition text-sm text-gray-900"
                  placeholder="Bloco A"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Complemento</label>
              <input
                type="text"
                value={enderecoComplemento}
                onChange={e => setEnderecoComplemento(e.target.value)}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-viva-verde transition text-sm text-gray-900"
                placeholder="Apto 102, casa 5..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Bairro</label>
              <input
                type="text"
                value={bairro}
                onChange={e => setBairro(e.target.value)}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-viva-verde transition text-sm text-gray-900"
                placeholder="Ex: Ceilândia Norte"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Região</label>
              <select
                value={regiaoDf}
                onChange={e => setRegiaoDf(e.target.value)}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-viva-verde transition text-sm text-gray-900"
              >
                <option value="">Selecione a região</option>
                {REGIOES_DF.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={salvando}
            className="w-full bg-viva-roxo text-white font-bold py-3.5 rounded-xl shadow-lg hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-70"
          >
            {salvando ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </form>

        <button
          onClick={sair}
          className="w-full mt-4 py-3 rounded-xl border-2 border-red-200 text-red-500 font-bold text-sm hover:bg-red-50 transition"
        >
          Sair da Conta
        </button>
      </main>

      <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-200 flex justify-around p-3 pb-5 z-10 md:max-w-6xl">
        <Link href="/" className="flex flex-col items-center text-gray-400 hover:text-viva-roxo">
          <span className="text-xl">&#127968;</span>
          <span className="text-[10px] font-bold mt-1">Loja</span>
        </Link>
        <Link href="/pedidos" className="flex flex-col items-center text-gray-400 hover:text-viva-roxo">
          <span className="text-xl">&#128203;</span>
          <span className="text-[10px] font-bold mt-1">Pedidos</span>
        </Link>
        <Link href="/dieta" className="flex flex-col items-center text-gray-400 hover:text-viva-roxo">
          <span className="text-xl">&#128241;</span>
          <span className="text-[10px] font-bold mt-1">Dieta</span>
        </Link>
        <Link href="/perfil" className="flex flex-col items-center text-viva-roxo">
          <span className="text-xl">&#128100;</span>
          <span className="text-[10px] font-bold mt-1">Perfil</span>
        </Link>
      </nav>
    </div>
  );
}
