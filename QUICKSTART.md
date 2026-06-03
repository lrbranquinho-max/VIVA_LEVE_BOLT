# Viva Leve - Quick Start Guide

Bem-vindo ao projeto Viva Leve! Este guia ajuda você a começar rapidamente.

## 1. Clonar o Repositório

```bash
git clone https://github.com/seu-usuario/viva-leve.git
cd viva-leve
```

## 2. Instalar Dependências

```bash
npm install
```

## 3. Configurar Variáveis de Ambiente

```bash
# Copie o arquivo de exemplo
cp .env.example .env.local

# Edite com suas credenciais Supabase
# NEXT_PUBLIC_SUPABASE_URL=sua_url
# NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave
```

## 4. Inicie o Servidor de Desenvolvimento

```bash
npm run dev
```

Acesse http://localhost:3000

## 5. Estrutura da Aplicação

```
/ (home)           → Vitrine de produtos
/login             → Autenticação
/perfil            → Perfil do usuário
/dieta             → Rastreamento de dieta
/admin             → Painel administrativo
```

## 6. Contas de Teste

Para testar, crie contas no formulário de registro em `/login`.

**Admin**: Qualquer usuário logado pode acessar `/admin` (sem permissões no MVP).

## 7. Próximos Passos

- [ ] Leia [README.md](./README.md) para visão geral completa
- [ ] Leia [CONTRIBUTING.md](./CONTRIBUTING.md) para contribuir
- [ ] Leia [DEPLOYMENT.md](./DEPLOYMENT.md) para fazer deploy
- [ ] Leia [GITHUB_SETUP.md](./GITHUB_SETUP.md) para configurar GitHub

## 8. Stack Tecnológico

- **Next.js 13** - Framework React
- **Tailwind CSS** - Styling
- **Supabase** - Database & Auth
- **TypeScript** - Type Safety

## 9. Troubleshooting

### "Port 3000 already in use"

```bash
npm run dev -- -p 3001
```

### "Module not found"

```bash
npm install
```

### "Database connection error"

1. Confirme `.env.local` com credenciais Supabase
2. Confirme que banco está ativo
3. Tente novamente

## 10. Contato e Suporte

- 📖 [Documentação Oficial](./README.md)
- 🐛 [Reportar Bug](https://github.com/seu-usuario/viva-leve/issues)
- 💡 [Sugerir Feature](https://github.com/seu-usuario/viva-leve/discussions)

---

Happy coding! 🚀
