'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/supabase';
import { alternarPerfilUsuario, PerfilUsuario, UsuarioAdmin } from '@/lib/usuariosAdmin';

const PERFIS: Array<{ id: PerfilUsuario; nome: string; plural: string; descricao: string; cor: string }> = [
  { id: 'student', nome: 'Aluno', plural: 'Alunos', descricao: 'Acesso comum à loja, dieta e treino', cor: 'border-emerald-500 bg-emerald-50 text-emerald-800' },
  { id: 'trainer', nome: 'Treinador', plural: 'Treinadores', descricao: 'Planos de treinamento e alunos', cor: 'border-blue-500 bg-blue-50 text-blue-800' },
  { id: 'admin', nome: 'Administrador', plural: 'Administradores', descricao: 'Acesso administrativo completo', cor: 'border-viva-roxo bg-purple-50 text-viva-roxo' },
  { id: 'delivery', nome: 'Entregador', plural: 'Entregadores', descricao: 'Somente entregas atribuídas', cor: 'border-amber-500 bg-amber-50 text-amber-800' },
];
const novoForm = () => ({ nome: '', email: '', telefone: '', observacoes: '', senha: '', confirmarSenha: '', perfis: ['student'] as PerfilUsuario[] });
function dataCurta(value?: string | null) { return value ? new Date(value).toLocaleDateString('pt-BR') : 'Nunca'; }

