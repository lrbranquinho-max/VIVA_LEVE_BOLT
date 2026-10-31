"use client";

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '../../components/Logo';
import BottomNav from '../../components/BottomNav';

const REGIOES_ATIVAS_FALLBACK = [
  { regiao: 'Gama', uf: 'DF' },
  { regiao: 'Santa Maria', uf: 'DF' },
  { regiao: 'Cidade Ocidental', uf: 'GO' },
  { regiao: 'Novo Gama', uf: 'GO' },
  { regiao: 'Pedregal', uf: 'GO' },
  { regiao: 'Valparaíso de Goiás', uf: 'GO' },
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
  const [enderecoUf, setEnderecoUf] = useState('');
  const [fiscalCpfCnpj, setFiscalCpfCnpj] = useState('');
  const [fiscalIe, setFiscalIe] = useState('');
  const [fiscalIndicadorIe, setFiscalIndicadorIe] = useState('9');
  const [fiscalCep, setFiscalCep] = useState('');
  const [fiscalCodigoIbge, setFiscalCodigoIbge] = useState('');
  const [regioesAtivas, setRegioesAtivas] = useState(REGIOES_ATIVAS_FALLBACK);
  const [email, setEmail] = useState('');
  const [admin, setAdmin] = useState(false);
  const ufsAtendidas = useMemo(() => Array.from(new Set(regioesAtivas.map(item => item.uf))).sort(), [regioesAtivas]);
  const regioesDaUf = useMemo(() => regioesAtivas.filter(item => !enderecoUf || item.uf === enderecoUf), [enderecoUf, regioesAtivas]);

  useEffect(() => {
    async function carregarPerfil() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      setEmail(user.email ?? '');

      const [perfilResultado, clienteResultado, regioesResultado, adminResultado] = await Promise.all([
        supabase
          .from('perfis')
          .select('nome, telefone')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('perfis_clientes')
          .select('endereco_rua, endereco_numero, endereco_complemento, bairro, regiao_df, endereco_uf, fiscal_cpf_cnpj, fiscal_inscricao_estadual, fiscal_indicador_ie, fiscal_cep, fiscal_codigo_municipio_ibge')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('regioes_atendimento')
          .select('regiao, uf')
          .eq('status', 'ativa')
          .order('regiao'),
        supabase.rpc('is_viva_leve_admin'),
      ]);
      setAdmin(adminResultado.data === true);

      const perfil = perfilResultado.data;

      if (perfil) {
        setNome(perfil.nome ?? '');
        setTelefone(perfil.telefone ?? '');
      }

      const perfilCliente = clienteResultado.data;

      if (perfilCliente) {
        setEnderecoRua(perfilCliente.endereco_rua ?? '');
        setEnderecoNumero(perfilCliente.endereco_numero ?? '');
        setEnderecoComplemento(perfilCliente.endereco_complemento ?? '');
        setBairro(perfilCliente.bairro ?? '');
        const regiaoCadastrada = (regioesResultado.data ?? REGIOES_ATIVAS_FALLBACK).find(item => item.regiao === perfilCliente.regiao_df);
        setRegiaoDf(regiaoCadastrada?.regiao ?? perfilCliente.regiao_df ?? '');
        setEnderecoUf(perfilCliente.endereco_uf ?? regiaoCadastrada?.uf ?? '');
        setFiscalCpfCnpj(perfilCliente.fiscal_cpf_cnpj ?? ''); setFiscalIe(perfilCliente.fiscal_inscricao_estadual ?? '');
        setFiscalIndicadorIe(perfilCliente.fiscal_indicador_ie ?? '9'); setFiscalCep(perfilCliente.fiscal_cep ?? '');
        setFiscalCodigoIbge(perfilCliente.fiscal_codigo_municipio_ibge ?? '');
      }

      if (!regioesResultado.error && regioesResultado.data?.length) {
        setRegioesAtivas(regioesResultado.data);
      }

      setLoading(false);
    }
    carregarPerfil();
  }, [router]);

  const salvarPerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensagem(null);
    const documentoFiscal=fiscalCpfCnpj.replace(/\D/g,''); const cepFiscal=fiscalCep.replace(/\D/g,''); const ibgeFiscal=fiscalCodigoIbge.replace(/\D/g,'');
    if(documentoFiscal&&!([11,14].includes(documentoFiscal.length))){setMensagem({texto:'CPF/CNPJ fiscal deve ter 11 ou 14 dígitos.',tipo:'erro'});return}
    if(cepFiscal&&cepFiscal.length!==8){setMensagem({texto:'CEP fiscal deve ter 8 dígitos.',tipo:'erro'});return}
    if(ibgeFiscal&&ibgeFiscal.length!==7){setMensagem({texto:'Código IBGE deve ter 7 dígitos.',tipo:'erro'});return}
    setSalvando(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSalvando(false); return; }

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
        endereco_uf: enderecoUf,
        fiscal_cpf_cnpj: documentoFiscal || null,
        fiscal_inscricao_estadual: fiscalIe.replace(/\D/g, '') || null,
        fiscal_indicador_ie: fiscalIndicadorIe || '9',
        fiscal_cep: cepFiscal || null,
        fiscal_codigo_municipio_ibge: ibgeFiscal || null,
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

          <details className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer text-sm font-bold uppercase tracking-wider text-gray-500">Dados fiscais opcionais</summary>
            <p className="mt-2 text-xs text-gray-500">Preencha apenas se precisar de identificação na nota fiscal. Esses dados não são exigidos para navegar ou comprar.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-gray-600">CPF/CNPJ<input value={fiscalCpfCnpj} onChange={e=>setFiscalCpfCnpj(e.target.value.replace(/\D/g,''))} maxLength={14} className="mt-1 w-full rounded-xl border bg-gray-50 p-3 text-sm" /></label>
              <label className="text-xs font-bold text-gray-600">Indicador de IE<select value={fiscalIndicadorIe} onChange={e=>setFiscalIndicadorIe(e.target.value)} className="mt-1 w-full rounded-xl border bg-gray-50 p-3 text-sm"><option value="9">Não contribuinte</option><option value="2">Contribuinte isento</option><option value="1">Contribuinte com IE</option></select></label>
              <label className="text-xs font-bold text-gray-600">Inscrição estadual<input value={fiscalIe} onChange={e=>setFiscalIe(e.target.value.replace(/\D/g,''))} className="mt-1 w-full rounded-xl border bg-gray-50 p-3 text-sm" /></label>
              <label className="text-xs font-bold text-gray-600">CEP<input value={fiscalCep} onChange={e=>setFiscalCep(e.target.value.replace(/\D/g,''))} maxLength={8} className="mt-1 w-full rounded-xl border bg-gray-50 p-3 text-sm" /></label>
              <label className="text-xs font-bold text-gray-600 sm:col-span-2">Código do município IBGE<input value={fiscalCodigoIbge} onChange={e=>setFiscalCodigoIbge(e.target.value.replace(/\D/g,''))} maxLength={7} className="mt-1 w-full rounded-xl border bg-gray-50 p-3 text-sm" /></label>
            </div>
          </details>

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

            <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">UF</label>
                <select
                  required
                  value={enderecoUf}
                  onChange={e => {
                    const proximaUf = e.target.value;
                    setEnderecoUf(proximaUf);
                    if (!regioesAtivas.some(item => item.uf === proximaUf && item.regiao === regiaoDf)) setRegiaoDf('');
                  }}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-viva-verde transition text-sm text-gray-900"
                >
                  <option value="">UF</option>
                  {ufsAtendidas.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
              <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Região / Cidade</label>
              <select
                required
                value={regiaoDf}
                onChange={e => setRegiaoDf(e.target.value)}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-viva-verde transition text-sm text-gray-900"
              >
                <option value="">Selecione a região</option>
                {regioesDaUf.map(item => <option key={`${item.uf}-${item.regiao}`} value={item.regiao}>{item.regiao}</option>)}
              </select>
              </div>
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

        <Link href="/meu-plano" className="mt-4 flex min-h-[52px] items-center justify-between rounded-lg border border-purple-200 bg-purple-50 px-4 font-bold text-viva-roxo"><span>Meu Plano Dieta & Treino</span><span aria-hidden="true">→</span></Link>
        <Link href="/meus-planos" className="mt-3 flex min-h-[52px] items-center justify-between rounded-lg border border-purple-200 bg-purple-50 px-4 font-bold text-viva-roxo"><span>Meus Planos de Marmitas</span><span aria-hidden="true">→</span></Link>
        {admin && <Link href="/admin" className="mt-3 flex min-h-[52px] items-center justify-between rounded-lg bg-viva-roxo px-4 font-bold text-white"><span>Acessar área administrativa</span><span aria-hidden="true">→</span></Link>}

        <button
          onClick={sair}
          className="w-full mt-4 py-3 rounded-xl border-2 border-red-200 text-red-500 font-bold text-sm hover:bg-red-50 transition"
        >
          Sair da Conta
        </button>
      </main>

      <BottomNav active="perfil" />
    </div>
  );
}
