# Viva Leve - Plataforma de Saúde e Praticidade

Uma plataforma moderna de comércio eletrônico focada em produtos saudáveis, desenvolvida com **Next.js 13**, **Tailwind CSS**, e **Supabase**.

## Visão Geral

Viva Leve é um sistema completo de e-commerce com funcionalidades de:
- **Vitrine de Produtos** - Catálogo dinâmico com filtros
- **Carrinho de Compras** - Gerenciamento de pedidos do cliente
- **Rastreamento de Dieta** - Histórico de refeições e macros
- **Painel Administrativo** - Gestão completa de pedidos e produtos
- **Autenticação** - Sistema de login e registro com Supabase Auth
- **Perfil do Usuário** - Gerenciamento de dados pessoais

## Stack Tecnológico

- **Frontend**: Next.js 13 (App Router) + React 18
- **Styling**: Tailwind CSS 3
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth (Email/Password)
- **Deployment**: Otimizado para Vercel

## Instalação Rápida

### Pré-requisitos
- Node.js 18+
- npm ou yarn
- Conta Supabase

### Setup Local

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/viva-leve.git
cd viva-leve

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env.local

# Inicie o servidor de desenvolvimento
npm run dev
```

Acesse http://localhost:3000

## Estrutura do Projeto

```
viva-leve/
├── app/
│   ├── page.tsx              # Vitrine principal
│   ├── login/                # Autenticação
│   ├── perfil/               # Perfil do usuário
│   ├── dieta/                # Rastreamento de dieta
│   ├── admin/                # Painel administrativo
│   ├── layout.tsx            # Layout principal
│   └── globals.css           # Estilos globais
├── components/
│   └── Logo.tsx              # Componente de logo
├── supabase/
│   └── migrations/           # Migrações do banco de dados
├── public/                   # Arquivos estáticos
└── supabase.js              # Configuração Supabase
```

## Funcionalidades Principais

### 1. Vitrine de Produtos (`/`)
- Lista de produtos ativos com estoque
- Carrinho de compras
- Integração com WhatsApp
- Filtragem por categoria

### 2. Painel Administrativo (`/admin`)
- Gestão de pedidos em tempo real
- Alteração de status de pedido
- Impressão de recibos para impressora térmica (80mm)
- CRUD completo de produtos
- Toggle ativo/inativo (soft delete)
- Upload de imagem (URL)
- Informações nutricionais

### 3. Autenticação (`/login`)
- Registro e login com email/password
- Coleta de dados pessoais
- Persistência de sessão

### 4. Perfil do Usuário (`/perfil`)
- Visualização e edição de dados
- Atualização de endereço

### 5. Rastreamento de Dieta (`/dieta`)
- Histórico de refeições
- Informações nutricionais
- Visualização de macros

## Variáveis de Ambiente

Crie um arquivo `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anonima
```

## Scripts Disponíveis

```bash
npm run dev          # Desenvolvimento
npm run build        # Build para produção
npm start           # Servidor de produção
npm run lint        # Linter
```

## Database Schema

### Tabelas Principais

- **auth.users** - Autenticação Supabase
- **user_profiles** - Dados do usuário
- **produtos** - Catálogo de produtos
- **pedidos** - Histórico de pedidos
- **historico_refeicoes** - Rastreamento de dieta

## Deployment

### Vercel (Recomendado)

1. Push para GitHub
2. Conecte no [Vercel](https://vercel.com)
3. Configure variáveis de ambiente
4. Deploy automático

## Contribuindo

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Add feature'`)
4. Push (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## Licença

MIT License - veja [LICENSE](LICENSE)

---

**Versão**: 1.0.0  
**Desenvolvido**: 2026
