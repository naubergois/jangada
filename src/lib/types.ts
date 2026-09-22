export type LabelColor =
  | "teal"
  | "amber"
  | "rose"
  | "sky"
  | "lime"
  | "violet";

export interface Label {
  id: string;
  name: string;
  color: LabelColor;
}

export interface Card {
  id: string;
  listId: string;
  title: string;
  description: string;
  labels: Label[];
  /** Cor própria do card (id da paleta ou #hex). Ausente usa o tema do board. */
  coverColor?: string | null;
  /** Card gerado pela Maya (coluna de riscos) */
  origin?: "maya" | null;
  /** Chave estável do risco para a Maya atualizar em vez de duplicar */
  originKey?: string | null;
  /** Início previsto (YYYY-MM-DD). */
  startDate?: string | null;
  /** Fim / prazo (YYYY-MM-DD). */
  dueDate: string | null;
  /** Observações diárias no intervalo do card. */
  dailyNotes?: CardDailyNote[];
  priority: "low" | "medium" | "high" | null;
  /** Responsável principal (primeiro de assigneeIds; compatível com dados antigos) */
  assigneeId: string | null;
  /** Um ou mais responsáveis (time ou externos). */
  assigneeIds?: string[];
  /** Requisito vinculado (opcional) */
  requirementId: string | null;
  /** Critérios de aceite / notas de validação */
  acceptanceCriteria: string;
  /** Checklist simples */
  checklist: ChecklistItem[];
  comments: CardComment[];
  /** Arquivos e links anexados ao card (UI e MCP). */
  attachments?: CardAttachment[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CardAttachmentKind = "file" | "link";

export interface CardAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: CardAttachmentKind;
  /** Download autenticado (file) ou URL original (link). */
  url: string;
  createdAt: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface CardComment {
  id: string;
  authorId: string | null;
  body: string;
  createdAt: string;
}

export interface CardDailyNote {
  id: string;
  /** Dia YYYY-MM-DD */
  date: string;
  body: string;
  /** Anexos do card ligados a esta observação (figuras e documentos). */
  attachmentIds?: string[];
  authorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RequirementStatus = "draft" | "approved" | "in_progress" | "done" | "rejected";

export interface Requirement {
  id: string;
  boardId: string;
  code: string;
  title: string;
  description: string;
  status: RequirementStatus;
  priority: "low" | "medium" | "high";
  ownerId: string | null;
  dueDate: string | null;
  /** Prompt para implementação spec-based / SDD */
  specPrompt?: string;
  /** Prompt para plano de testes (Gherkin + automação) */
  testPrompt?: string;
  /** Brief de geração/refatoração no IDE — Maya não commita */
  codePrompt?: string;
  /** Payload JSON para ferramentas MCP (software_planning, handoff, etc.) */
  mcpPayload?: string;
  /** Objetivo compacto para colaboração A2A */
  a2aObjective?: string;
  promptsGeneratedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type TeamEventKind = "meeting" | "deadline" | "milestone" | "review" | "other";

export interface TeamCalendarEvent {
  id: string;
  boardId: string;
  teamId: string | null;
  title: string;
  description: string;
  kind: TeamEventKind;
  /** Dia YYYY-MM-DD */
  date: string;
  /** HH:mm opcional */
  time: string | null;
  /** Link do Google Meet, Microsoft Teams ou outra sala */
  meetingUrl?: string | null;
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type ListSystemKey = "maya-risks";

export interface List {
  id: string;
  boardId: string;
  title: string;
  cardIds: string[];
  /** Coluna gerida pelo sistema (ex.: Riscos Maya) */
  systemKey?: ListSystemKey | null;
}

export type BoardGitRepo = {
  id: string;
  url: string;
  label?: string;
  addedAt: string;
};

/** Grupo WhatsApp ligado ao board (convite, JID e notas). */
export type BoardWhatsAppGroup = {
  id: string;
  name: string;
  /** Link de convite https://chat.whatsapp.com/… */
  inviteUrl?: string | null;
  /** Identificador interno do grupo, ex.: 120363430202949653@g.us */
  jid?: string | null;
  notes?: string;
  addedAt: string;
  updatedAt: string;
};

export type BoardWhatsAppGroupInput = {
  name?: string;
  inviteUrl?: string | null;
  jid?: string | null;
  notes?: string;
};

export type GitCoverageStatus = "implemented" | "partial" | "missing";

export type GitCoverageItem = {
  kind: "card" | "requirement";
  id: string;
  title: string;
  status: GitCoverageStatus;
  evidence?: string;
};

export type BoardRisk = {
  id: string;
  title: string;
  severity: "low" | "medium" | "high";
  reason: string;
  cardId?: string;
  source?: "board" | "git";
};

export type GitInspectSummary = {
  url: string;
  ok: boolean;
  error?: string;
  kind?: "local" | "gitlab" | "github" | "generic";
  fileCount: number;
  files: string[];
  readmeExcerpt?: string;
  hints: string[];
  coverage: GitCoverageItem[];
  clonedAt?: string;
  cloned?: boolean;
  sourceRisks?: BoardRisk[];
};

export type BoardRiskReport = {
  analyzedAt: string;
  /** Último clone local do Git (análise semanal) */
  clonedAt?: string | null;
  cloneMode?: "clone" | "api" | "none";
  risks: BoardRisk[];
  git: GitInspectSummary[];
};

export interface Board {
  id: string;
  title: string;
  description: string;
  /** Texto livre para a liderança: situação, prioridades e riscos do board. */
  executiveSummary?: string;
  /** Objetivos do projeto (painel direito dos boards de nível projeto). */
  objectives?: string;
  /** Link da aplicação em produção/homologação (http/https). */
  applicationUrl?: string | null;
  listIds: string[];
  memberIds: string[];
  /** Contatos externos (não entram no time nem no acesso ao board) */
  externalMemberIds?: string[];
  /** Equipe atribuída a este kanban (opcional) */
  teamId: string | null;
  /** Nível na hierarquia: organização → unidade → time → projeto */
  level: BoardLevel;
  /** Board pai na hierarquia (null para organização) */
  parentBoardId: string | null;
  /** Fundo visual do board */
  backgroundId: string;
  /** Estilo de listas/cards */
  designId: string;
  /** Paleta de cor dos cards */
  cardThemeId?: string;
  /** Foto de fundo (URL https ou data URL). Sobrepõe o degradê. */
  backgroundImageUrl?: string | null;
  /** Escurecimento da foto (0–80) para o texto continuar legível */
  backgroundTint?: number;
  /** Repositórios Git ligados ao board (Maya analisa cobertura) */
  gitRepos?: BoardGitRepo[];
  /** Grupos WhatsApp vinculados a este board */
  whatsappGroups?: BoardWhatsAppGroup[];
  /** Última análise de riscos + Git da Maya */
  riskReport?: BoardRiskReport | null;
  createdAt: string;
  updatedAt: string;
}

export type BoardLevel = "organization" | "unit" | "team" | "project";

export type TeamRole = "owner" | "member";

export type MemberKind = "member" | "external";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  color: LabelColor;
  image?: string | null;
  /** Pessoa externa: pode ser responsável de card, sem acesso ao time */
  kind?: MemberKind;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
  color: LabelColor;
  createdAt: string;
  updatedAt: string;
}

export type MeetingStatus = "scheduled" | "live" | "ended";

export interface Meeting {
  id: string;
  boardId: string;
  title: string;
  roomSlug: string;
  status: MeetingStatus;
  scheduledAt: string | null;
  participantIds: string[];
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export type AiAction =
  | {
      type: "create_cards";
      listId?: string;
      cards: {
        title: string;
        description?: string;
        priority?: Card["priority"];
        assigneeId?: string | null;
        dueDate?: string | null;
      }[];
    }
  | { type: "suggest_priorities"; updates: { cardId: string; priority: NonNullable<Card["priority"]> }[] }
  | {
      type: "update_cards";
      updates: {
        cardId: string;
        title?: string;
        description?: string;
        priority?: Card["priority"];
        moveToListId?: string;
        assigneeId?: string | null;
        dueDate?: string | null;
      }[];
    }
  | { type: "create_lists"; titles: string[] }
  | {
      type: "assign_cards";
      assignments: { cardId: string; assigneeId: string | null }[];
    }
  | { type: "none" };

export interface KanbanActivity {
  id: string;
  boardId: string;
  memberId: string;
  /** Dia do calendário YYYY-MM-DD (local) */
  date: string;
  kind: "card_create" | "card_update" | "card_move" | "card_delete" | "card_archive" | "card_comment" | "standup_reply";
  cardId?: string;
  note?: string;
  createdAt: string;
}

export interface DayUpdateReport {
  date: string;
  boardId: string;
  updatedMemberIds: string[];
  missingMemberIds: string[];
  activityCount: number;
}

export interface VirtualManager {
  boardId: string;
  name: string;
  persona: string;
  enabled: boolean;
  /** Inicia daily automaticamente no horário (opt-in) */
  autoStartDaily: boolean;
  /** Horário local HH:mm para a daily automática */
  dailyTime: string;
  lastStandupDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export type StandupStatus = "open" | "processing" | "closed";

export interface StandupCheckIn {
  memberId: string;
  yesterday: string;
  today: string;
  blockers: string;
  submittedAt: string | null;
}

export interface StandupChatMessage {
  id: string;
  role: "manager" | "member";
  memberId: string | null;
  content: string;
  createdAt: string;
}

export interface StandupSession {
  id: string;
  boardId: string;
  date: string;
  status: StandupStatus;
  questions: string[];
  checkIns: StandupCheckIn[];
  chat: StandupChatMessage[];
  /** Índice do membro sendo entrevistado */
  currentMemberIndex: number;
  /** Índice da pergunta atual (0 = ontem, 1 = hoje, 2 = bloqueios) */
  currentQuestionIndex: number;
  awaitingReplyFrom: string | null;
  managerSummary: string;
  meetingId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Conversa da Maya de um board em um dia (YYYY-MM-DD local), por usuário. */
export interface MayaDayLog {
  id: string;
  boardId: string;
  date: string;
  messages: StandupChatMessage[];
  updatedAt: string;
}
