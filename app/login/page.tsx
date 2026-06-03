"use client";

import { useState } from 'react';
import { supabase } from '../../supabase';
import { useRouter } from 'next/navigation';
import Logo from '../../components/Logo';


export default function LoginCliente() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [isCadastro, setIsCadastro] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState<{ texto: string; tipo: 'sucesso' | 'erro' } | null>(null);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');

  const router = useRouter();

  const handleAutenticacao = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMensagem(null);

    try {
      if (isCadastro) {
        const { data, error } = await supabase.auth.signUp({ email, password: senha });
        if (error) throw error;

        if (data.user) {
          const { error: profileError } = await supabase
            .from('perfis')
            .insert([{ id: data.user.id, nome, telefone }]);
          if (profileError) throw profileError;
        }

        setMensagem({ texto: 'Cadastro realizado! Você já pode fazer login.', tipo: 'sucesso' });
        setIsCadastro(false);
        setNome(''); setTelefone('');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        router.push('/dieta');
      }
    } catch (error: any) {
      setMensagem({ texto: error.message || 'Erro na autenticacao.', tipo: 'erro' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md border border-gray-100">

        <div className="text-center mb-8">
          <div className="mb-6 max-w-xs mx-auto">
            <Logo />
          </div>
          <h2 className="text-xl font-bold text-viva-roxo">
            {isCadastro ? 'Crie sua conta' : 'Acesse seu painel'}
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            {isCadastro ? 'Preencha seus dados para comecar' : 'Bem-vindo de volta a sua rotina saudavel'}
          </p>
        </div>

        {mensagem && (
          <div className={`p-4 rounded-xl text-sm font-bold mb-6 text-center ${
            mensagem.tipo === 'sucesso' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {mensagem.texto}
          </div>
        )}

        <form onSubmit={handleAutenticacao} className="space-y-4">
          {isCadastro && (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Nome completo</label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-viva-verde transition text-sm text-gray-900"
                  placeholder="Ex: Joao Silva"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">WhatsApp / Telefone</label>
                <input
                  type="tel"
                  required
                  value={telefone}
                  onChange={e => setTelefone(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-viva-verde transition text-sm text-gray-900"
                  placeholder="Ex: (61) 98888-8888"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-viva-verde transition text-sm text-gray-900"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Senha</label>
            <input
              type="password"
              required
              value={senha}
              onChange={e => setSenha(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-viva-verde transition text-sm text-gray-900"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-viva-roxo text-white font-bold py-3.5 rounded-xl shadow-lg hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-70 mt-2"
          >
            {loading ? 'Processando...' : (isCadastro ? 'Criar Conta' : 'Entrar')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => { setIsCadastro(!isCadastro); setMensagem(null); }}
            className="text-sm font-semibold text-gray-500 hover:text-viva-roxo transition"
          >
            {isCadastro ? 'Ja tem uma conta? Faca login aqui.' : 'Nao tem conta? Cadastre-se gratis.'}
          </button>
        </div>

      </div>
    </div>
  );
}
