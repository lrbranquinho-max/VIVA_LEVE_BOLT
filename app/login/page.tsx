"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import Logo from '../../components/Logo';

function EyeIcon({ hidden }: { hidden: boolean }) {
  if (hidden) {
    return (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.2A10.5 10.5 0 0112 4c5 0 9 4.5 10 8a11.8 11.8 0 01-3 4.6M6.2 6.2A11.8 11.8 0 002 12c1 3.5 5 8 10 8 1.6 0 3.1-.5 4.4-1.2" />
      </svg>
    );
  }

  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function LoginCliente() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mostrarConfirmarSenha, setMostrarConfirmarSenha] = useState(false);
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
        if (senha !== confirmarSenha) {
          setMensagem({ texto: 'As senhas digitadas nao conferem.', tipo: 'erro' });
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({ email, password: senha });
        if (error) throw error;

        if (data.user) {
          const { error: profileError } = await supabase
            .from('perfis')
            .insert([{ id: data.user.id, nome, telefone }]);
          if (profileError) throw profileError;

          const validade = new Date();
          validade.setDate(validade.getDate() + 30);
          const { error: cupomError } = await supabase
            .from('cupons_desconto')
            .insert([{
              cliente_id: data.user.id,
              percentual_desconto: 30,
              data_validade: validade.toISOString(),
              status: 'aberto',
            }]);

          if (cupomError && cupomError.code !== '23505') {
            console.warn('[Cadastro] Cupom de boas-vindas nao criado:', cupomError.message);
          }
        }

        setMensagem({ texto: 'Cadastro realizado! Voce ja pode fazer login.', tipo: 'sucesso' });
        setIsCadastro(false);
        setNome('');
        setTelefone('');
        setSenha('');
        setConfirmarSenha('');
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

  const alternarModo = () => {
    setIsCadastro(prev => !prev);
    setMensagem(null);
    setConfirmarSenha('');
    setMostrarSenha(false);
    setMostrarConfirmarSenha(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 font-sans">
      <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-6 max-w-xs">
            <Logo />
          </div>
          <h2 className="text-xl font-bold text-viva-roxo">
            {isCadastro ? 'Crie sua conta' : 'Acesse seu painel'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {isCadastro ? 'Preencha seus dados para comecar' : 'Bem-vindo de volta a sua rotina saudavel'}
          </p>
        </div>

        {mensagem && (
          <div className={`mb-6 rounded-xl p-4 text-center text-sm font-bold ${
            mensagem.tipo === 'sucesso' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
          >
            {mensagem.texto}
          </div>
        )}

        <form onSubmit={handleAutenticacao} className="space-y-4">
          {isCadastro && (
            <>
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-600">Nome completo</label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 transition focus:outline-none focus:ring-2 focus:ring-viva-verde"
                  placeholder="Ex: Joao Silva"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-gray-600">WhatsApp / Telefone</label>
                <input
                  type="tel"
                  required
                  value={telefone}
                  onChange={e => setTelefone(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 transition focus:outline-none focus:ring-2 focus:ring-viva-verde"
                  placeholder="Ex: (61) 98888-8888"
                />
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block text-xs font-bold text-gray-600">E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 transition focus:outline-none focus:ring-2 focus:ring-viva-verde"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-gray-600">Senha</label>
            <div className="relative">
              <input
                type={mostrarSenha ? 'text' : 'password'}
                required
                value={senha}
                onChange={e => setSenha(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 pr-12 text-sm text-gray-900 transition focus:outline-none focus:ring-2 focus:ring-viva-verde"
                placeholder="********"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(prev => !prev)}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-gray-400 hover:text-viva-roxo"
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              >
                <EyeIcon hidden={mostrarSenha} />
              </button>
            </div>
          </div>

          {isCadastro && (
            <div>
              <label className="mb-1 block text-xs font-bold text-gray-600">Confirmar senha</label>
              <div className="relative">
                <input
                  type={mostrarConfirmarSenha ? 'text' : 'password'}
                  required
                  value={confirmarSenha}
                  onChange={e => setConfirmarSenha(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 pr-12 text-sm text-gray-900 transition focus:outline-none focus:ring-2 focus:ring-viva-verde"
                  placeholder="********"
                />
                <button
                  type="button"
                  onClick={() => setMostrarConfirmarSenha(prev => !prev)}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-gray-400 hover:text-viva-roxo"
                  aria-label={mostrarConfirmarSenha ? 'Ocultar confirmacao de senha' : 'Mostrar confirmacao de senha'}
                >
                  <EyeIcon hidden={mostrarConfirmarSenha} />
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-xl bg-viva-roxo py-3.5 font-bold text-white shadow-lg transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-70"
          >
            {loading ? 'Processando...' : (isCadastro ? 'Criar Conta' : 'Entrar')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={alternarModo}
            className="text-sm font-semibold text-gray-500 transition hover:text-viva-roxo"
          >
            {isCadastro ? 'Ja tem uma conta? Faca login aqui.' : 'Nao tem conta? Cadastre-se gratis.'}
          </button>
        </div>
      </div>
    </div>
  );
}
