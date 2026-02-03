# Bethel Closer

Sistema de CRM completo para gestão de vendas e ligações, com análise de IA integrada.

## Funcionalidades

- **Dashboard** - Visão geral de métricas, metas e performance
- **Gestão de Clientes** - Cadastro, pipeline de vendas, tags e atividades
- **Gestão de Ligações** - Agendamento, registro e acompanhamento de chamadas
- **Análise de IA** - Análise automática de ligações com GPT-4
- **Autenticação** - Login seguro com Supabase Auth
- **Responsivo** - Interface adaptável para desktop e mobile

## Stack Tecnológica

- **Frontend**: React 18 + TypeScript
- **Build**: Vite
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: TanStack Query + Zustand
- **Backend**: Supabase (PostgreSQL + Auth)
- **IA**: OpenAI GPT-4
- **Deploy**: Vercel

## Configuração

### 1. Clone o repositório

```bash
git clone https://github.com/TomasBalestrin/Bethel-Closer.git
cd Bethel-Closer
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
VITE_SUPABASE_URL=sua_url_do_supabase
VITE_SUPABASE_ANON_KEY=sua_chave_anonima_do_supabase
VITE_OPENAI_API_KEY=sua_chave_da_openai
```

### 4. Configure o Supabase

1. Crie um projeto no [Supabase](https://supabase.com)
2. Execute as migrações em `supabase/migrations/001_initial_schema.sql`
3. Configure as políticas de RLS conforme necessário

### 5. Execute o projeto

```bash
npm run dev
```

O projeto estará disponível em `http://localhost:5173`

## Deploy na Vercel

1. Faça push do código para o GitHub
2. Conecte o repositório na [Vercel](https://vercel.com)
3. Configure as variáveis de ambiente
4. Deploy automático a cada push

## Estrutura do Projeto

```
src/
├── components/     # Componentes React
│   ├── ui/         # Componentes base (shadcn)
│   └── layout/     # Layout da aplicação
├── hooks/          # React hooks customizados
├── lib/            # Utilitários e helpers
├── pages/          # Páginas da aplicação
├── services/       # Serviços (Supabase, OpenAI)
├── stores/         # Stores Zustand
└── types/          # Definições TypeScript
```

## Scripts Disponíveis

- `npm run dev` - Inicia o servidor de desenvolvimento
- `npm run build` - Build para produção
- `npm run preview` - Preview do build
- `npm run lint` - Executa o linter

## Licença

MIT
