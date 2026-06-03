# Guia de Deploy - Viva Leve

Este guia cobre como fazer o deploy da aplicação Viva Leve em produção.

## Pré-requisitos Globais

- Repositório no GitHub
- Conta no Vercel (https://vercel.com)
- Conta no Supabase (https://supabase.com)
- Node.js 18+ instalado localmente

## 1. Preparar o Projeto para Deploy

### 1.1 Verificar Build Local

```bash
# Limpe o cache
rm -rf .next

# Execute o build
npm run build

# Se houver erros, corrija-os antes de continuar
```

### 1.2 Testar Localmente

```bash
# Inicie o servidor de produção localmente
npm run build
npm start

# Acesse http://localhost:3000 e teste todas as funcionalidades
```

### 1.3 Preparar Variáveis de Ambiente

Confirme que tem no `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=sua_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anonima
```

## 2. Deploy no Vercel (Recomendado)

### 2.1 Conectar Repositório

1. Acesse https://vercel.com/dashboard
2. Clique em "Add New" → "Project"
3. Selecione "Import Git Repository"
4. Procure por "viva-leve" e selecione seu repositório
5. Clique em "Import"

### 2.2 Configurar Variáveis de Ambiente

1. Na página do projeto, vá para "Settings"
2. Clique em "Environment Variables"
3. Adicione:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Clique em "Save"

### 2.3 Fazer Deploy

1. Clique em "Deploy"
2. Aguarde a conclusão do build
3. Acesse a URL fornecida (ex: viva-leve.vercel.app)

### 2.4 Configurar Domínio Customizado (Opcional)

1. Em "Settings" → "Domains"
2. Clique em "Add"
3. Digite seu domínio customizado
4. Siga as instruções para configurar DNS

## 3. Configurar Supabase para Produção

### 3.1 Ajustar Configurações

1. Acesse https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá para "Project Settings"

### 3.2 Configurar URL de Origem (CORS)

1. Vá para "Authentication" → "URL Configuration"
2. Em "Authorized redirect URLs", adicione:
   - `http://localhost:3000` (desenvolvimento)
   - `https://sua-url.vercel.app` (produção)
   - `https://seu-dominio.com` (se usar domínio customizado)

### 3.3 Configurar Email Customizado (Opcional)

1. Vá para "Authentication" → "Email Templates"
2. Customize templates se necessário

## 4. Monitoramento em Produção

### 4.1 Logs do Vercel

1. Na dashboard do Vercel
2. Vá para "Deployments"
3. Clique em um deployment para ver logs
4. Use a aba "Logs" para ver erros e informações

### 4.2 Monitorar Banco de Dados

1. Na dashboard do Supabase
2. Vá para "Database" → "Querying"
3. Rode queries de diagnóstico
4. Monitore "Database Logs"

### 4.3 Configurar Alertas

Considere configurar alertas para:
- Erros de build no Vercel
- Limites de taxa (rate limits) no Supabase
- Falhas de conexão ao banco

## 5. Atualizar Aplicação em Produção

### 5.1 Fazer Alterações Locais

```bash
# Crie uma branch
git checkout -b feature/nova-feature

# Faça suas alterações
# Teste localmente
npm run dev

# Commit
git add .
git commit -m "Add nova feature"

# Push
git push origin feature/nova-feature
```

### 5.2 Criar Pull Request

1. Vá para GitHub
2. Clique em "Pull requests"
3. Clique em "New pull request"
4. Selecione sua branch
5. Descreva as mudanças
6. Clique em "Create pull request"

### 5.3 Merge e Deploy

1. Após review, clique em "Merge pull request"
2. A compilação automática será acionada no Vercel
3. Após sucesso, a aplicação estará atualizada automaticamente

## 6. Backup e Recuperação

### 6.1 Backup Automático do Supabase

O Supabase faz backup automático. Para acessar:

1. Vá para "Settings" → "Backups"
2. Você verá lista de backups automáticos
3. Pode restaurar a qualquer momento

### 6.2 Backup Manual

```bash
# Exporte o schema
pg_dump --schema-only seu-db > schema.sql

# Exporte os dados
pg_dump seu-db > backup.sql
```

## 7. Troubleshooting

### Problema: Build falha no Vercel

```
# Solução
1. Verifique os logs do Vercel
2. Execute `npm run build` localmente
3. Corrija erros encontrados
4. Faça push das correções
```

### Problema: Variáveis de ambiente não carregam

```
# Solução
1. Confirme que estão em "Settings" → "Environment Variables"
2. Redeploy o projeto (Vercel → Deployments → Redeploy)
3. Verifique que não há espaços extras
```

### Problema: Banco de dados não conecta

```
# Solução
1. Verifique URL e chave no .env.local
2. Confirme que a URL está em CORS autorizado
3. Verifique conexão com `supabase.from('produtos').select('count').maybeSingle()`
4. Verifique se banco está ativo (Supabase Dashboard)
```

### Problema: Autenticação não funciona

```
# Solução
1. Verifique "URL Configuration" no Supabase
2. Adicione sua URL do Vercel em "Authorized redirect URLs"
3. Limpe cookies do navegador
4. Teste em navegador privado
```

## 8. Performance e Otimização

### 8.1 Analisar Performance

1. Use Lighthouse (DevTools → Lighthouse)
2. Use Web Vitals (Vercel Analytics)
3. Monitore Query Performance (Supabase)

### 8.2 Otimizar Imagens

- Use Supabase Storage para imagens
- Implemente lazy loading com `next/image`
- Otimize imagens antes de upload (formato WebP)

### 8.3 Otimizar Banco de Dados

- Adicione índices para colunas frequentemente consultadas
- Use `select()` para solicitar apenas campos necessários
- Implemente paginação para grandes datasets

## 9. Segurança em Produção

### 9.1 Checklist de Segurança

- [ ] `.env` nunca faz commit
- [ ] CORS está restritivo
- [ ] RLS está habilitado em tabelas sensíveis
- [ ] Senhas são criptografadas (Supabase já faz)
- [ ] Validação de entrada em todos os formulários
- [ ] Rate limiting configurado (se necessário)
- [ ] Headers de segurança configurados

### 9.2 Rotação de Chaves

Periodicamente:
1. Regenere as chaves do Supabase
2. Atualize em Vercel → Environment Variables
3. Teste a aplicação
4. Revogue chaves antigas

## 10. Escalabilidade Futura

Quando o projeto crescer:

- [ ] Implementar caching com Redis
- [ ] Usar CDN para arquivos estáticos
- [ ] Separar banco de leitura/escrita
- [ ] Implementar filas (ex: Bull Queue)
- [ ] Usar Edge Functions para lógica pesada
- [ ] Implementar observabilidade (Sentry, etc)

---

Para dúvidas ou suporte, consulte:
- [Documentação Vercel](https://vercel.com/docs)
- [Documentação Supabase](https://supabase.com/docs)
- [Documentação Next.js](https://nextjs.org/docs)
