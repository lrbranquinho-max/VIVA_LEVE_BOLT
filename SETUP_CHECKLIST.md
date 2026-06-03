# Setup Checklist - Viva Leve

Use este checklist para garantir que o projeto está completamente configurado.

## Local Development (✓ Concluído)

- [x] Node.js 18+ instalado
- [x] npm ou yarn funcionando
- [x] Repositório git inicializado
- [x] Dependências instaladas (npm install)
- [x] Variáveis de ambiente configuradas (.env.local)
- [x] Servidor dev roda sem erros (npm run dev)
- [x] Build produção compila (npm run build)

## GitHub Setup

- [ ] Criar conta GitHub (https://github.com)
- [ ] Criar novo repositório em https://github.com/new
- [ ] Nomear: `viva-leve`
- [ ] Tornar público ou privado conforme preferência
- [ ] Configurar remote local:
  ```bash
  git remote add origin https://github.com/SEU-USUARIO/viva-leve.git
  git branch -M main
  git push -u origin main
  ```
- [ ] Verificar push foi bem-sucedido
- [ ] Adicionar colaboradores (se necessário)

## Supabase Configuration

- [x] Projeto Supabase criado
- [x] Database criado e migrations aplicadas
- [x] Tabelas criadas: user_profiles, produtos, pedidos, historico_refeicoes
- [x] RLS ativado em tabelas apropriadas
- [x] Chave anon configurada
- [ ] URL CORS autorizada em "Settings" → "URL Configuration"
  - Adicionar: `http://localhost:3000`
  - Adicionar: `https://seu-deploy.vercel.app`

## Vercel Deployment (Próximo Passo)

- [ ] Criar conta Vercel (https://vercel.com)
- [ ] Conectar repositório GitHub
- [ ] Configurar variáveis de ambiente:
  - [ ] NEXT_PUBLIC_SUPABASE_URL
  - [ ] NEXT_PUBLIC_SUPABASE_ANON_KEY
- [ ] Fazer primeiro deploy
- [ ] Testar aplicação em produção
- [ ] Configurar domínio customizado (opcional)

## Segurança

- [ ] `.env.local` está em `.gitignore`
- [ ] `.env` NÃO está no repositório
- [ ] Senhas não são commitadas
- [ ] Chaves API não são visíveis no código
- [ ] RLS está habilitado em `user_profiles` e `pedidos`
- [ ] CORS está restritivo

## Testes Funcionais

- [ ] Login funciona
- [ ] Registro de novo usuário funciona
- [ ] Perfil pode ser editado
- [ ] Produtos aparecem na vitrine
- [ ] Carrinho funciona
- [ ] Pedido pode ser criado
- [ ] Admin consegue acessar painel
- [ ] Produtos podem ser criados no admin
- [ ] Status de pedido pode ser alterado
- [ ] Recibo pode ser impresso
- [ ] Dieta pode ser rastreada

## CI/CD

- [ ] GitHub Actions workflow configurado
- [ ] Build automático funciona em pull requests
- [ ] Linter passa
- [ ] Build produção passa

## Documentation

- [x] README.md completo
- [x] QUICKSTART.md criado
- [x] DEPLOYMENT.md criado
- [x] GITHUB_SETUP.md criado
- [x] CONTRIBUTING.md criado
- [x] LICENSE (MIT) criado
- [ ] Revisar todos os READMEs
- [ ] Adicionar badges de status ao README principal

## Monitoring & Analytics (Opcional)

- [ ] Sentry configurado para error tracking
- [ ] Google Analytics ou similar configurado
- [ ] Vercel Analytics habilitado
- [ ] Logs do Supabase configurados

## Backup & Disaster Recovery

- [ ] Backup automático do Supabase confirmado
- [ ] Processo de restore testado
- [ ] GitHub tem histórico de commits preservado

## Performance

- [ ] Lighthouse scores acima de 90
- [ ] Imagens otimizadas
- [ ] Bundle size dentro do esperado
- [ ] Database queries otimizadas

## Post-Launch

- [ ] Comunicar URL do site aos stakeholders
- [ ] Treinar usuários admin
- [ ] Monitorar logs em produção
- [ ] Responder a feedback de usuários
- [ ] Planejar melhorias futuras

---

## Comandos Úteis

```bash
# Git
git status                    # Ver status
git log --oneline            # Ver commits
git push origin main         # Fazer push

# Desenvolvimento
npm run dev                  # Iniciar servidor
npm run build                # Build produção
npm run lint                 # Linter

# Supabase (via CLI, opcional)
supabase migration list      # Listar migrações
supabase migration push      # Aplicar migrações
```

## Contatos Úteis

- Supabase Support: https://supabase.com/support
- Vercel Support: https://vercel.com/support
- GitHub Issues: https://github.com/seu-usuario/viva-leve/issues

---

**Status**: [ ] 0% [ ] 25% [ ] 50% [ ] 75% [ ] 100% Completo

Última atualização: 2026-06-02
