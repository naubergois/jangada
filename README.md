# Jangada

<p align="center">
  <img src="docs/images/jangada-icon.png" alt="Ícone do Jangada" width="96" height="96">
</p>

<p align="center">
  Kanban de código aberto da <strong>Assessoria de Sistemas e Informática (ASESI)</strong>
  da <strong>Controladoria e Ouvidoria Geral do Estado do Ceará (CGE-CE)</strong>.
</p>

<p align="center">
  <img src="docs/images/jangada-hero.png" alt="Jangada — Terra da Luz e gestão pública digital" width="100%">
</p>

O Jangada organiza boards, listas, cards, requisitos e dailies da gestão pública cearense, com a gestora virtual **Maya** e identidade visual do Governo do Ceará (Terra da Luz).

| | |
|---|---|
| **Órgão** | Controladoria e Ouvidoria Geral do Estado do Ceará (CGE-CE) |
| **Unidade** | Assessoria de Sistemas e Informática (ASESI) |
| **Licença** | [MIT](LICENSE) — software livre / open source |
| **GitHub** | [naubergois/jangada](https://github.com/naubergois/jangada) |
| **GitLab ASESI** | [g_asesi/jangada](https://git.cge.ce.gov.br/g_asesi/jangada) |

Este repositório contém **apenas o código-fonte**. Boards, usuários, conversas, anexos e demais dados de execução **não** entram no Git.

## O que o Jangada faz

O quadro, a gestora **Maya** e o servidor **MCP** operam o mesmo PostgreSQL. Quatro loops no mesmo estado:

1. **Requisito → spec, Gherkin, brief de código e handoff** para o IDE institucional
2. **Fala em português → tools no quadro** (criar, mover, atribuir, daily)
3. **Git → coluna Riscos Maya** (cobertura do card + shift-left: .env, segredo, CI/teste)
4. **IDE → o mesmo Postgres** — o desenvolvedor grava o board enquanto implementa

Maya não commita. Quem gera o código é o agente do IDE. Sem chave de LLM o board permanece.

- Quadros Kanban com listas, cards, prazos, responsáveis, checklist e requisitos
- Hierarquia de boards (organização → unidade → time → projeto)
- Convites, equipes e papéis (administrador cadastra os demais)
- Anexos e observações diárias nos cards
- Reuniões da equipe (Jitsi)
- Servidor MCP (`npm run mcp`) para o IDE institucional (VS Code / MCP)

<p align="center">
  <img src="docs/images/jangada-board.png" alt="Quadro Kanban do Jangada" width="100%">
</p>

<p align="center"><em>Quadro Kanban com listas, cards, prazos e responsáveis.</em></p>

<p align="center">
  <img src="docs/images/jangada-maya.png" alt="Maya, gestora virtual do Jangada" width="100%">
</p>

<p align="center"><em>Maya analisa riscos, conduz a daily e atualiza o quadro.</em></p>

Fluxo típico:

1. Entrar em `/login` com a conta de administrador definida no ambiente.
2. Abrir um board, criar um novo ou aceitar um convite.
3. Arrastar cards, atribuir pessoas e registrar requisitos.
4. Conversar com a Maya para daily, prioridades e atualização do quadro.
5. Abrir reunião virtual quando a equipe precisar.

## Stack

- Next.js 16 (App Router), TypeScript e Tailwind CSS 4
- Auth.js (`next-auth`) — usuário e senha
- Zustand no cliente
- PostgreSQL (`pg`) — persistência oficial
- `@dnd-kit` — arrastar e soltar
- Maya: DeepSeek ou LiteLLM (com motor local se a chave não estiver definida)
- Jitsi Meet (salas via iframe)

Sem variáveis `PG_*`, o app grava em arquivos locais em `data/` (somente desenvolvimento; essa pasta está no `.gitignore`).

## Como rodar localmente

É preciso **Node.js 20+**.

```powershell
npm install
copy .env.example .env.local
```

Em `.env.local` (nunca versionado):

1. Gere `AUTH_SECRET`:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
2. Defina uma senha forte em `ADMIN_PASSWORD`.
3. Preencha o PostgreSQL (`PG_HOST`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD`) **ou** deixe em branco para usar `data/` local.
4. Opcional: `DEEPSEEK_API_KEY` para a Maya.

```powershell
npm run db:ensure
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). O administrador cadastra os demais em `/admin/usuarios`.

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Servir o build |
| `npm run test` | Vitest |
| `npm run typecheck` | TypeScript |
| `npm run db:ensure` | Cria o schema e as tabelas no Postgres |
| `npm run mcp` | Servidor MCP stdio (Cursor e Kiro) |

## Persistência

A persistência oficial da ASESI é PostgreSQL, schema `trelloai` (nome técnico legado; **não** misturar com outros sistemas). Homologação e produção usam o cofre de secrets e o CI do GitLab (`homol` e `production`).

O código público **não** inclui:

- dumps, backups ou JSON de boards
- `.env`, senhas, tokens ou IPs internos
- conversas da Maya, anexos ou dados de usuários

Copie `.env.example` para `.env.local` e preencha com o ambiente de vocês.

## MCP (IDE institucional)

O servidor stdio `scripts/jangada-mcp.mjs` grava no mesmo Postgres (ou em `data/` sem `PG_*`). Qualquer cliente MCP (VS Code, Cursor, Kiro) usa as mesmas tools.

Tools principais: `jangada_listar_boards`, `jangada_ver_board`, `jangada_criar_card`, `jangada_criar_cards`, `jangada_criar_requisito`, `jangada_anexar_arquivo`, `jangada_mover_card`, `jangada_adicionar_git`.

## Repositórios

O desenvolvimento interno da ASESI e o deploy (Swarm / Nexus) continuam no **GitLab**. O **GitHub** é o espelho público do código, sem dados de execução.

```text
origin   → https://github.com/naubergois/jangada  (código aberto)
gitlab   → GitLab ASESI (CI e homologação/produção)
```

## Licença

Copyright © 2026 **Controladoria e Ouvidoria Geral do Estado do Ceará (CGE-CE)** — **Assessoria de Sistemas e Informática (ASESI)**.

Distribuído sob a licença [MIT](LICENSE): você pode usar, copiar, modificar e distribuir o Jangada, inclusive em trabalhos derivados, desde que mantenha o aviso de copyright e da licença.