export default function AdminUsuariosPage() {
  const router = useRouter();
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [erroFormulario, setErroFormulario] = useState('');
  const [busca, setBusca] = useState('');
  const [filtroPerfil, setFiltroPerfil] = useState<PerfilUsuario | ''>('');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<UsuarioAdmin | null>(null);
  const [form, setForm] = useState(novoForm);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const formularioRef = useRef<HTMLFormElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);

  const carregar = useCallback(async () => {
    setAtualizando(true);
    setErro('');
    try {
      const { data: sessao, error } = await supabase.auth.getSession();
      if (error || !sessao.session) { router.replace('/login'); return; }
      const response = await fetch('/api/admin/usuarios', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${sessao.session.access_token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setUsuarios([]);
          router.replace('/login');
        }
        throw new Error(data.error || 'Erro ao carregar usuários.');
      }
      setUsuarios(data.usuarios ?? []);
    } catch (error: any) {
      setErro(error.message || 'Não foi possível carregar os usuários.');
    } finally {
      setLoading(false);
      setAtualizando(false);
    }
  }, [router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setBusca(params.get('email') || '');
    const perfil = params.get('perfil');
    if (PERFIS.some(item => item.id === perfil)) setFiltroPerfil(perfil as PerfilUsuario);
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!mensagem) return;
    const timer = window.setTimeout(() => setMensagem(''), 6000);
    return () => window.clearTimeout(timer);
  }, [mensagem]);

  useEffect(() => {
    if (!modal) return;
    const navegar = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !salvando) setModal(false);
      if (event.key !== 'Tab') return;
      const campos = Array.from(formularioRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)') ?? []);
      const primeiro = campos[0];
      const ultimo = campos[campos.length - 1];
      if (!primeiro) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === primeiro) { event.preventDefault(); ultimo.focus(); }
      if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primeiro.focus(); }
    };
    window.addEventListener('keydown', navegar);
    return () => window.removeEventListener('keydown', navegar);
  }, [modal, salvando]);

  useEffect(() => {
    if (!modal) focoAnterior.current?.focus();
  }, [modal]);

  const filtrados = useMemo(() => {
    const normalizar = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const termos = normalizar(busca).trim().split(/\s+/).filter(Boolean);
    return usuarios.filter(usuario => {
      const texto = normalizar(`${usuario.nome} ${usuario.email} ${usuario.telefone}`);
      return termos.every(termo => texto.includes(termo)) && (!filtroPerfil || usuario.perfis.includes(filtroPerfil));
    });
  }, [usuarios, busca, filtroPerfil]);

  function abrirFormulario(usuario?: UsuarioAdmin) {
    focoAnterior.current = document.activeElement as HTMLElement | null;
    setEditando(usuario ?? null);
    setErroFormulario('');
    setMostrarSenha(false);
    setForm(usuario ? { ...novoForm(), nome: usuario.nome, email: usuario.email, telefone: usuario.telefone, observacoes: usuario.observacoes, perfis: [...usuario.perfis] } : novoForm());
    setModal(true);
  }

  async function salvar(event: FormEvent) {
    event.preventDefault();
    if (salvando) return;
    setErroFormulario('');
    if (form.senha !== form.confirmarSenha) { setErroFormulario('As senhas não conferem.'); return; }
    setSalvando(true);
    try {
      const { data: sessao, error } = await supabase.auth.getSession();
      if (error || !sessao.session) throw new Error('Sessão expirada. Entre novamente.');
      const { confirmarSenha, ...dados } = form;
      const response = await fetch('/api/admin/usuarios', {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.session.access_token}` },
        body: JSON.stringify({ ...dados, userId: editando?.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) await carregar();
        throw new Error(data.error || 'Erro ao salvar usuário.');
      }
      setModal(false);
      setForm(novoForm());
      setMensagem(data.conviteEnviado ? 'Usuário criado e convite enviado por e-mail.' : 'Usuário e perfis salvos com sucesso.');
      await carregar();
    } catch (error: any) {
      setErroFormulario(error.message || 'Não foi possível salvar o usuário.');
    } finally {
      setSalvando(false);
    }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-gray-100"><div role="status" aria-label="Carregando usuários" className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-viva-roxo" /></div>;

  return (
    <main className="min-h-screen bg-gray-100 p-4 text-gray-900 md:p-7">
      {mensagem && <div role="status" className="fixed left-1/2 top-4 z-[100] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-lg bg-emerald-700 px-4 py-3 text-center text-sm font-bold text-white shadow-xl">{mensagem}</div>}
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-viva-verde bg-white p-5">
          <div><p className="text-xs font-black uppercase text-viva-roxo">Administração</p><h1 className="mt-1 text-2xl font-black">Usuários e perfis</h1></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => abrirFormulario()} className="h-11 rounded-lg bg-viva-verde px-4 text-sm font-black text-viva-roxo">Novo usuário</button>
            <Link href="/admin" className="flex h-11 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-black text-viva-roxo">Voltar ao Admin</Link>
          </div>
        </header>
        {erro && <div role="alert" className="mt-4 border-l-4 border-red-500 bg-red-50 p-4 text-sm font-bold text-red-700">{erro}</div>}
        <section aria-label="Perfis cadastrados" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {PERFIS.map(perfil => (
            <button key={perfil.id} type="button" aria-pressed={filtroPerfil === perfil.id} onClick={() => setFiltroPerfil(atual => atual === perfil.id ? '' : perfil.id)} className={`min-w-0 border-l-4 p-3 text-left sm:p-4 ${filtroPerfil === perfil.id ? perfil.cor : 'border-gray-300 bg-white'}`}>
              <span className="block text-2xl font-black">{usuarios.filter(usuario => usuario.perfis.includes(perfil.id)).length}</span>
              <span className="break-words text-xs font-black sm:text-sm">{perfil.plural}</span>
            </button>
          ))}
        </section>
        <section className="mt-5 bg-white">
          <div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_220px_auto]">
            <label className="min-w-0"><span className="sr-only">Buscar usuários</span><input value={busca} onChange={event => setBusca(event.target.value)} placeholder="Nome, e-mail ou telefone" className="h-11 w-full min-w-0 rounded-lg border border-gray-300 px-3 text-sm" /></label>
            <label><span className="sr-only">Filtrar perfil</span><select value={filtroPerfil} onChange={event => setFiltroPerfil(event.target.value as PerfilUsuario | '')} className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm font-bold"><option value="">Todos os perfis</option>{PERFIS.map(perfil => <option key={perfil.id} value={perfil.id}>{perfil.nome}</option>)}</select></label>
            <button type="button" disabled={atualizando} onClick={() => void carregar()} className="h-11 rounded-lg border border-viva-roxo px-4 text-sm font-black text-viva-roxo disabled:opacity-50">{atualizando ? 'Atualizando...' : 'Atualizar'}</button>
          </div>
          <div className="divide-y divide-gray-100">
            {filtrados.map(usuario => (
              <article key={usuario.id} className="grid min-w-0 gap-3 p-4 lg:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_150px_auto] lg:items-center">
                <div className="min-w-0"><p className="break-words font-black">{usuario.nome}</p><p className="break-all text-sm text-gray-500">{usuario.email}</p>{usuario.telefone && <p className="mt-1 text-xs font-bold text-gray-500">{usuario.telefone}</p>}</div>
                <div className="flex flex-wrap gap-1.5">{PERFIS.filter(perfil => usuario.perfis.includes(perfil.id)).map(perfil => <span key={perfil.id} className={`border px-2 py-1 text-[11px] font-black ${perfil.cor}`}>{perfil.nome}</span>)}</div>
                <div className="text-xs text-gray-500"><p><b>Cadastro:</b> {dataCurta(usuario.criadoEm)}</p><p className="mt-1"><b>Último acesso:</b> {dataCurta(usuario.ultimoAcesso)}</p>{!usuario.emailConfirmado && <p className="mt-1 font-black text-amber-700">E-mail não confirmado</p>}</div>
                <button type="button" onClick={() => abrirFormulario(usuario)} aria-label={`Editar ${usuario.nome}`} className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-black text-viva-roxo">Editar</button>
              </article>
            ))}
            {!filtrados.length && <p className="p-10 text-center text-sm text-gray-500">Nenhum usuário encontrado.</p>}
          </div>
        </section>
      </div>
      {modal && (
        <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/55 p-3 md:p-8">
          <form ref={formularioRef} role="dialog" aria-modal="true" aria-labelledby="titulo-usuario" onSubmit={salvar} className="mx-auto w-full max-w-2xl rounded-lg bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-viva-roxo">Controle de acesso</p><h2 id="titulo-usuario" className="text-xl font-black">{editando ? 'Editar usuário' : 'Novo usuário'}</h2></div><button type="button" disabled={salvando} onClick={() => setModal(false)} aria-label="Fechar" className="h-9 w-9 shrink-0 rounded-lg border text-xl">×</button></div>
            {erroFormulario && <p role="alert" className="mt-4 border-l-4 border-red-500 bg-red-50 p-3 text-sm font-bold text-red-700">{erroFormulario}</p>}
            <fieldset disabled={salvando}>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <label className="text-xs font-bold text-gray-600">Nome completo<input autoFocus required minLength={2} maxLength={160} value={form.nome} onChange={event => setForm({ ...form, nome: event.target.value })} className="mt-1 h-12 w-full rounded-lg border px-3 text-sm" /></label>
                <label className="text-xs font-bold text-gray-600">Telefone<input type="tel" maxLength={30} value={form.telefone} onChange={event => setForm({ ...form, telefone: event.target.value })} className="mt-1 h-12 w-full rounded-lg border px-3 text-sm" /></label>
                <label className="text-xs font-bold text-gray-600 md:col-span-2">E-mail / login<input type="email" required disabled={Boolean(editando)} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} className="mt-1 h-12 w-full rounded-lg border px-3 text-sm disabled:bg-gray-100" /></label>
                <label className="text-xs font-bold text-gray-600">{editando ? 'Nova senha (opcional)' : 'Senha (vazio envia convite)'}<div className="mt-1 flex rounded-lg border"><input autoComplete="new-password" type={mostrarSenha ? 'text' : 'password'} minLength={8} maxLength={128} value={form.senha} onChange={event => setForm({ ...form, senha: event.target.value })} className="h-12 min-w-0 flex-1 rounded-lg px-3 text-sm" /><button type="button" onClick={() => setMostrarSenha(!mostrarSenha)} aria-pressed={mostrarSenha} className="px-3 text-xs text-viva-roxo">{mostrarSenha ? 'Ocultar' : 'Mostrar'}</button></div></label>
                <label className="text-xs font-bold text-gray-600">Confirmar senha<input autoComplete="new-password" required={Boolean(form.senha)} type={mostrarSenha ? 'text' : 'password'} value={form.confirmarSenha} onChange={event => setForm({ ...form, confirmarSenha: event.target.value })} className="mt-1 h-12 w-full rounded-lg border px-3 text-sm" /></label>
              </div>
              <fieldset className="mt-5"><legend className="text-xs font-black uppercase text-gray-500">Perfis de acesso</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{PERFIS.map(perfil => {
                const selecionado = form.perfis.includes(perfil.id);
                return <label key={perfil.id} className={`cursor-pointer border-l-4 p-3 ${selecionado ? perfil.cor : 'border-gray-200 bg-gray-50 text-gray-600'}`}><input type="checkbox" checked={selecionado} onChange={() => setForm(atual => ({ ...atual, perfis: alternarPerfilUsuario(atual.perfis, perfil.id) }))} className="mr-2 h-4 w-4 accent-viva-roxo" /><b className="text-sm">{perfil.nome}</b><span className="mt-1 block pl-6 text-xs font-medium">{perfil.descricao}</span></label>;
              })}</div></fieldset>
              {!form.perfis.includes('student') && <label className="mt-4 block text-xs font-bold text-gray-600">Observações do acesso profissional<textarea maxLength={2000} value={form.observacoes} onChange={event => setForm({ ...form, observacoes: event.target.value })} rows={3} className="mt-1 w-full rounded-lg border p-3 text-sm font-normal" /></label>}
            </fieldset>
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={salvando} onClick={() => setModal(false)} className="h-11 rounded-lg border px-4 text-sm font-black">Cancelar</button><button disabled={salvando} className="h-11 rounded-lg bg-viva-verde px-5 text-sm font-black text-viva-roxo disabled:opacity-50">{salvando ? 'Salvando...' : 'Salvar usuário'}</button></div>
          </form>
        </div>
      )}
    </main>
  );
}
