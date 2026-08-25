"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../supabase';
import Logo from '../../components/Logo';

type AccessMode = 'client' | 'admin' | 'trainer' | 'delivery';

const CUPOM_BOAS_VINDAS_PADRAO = 30;
const SITE_PUBLICO_PADRAO = 'https://vivalevedf.com.br';

function percentualBoasVindas(valor: unknown) {
  const bruto = (valor && typeof valor === 'object' ? valor : {}) as Record<string, unknown>;
  const percentual = Number(bruto.cupom_boas_vindas_percentual ?? CUPOM_BOAS_VINDAS_PADRAO);
  return Math.min(100, Math.max(0, Number.isFinite(percentual) ? percentual : CUPOM_BOAS_VINDAS_PADRAO));
}

function urlBasePublica() {
  if (typeof window === 'undefined') return SITE_PUBLICO_PADRAO;

  const origemAtual = window.location.origin;
  const origemEnv = process.env.NEXT_PUBLIC_SITE_URL;
  const emLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  if (emLocalhost) return origemAtual;
  if (origemEnv && !origemEnv.includes('localhost') && !origemEnv.includes('127.0.0.1')) return origemEnv.replace(/\/$/, '');
  return SITE_PUBLICO_PADRAO;
}

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
  const [modoEsqueciSenha, setModoEsqueciSenha] = useState(false);
  const [modoRedefinirSenha, setModoRedefinirSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accessMode, setAccessMode] = useState<AccessMode>('client');
  const [accessRoles, setAccessRoles] = useState<string[]>([]);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [mensagem, setMensagem] = useState<{ texto: string; tipo: 'sucesso' | 'erro' } | null>(null);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');

  const router = useRouter();

  useEffect(() => {
    if (isCadastro || modoEsqueciSenha || modoRedefinirSenha || !email.includes('@')) {
      setAccessRoles([]);
      setAccessMode('client');
      return;
    }

    const timer = window.setTimeout(async () => {
      setCheckingAccess(true);
      const { data, error } = await supabase.rpc('get_access_options', { lookup_email: email.trim() });
      const roles = !error && Array.isArray(data) ? data : [];
      setAccessRoles(roles);
      setAccessMode(current =>
        current === 'admin' && !roles.includes('admin')
          ? 'client'
          : current === 'trainer' && !roles.includes('trainer')
            ? 'client'
            : current === 'delivery' && !roles.includes('delivery')
              ? 'client'
            : current);
      setCheckingAccess(false);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [email, isCadastro, modoEsqueciSenha, modoRedefinirSenha]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const erroHash = hashParams.get('error_description') || hashParams.get('error');

    if (erroHash) {
      setModoEsqueciSenha(true);
      setMensagem({
        texto: erroHash.includes('expired') || erroHash.includes('invalid')
          ? 'O link de redefinicao expirou ou ja foi utilizado. Solicite um novo link.'
          : decodeURIComponent(erroHash.replace(/\+/g, ' ')),
        tipo: 'erro',
      });
      window.history.replaceState(null, '', window.location.pathname);
    }

    if (params.get('reset_password') === '1' || hashParams.get('type') === 'recovery') {
      setModoRedefinirSenha(true);
      setIsCadastro(false);
      setModoEsqueciSenha(false);
    }

    const { data: listener } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') {
        setModoRedefinirSenha(true);
        setIsCadastro(false);
        setModoEsqueciSenha(false);
        setSenha('');
        setConfirmarSenha('');
        setMensagem({ texto: 'Informe a nova senha para concluir a redefinicao.', tipo: 'sucesso' });
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleEnviarRecuperacao = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMensagem(null);

    try {
      const destino = `${urlBasePublica()}/login`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: destino,
      });

      if (error) throw error;
      setMensagem({ texto: 'Enviamos um link de redefinicao para o seu e-mail.', tipo: 'sucesso' });
    } catch (error: any) {
      setMensagem({ texto: error.message || 'Erro ao enviar e-mail de redefinicao.', tipo: 'erro' });
    } finally {
      setLoading(false);
    }
  };

  const handleAtualizarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMensagem(null);

    try {
      if (senha !== confirmarSenha) {
        setMensagem({ texto: 'As senhas digitadas nao conferem.', tipo: 'erro' });
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;

      setMensagem({ texto: 'Senha atualizada com sucesso. Acesse novamente.', tipo: 'sucesso' });
      setModoRedefinirSenha(false);
      setModoEsqueciSenha(false);
      setIsCadastro(false);
      setSenha('');
      setConfirmarSenha('');
      await supabase.auth.signOut();
    } catch (error: any) {
      setMensagem({ texto: error.message || 'Erro ao atualizar senha.', tipo: 'erro' });
    } finally {
      setLoading(false);
    }
  };

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

          const { data: configCupom } = await supabase
            .from('app_config')
            .select('valor')
            .eq('chave', 'loja_config')
            .maybeSingle();
          const percentualCupom = percentualBoasVindas(configCupom?.valor);

          if (percentualCupom > 0) {
            const validade = new Date();
            validade.setDate(validade.getDate() + 30);
            const { error: cupomError } = await supabase
              .from('cupons_desconto')
              .insert([{
                cliente_id: data.user.id,
                percentual_desconto: percentualCupom,
                data_validade: validade.toISOString(),
                status: 'aberto',
              }]);

            if (cupomError && cupomError.code !== '23505') {
              console.warn('[Cadastro] Cupom de boas-vindas nao criado:', cupomError.message);
            }
          }
        }

        setMensagem({ texto: 'Cadastro realizado! Voce ja pode fazer login.', tipo: 'sucesso' });
        setIsCadastro(false);
        setNome('');
        setTelefone('');
        setSenha('');
        setConfirmarSenha('');
      } else {
        const { data: loginData, error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        const authenticatedEmail = loginData.user?.email ?? email;
        const { data: roles, error: rolesError } = await supabase.rpc('get_access_options', {
          lookup_email: authenticatedEmail,
        });
        if (rolesError) throw rolesError;
        const authenticatedRoles = Array.isArray(roles) ? roles : [];

        if (accessMode === 'admin' && !authenticatedRoles.includes('admin')) {
          await supabase.auth.signOut();
          throw new Error('Este usuário não possui acesso de administrador.');
        }
        if (accessMode === 'trainer' && !authenticatedRoles.includes('trainer')) {
          await supabase.auth.signOut();
          throw new Error('Este usuário não possui acesso de treinador.');
        }
        if (accessMode === 'delivery' && !authenticatedRoles.includes('delivery')) {
          await supabase.auth.signOut();
          throw new Error('Este usuário não possui acesso de entregador.');
        }

        router.push(accessMode === 'admin' ? '/admin' : accessMode === 'trainer' ? '/treinador' : accessMode === 'delivery' ? '/entregas' : '/dieta');
      }
    } catch (error: any) {
      setMensagem({ texto: error.message || 'Erro na autenticacao.', tipo: 'erro' });
    } finally {
      setLoading(false);
    }
  };

  const alternarModo = () => {
    setIsCadastro(prev => !prev);
    setModoEsqueciSenha(false);
    setModoRedefinirSenha(false);
    setMensagem(null);
    setConfirmarSenha('');
    setMostrarSenha(false);
    setMostrarConfirmarSenha(false);
    setAccessMode('client');
    setAccessRoles([]);
  };

  const voltarParaLogin = () => {
    setIsCadastro(false);
    setModoEsqueciSenha(false);
    setModoRedefinirSenha(false);
    setMensagem(null);
    setSenha('');
    setConfirmarSenha('');
  };

  const titulo = modoRedefinirSenha ? 'Redefina sua senha' : modoEsqueciSenha ? 'Recupere sua senha' : isCadastro ? 'Crie sua conta' : 'Acesse seu painel';
  const subtitulo = modoRedefinirSenha
    ? 'Digite e confirme sua nova senha'
    : modoEsqueciSenha
      ? 'Informe seu e-mail para receber o link'
      : isCadastro
        ? 'Preencha seus dados para comecar'
        : 'Bem-vindo de volta a sua rotina saudavel';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 font-sans">
      <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-6 max-w-xs">
            <Logo />
          </div>
          <h2 className="text-xl font-bold text-viva-roxo">
            {titulo}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {subtitulo}
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

        <form onSubmit={modoRedefinirSenha ? handleAtualizarSenha : modoEsqueciSenha ? handleEnviarRecuperacao : handleAutenticacao} className="space-y-4">
          {isCadastro && !modoEsqueciSenha && !modoRedefinirSenha && (
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

          {!modoRedefinirSenha && (
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
          )}

          {!isCadastro && !modoEsqueciSenha && !modoRedefinirSenha && (accessRoles.length > 0 || checkingAccess) && (
            <fieldset>
              <legend className="mb-2 text-xs font-bold text-gray-600">Tipo de acesso</legend>
              {checkingAccess ? (
                <div className="rounded-xl bg-gray-50 p-3 text-center text-xs font-bold text-gray-400">
                  Verificando perfil...
                </div>
              ) : (
                <div className="grid gap-2">
                  <label className={`cursor-pointer rounded-xl border p-3 text-sm font-bold ${accessMode === 'client' ? 'border-viva-roxo bg-purple-50 text-viva-roxo' : 'border-gray-200 text-gray-600'}`}>
                    <input type="radio" name="access-mode" value="client" checked={accessMode === 'client'} onChange={() => setAccessMode('client')} className="mr-2" />
                    Acessar como cliente
                  </label>
                  {accessRoles.includes('admin') && (
                    <label className={`cursor-pointer rounded-xl border p-3 text-sm font-bold ${accessMode === 'admin' ? 'border-viva-roxo bg-purple-50 text-viva-roxo' : 'border-gray-200 text-gray-600'}`}>
                      <input type="radio" name="access-mode" value="admin" checked={accessMode === 'admin'} onChange={() => setAccessMode('admin')} className="mr-2" />
                      Acessar como administrador
                    </label>
                  )}
                  {accessRoles.includes('trainer') && (
                    <label className={`cursor-pointer rounded-xl border p-3 text-sm font-bold ${accessMode === 'trainer' ? 'border-viva-roxo bg-purple-50 text-viva-roxo' : 'border-gray-200 text-gray-600'}`}>
                      <input type="radio" name="access-mode" value="trainer" checked={accessMode === 'trainer'} onChange={() => setAccessMode('trainer')} className="mr-2" />
                      Acessar como treinador
                    </label>
                  )}
                  {accessRoles.includes('delivery') && (
                    <label className={`cursor-pointer rounded-xl border p-3 text-sm font-bold ${accessMode === 'delivery' ? 'border-viva-roxo bg-purple-50 text-viva-roxo' : 'border-gray-200 text-gray-600'}`}>
                      <input type="radio" name="access-mode" value="delivery" checked={accessMode === 'delivery'} onChange={() => setAccessMode('delivery')} className="mr-2" />
                      Acessar como entregador
                    </label>
                  )}
                </div>
              )}
            </fieldset>
          )}

          {!modoEsqueciSenha && (
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
          )}

          {(isCadastro || modoRedefinirSenha) && !modoEsqueciSenha && (
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
            {loading ? 'Processando...' : modoRedefinirSenha ? 'Salvar nova senha' : modoEsqueciSenha ? 'Enviar link de redefinicao' : isCadastro ? 'Criar Conta' : 'Entrar'}
          </button>
        </form>

        <div className="mt-6 text-center">
          {modoEsqueciSenha || modoRedefinirSenha ? (
            <button
              onClick={voltarParaLogin}
              className="text-sm font-semibold text-gray-500 transition hover:text-viva-roxo"
            >
              Voltar para o login
            </button>
          ) : (
            <div className="space-y-3">
              {!isCadastro && (
                <button
                  onClick={() => {
                    setModoEsqueciSenha(true);
                    setMensagem(null);
                    setSenha('');
                    setConfirmarSenha('');
                  }}
                  className="block w-full text-sm font-semibold text-viva-roxo transition hover:brightness-90"
                >
                  Esqueci minha senha
                </button>
              )}
              <button
                onClick={alternarModo}
                className="text-sm font-semibold text-gray-500 transition hover:text-viva-roxo"
              >
                {isCadastro ? 'Ja tem uma conta? Faca login aqui.' : 'Nao tem conta? Cadastre-se gratis.'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
