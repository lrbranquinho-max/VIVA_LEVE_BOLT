# Guia de Contribuição

Primeiro, muito obrigado por considerar contribuir para o Viva Leve! É pessoas como você que tornam este projeto tão excelente.

## Código de Conduta

Este projeto adere a um Código de Conduta que esperamos que todos os colaboradores sigam. Leia o texto completo para entender quais ações serão e não serão toleradas.

## Como Contribuir

### Relatando Bugs

Antes de criar relatórios de bugs, verifique a lista de issues, pois você pode descobrir que não precisa criar um. Ao criar um relatório de bug, inclua o máximo de detalhes possível:

- **Use um título claro e descritivo** para a issue
- **Descreva os passos exatos** que reproduzem o problema
- **Forneça exemplos específicos** para demonstrar os passos
- **Descreva o comportamento observado** e apontar exatamente o que é o problema
- **Explique qual comportamento você esperava** ver em vez disso

### Sugerindo Melhorias

Sugestões de melhorias são sempre bem-vindas! Siga estas diretrizes:

- **Use um título claro e descritivo** para a sugestão
- **Forneça uma descrição passo-a-passo** da melhoria sugerida
- **Forneça exemplos específicos** para demonstrar as etapas
- **Liste algumas outras aplicações** onde essa melhoria existe

### Pull Requests

- Preencha o modelo de pull request fornecido
- Siga as convenções de estilo e padrões do projeto
- Inclua testes apropriados
- Atualize a documentação necessária
- Termine todos os arquivos com uma nova linha

## Processo de Desenvolvimento

### Setup Local

```bash
# Clone seu fork
git clone https://github.com/seu-usuario/viva-leve.git

# Navegue até o diretório
cd viva-leve

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env.local
# Edite .env.local com suas credenciais Supabase

# Inicie o servidor de desenvolvimento
npm run dev
```

### Criando uma Branch

```bash
# Atualize o repositório principal
git fetch origin
git checkout main

# Crie uma branch com um nome descritivo
git checkout -b feature/sua-feature-aqui
```

### Commits

Use mensagens de commit claras e descritivas:

```
feat: Add novo recurso X
fix: Corrige bug em Y
docs: Atualiza documentação
style: Formata código
refactor: Refatora componente X
test: Adiciona testes para X
```

### Rodando Testes

```bash
npm run lint      # Verifica estilo de código
npm run build     # Compila para produção
```

### Push e Pull Request

```bash
# Push sua branch
git push origin feature/sua-feature-aqui

# Crie um Pull Request via GitHub Web UI
```

## Convenções de Estilo

- Use `const` em vez de `let` ou `var`
- Use camelCase para variáveis e funções
- Use PascalCase para componentes React
- Use comentários apenas para explicar o "por quê", não o "quê"
- Máximo de 80 caracteres por linha (80 cols)

### Formatação de Código

O projeto usa Tailwind CSS para estilos. Siga estas práticas:

```jsx
// Bom
<div className="flex items-center justify-between p-4 bg-white rounded-lg shadow-sm">
  <span className="text-gray-700 font-semibold">Label</span>
  <button className="px-4 py-2 bg-viva-roxo text-white rounded-lg hover:brightness-110">
    Botão
  </button>
</div>

// Evite
<div style={{ display: 'flex', justifyContent: 'space-between' }}>
  {/* inline styles */}
</div>
```

## Estrutura de Componentes

```jsx
// Bom: Componente pequeno e focado
export default function Logo() {
  return (
    <svg>
      {/* SVG content */}
    </svg>
  );
}

// Evite: Componente monolítico
function MyComponent() {
  // 500+ linhas de código
}
```

## Documentação

- Atualize o README.md se adicionar novos recursos
- Documente funções públicas com comentários JSDoc
- Mantenha os exemplos de código atualizados

## Licença

Ao contribuir, você concorda que suas contribuições serão licenciadas sob a mesma licença MIT.

## Perguntas?

Sinta-se livre para abrir uma issue ou entrar em contato com os mantenedores.

---

Obrigado por contribuir para Viva Leve!
