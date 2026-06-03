# Guia de Setup no GitHub

Este projeto está pronto para ser enviado para um repositório no GitHub. Siga os passos abaixo:

## Pré-requisitos

1. Conta no GitHub (https://github.com)
2. Git instalado localmente
3. SSH ou HTTPS configurado no GitHub

## Passos para Enviar para GitHub

### 1. Criar um novo repositório no GitHub

1. Acesse https://github.com/new
2. Preencha os campos:
   - **Repository name**: `viva-leve` (ou seu próprio nome)
   - **Description**: "Plataforma de e-commerce de produtos saudáveis com Next.js e Supabase"
   - **Visibility**: Public ou Private (sua preferência)
   - **Initialize this repository with**: Deixe desmarcado (já temos .gitignore e README)
3. Clique em "Create repository"

### 2. Adicionar o repositório remoto

```bash
# Substitua USER pelo seu username do GitHub
git remote add origin https://github.com/USER/viva-leve.git

# Ou se usar SSH:
# git remote add origin git@github.com:USER/viva-leve.git
```

### 3. Renomear a branch (opcional, mas recomendado)

```bash
git branch -M main
```

### 4. Enviar o código para GitHub

```bash
git push -u origin main
```

Se receber erro de autenticação:
- **HTTPS**: Digite seu Personal Access Token (PAT) em vez da senha
- **SSH**: Certifique-se de ter gerado e adicionado sua chave SSH no GitHub

## Próximos Passos

### Configurar Variáveis de Ambiente no Vercel

Se planeja fazer deploy no Vercel:

1. Acesse https://vercel.com
2. Clique em "New Project"
3. Importe o repositório do GitHub
4. Configure as variáveis de ambiente:
   ```
   NEXT_PUBLIC_SUPABASE_URL=sua_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave
   ```
5. Clique em "Deploy"

### Ativar GitHub Pages (Documentação)

Se desejar hospedar a documentação:

1. Vá para Settings do repositório
2. Navegue até "Pages"
3. Selecione "Deploy from a branch"
4. Branch: main, Folder: / (root)

## Gestão de Branches

Recomendamos seguir este modelo:

```
main              # Produção
├── develop       # Desenvolvimento
├── feature/*     # Novas features
└── bugfix/*      # Correções
```

### Exemplo de fluxo de trabalho:

```bash
# Criar uma nova feature
git checkout -b feature/nova-funcionalidade

# Fazer alterações e commits
git add .
git commit -m "Add nova funcionalidade"

# Enviar a branch
git push origin feature/nova-funcionalidade

# Criar um Pull Request no GitHub
# (GUI no site ou gh pr create)
```

## Segurança

**IMPORTANTE**: Nunca faça commit de:
- `.env` ou `.env.local`
- Credenciais ou chaves de API
- Senhas ou tokens pessoais

Estes arquivos estão no `.gitignore`, mas sempre valide antes de fazer push.

## Problemas Comuns

### "fatal: unable to access 'https://github.com/...': Could not resolve host"
- Verifique sua conexão com internet
- Tente usar SSH em vez de HTTPS

### "Permission denied (publickey)"
- Verifique se sua chave SSH está adicionada ao ssh-agent
- Gere uma nova chave SSH se necessário

### "Everything up-to-date"
- Significa que não há mudanças para enviar
- Faça novos commits antes de fazer push

## Referências

- [GitHub Docs](https://docs.github.com)
- [Git Cheat Sheet](https://github.github.com/training-kit/downloads/github-git-cheat-sheet.pdf)
- [Conventional Commits](https://www.conventionalcommits.org/)

---

Para dúvidas, consulte a documentação oficial do GitHub ou entre em contato com a equipe de desenvolvimento.
