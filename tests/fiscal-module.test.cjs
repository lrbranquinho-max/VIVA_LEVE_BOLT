const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const read = file => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
function loadTs(relative) { const file=path.resolve(process.cwd(),relative); const compiled=new Module(file,module); compiled.filename=file; compiled.paths=Module._nodeModulePaths(path.dirname(file)); compiled._compile(ts.transpileModule(read(relative),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file); return compiled.exports; }

test('provider DotCompany usa endpoints oficiais, Bearer e idempotência sem expor token', async () => {
  const { DotCompanyFiscalProvider } = loadTs('lib/fiscal/DotCompanyFiscalProvider.ts');
  const calls=[];
  const provider=new DotCompanyFiscalProvider('dc_test_secret','https://api.dotcompany.com.br',async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({success:true,autorizada:true,nota_id:12,numero:'1',serie:'1',chave_acesso:'1'.repeat(44),protocolo:'SANDBOX-1'}),{status:200,headers:{'Content-Type':'application/json'}})});
  const result=await provider.issue({documentType:'nfce',environment:'homologacao',idempotencyKey:'4ac9ad1b-7288-43ee-afaf-76821ff5cd58',payload:{itens:[{descricao:'Teste'}]}});
  assert.equal(result.status,'authorized'); assert.equal(calls[0].url,'https://api.dotcompany.com.br/api/v1/nfce');
  assert.equal(calls[0].init.headers.Authorization,'Bearer dc_test_secret'); assert.equal(calls[0].init.headers['X-Sandbox-Mode'],'simulado');
  assert.equal(calls[0].init.headers['Idempotency-Key'],'4ac9ad1b-7288-43ee-afaf-76821ff5cd58');
  assert.doesNotMatch(JSON.stringify(result),/dc_test_secret/);
});

test('provider implementa contrato de emissão, consulta, cancelamento, XML e DANFE', () => {
  const source=read('lib/fiscal/DotCompanyFiscalProvider.ts');
  for(const endpoint of ['/api/v1/${request.documentType}','/api/v1/nfe/consultar','/api/v1/nfe/cancelar','/api/v1/nfe/xml','/api/v1/nfe/danfe']) assert.match(source,new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(read('lib/fiscal/types.ts'),/interface FiscalProvider/);
});

test('Edge Function mantém segredo server-side, sandbox simulado, retry e webhook HMAC', () => {
  const source=read('supabase/functions/fiscal-dispatch/index.ts'); const runtimeProvider=read('supabase/functions/fiscal-dispatch/provider.ts');
  assert.match(source,/Deno\.env\.get\('DOTCOMPANY_API_TOKEN'\)/); assert.doesNotMatch(source,/NEXT_PUBLIC_DOTCOMPANY/);
  assert.match(runtimeProvider,/X-Sandbox-Mode.*simulado/); assert.match(runtimeProvider,/Idempotency-Key/); assert.match(source,/x-webhook-signature-256/);
  assert.match(source,/status === 408 \|\| response\.status === 429 \|\| response\.status >= 500/);
  assert.match(source,/response\.status === 422 \? 'rejected'/); assert.match(source,/FISCAL_MODULE_DISABLED/);
  assert.ok(source.indexOf('if (!ids.length)') < source.lastIndexOf("Deno.env.get('DOTCOMPANY_API_TOKEN')"),'cron vazio deve terminar antes de exigir token');
  assert.match(source,/createFiscalProvider/); assert.match(runtimeProvider,/interface FiscalProvider/);
});

test('configuração fiscal exige confirmação para produção/automático e começa desabilitada', () => {
  const { fiscalConfigSchema }=loadTs('lib/fiscal/config.ts');
  const base={modo:'disabled',provedor:'dotcompany',ambiente:'homologacao',tipo_documento_padrao:'nfce',serie_nfe:null,serie_nfce:null,provider_emitter_ref:null,max_tentativas:4,ativo:true};
  assert.equal(fiscalConfigSchema.safeParse(base).success,true);
  assert.equal(fiscalConfigSchema.safeParse({...base,modo:'automatic'}).success,false);
  assert.equal(fiscalConfigSchema.safeParse({...base,modo:'automatic',confirmacao_risco:'CONFIRMAR ATIVACAO FISCAL'}).success,true);
  assert.match(read('supabase/migrations/20261030192017_modulo_fiscal_desacoplado.sql'),/modo text not null default 'disabled'/);
});

test('admin fiscal consome cadastro-mestre, protege segredos e pedido aprovado', () => {
  const config=read('app/api/admin/fiscal/config/route.ts'); const docs=read('app/api/admin/fiscal/documentos/route.ts'); const migration=read('supabase/migrations/20261030192017_modulo_fiscal_desacoplado.sql');
  assert.match(config,/empresa_auditoria/); assert.match(config,/segredoPersistidoNaTabela:false/); assert.doesNotMatch(config,/DOTCOMPANY_API_TOKEN.*process\.env/);
  assert.match(migration,/join public\.empresas/); assert.match(migration,/pagamento_status,''\) <> 'approved'/);
  assert.match(docs,/fiscalReadiness/); assert.match(docs,/criar_documento_fiscal_manual/);
  const actions=read('components/FiscalOrderActions.tsx');
  assert.match(docs,/tipo_documento_padrao/); assert.match(actions,/Cancelar documento/); assert.match(actions,/Tentar novamente/);
  assert.match(actions,/config\.modo==='disabled'/); assert.match(actions,/config\.modo==='manual'/); assert.match(actions,/CPF\/CNPJ/);
  assert.match(read('app/admin/page.tsx'),/FiscalOrderActions/); assert.match(read('app/admin/configuracoes/fiscal/page.tsx'),/Módulo Fiscal/);
});
