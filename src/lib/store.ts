"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type {
  Board,
  Card,
  CardAttachment,
  CardDailyNote,
  KanbanActivity,
  LabelColor,
  List,
  Meeting,
  Requirement,
  RequirementStatus,
  StandupCheckIn,
  MayaDayLog,
  StandupChatMessage,
  StandupSession,
  Team,
  TeamCalendarEvent,
  TeamEventKind,
  TeamMember,
  TeamRole,
  VirtualManager,
  BoardLevel,
} from "./types";
import { buildMeetingRoomSlug, createSampleWorkspace, defaultManagerQuestions } from "./sample-data";
import { createAsesiBoardSeed, createCgeBoardSeed } from "./asesi-seed";
import { ASESI_BOARD_ID, CGE_BOARD_ID, MAYA_RISKS_LIST_KEY, MAYA_RISKS_LIST_TITLE } from "./constants";
import type { BoardSnapshot } from "./board-snapshot";
import type { AiAction } from "./types";
import {
  cloneBoardPieces,
  ensureMayaRisksList,
  isMayaRisksList,
  mergePiecesInto,
  syncMayaRiskCards,
} from "./maya-risk-column";
import {
  buildRequirementPrompts,
  withRequirementPrompts,
} from "./requirement-prompts";
import {
  DEFAULT_BACKGROUND_ID,
  DEFAULT_CARD_THEME_ID,
  DEFAULT_DESIGN_ID,
  DEFAULT_BACKGROUND_TINT,
  ensureBoardAppearance,
  type BoardBackgroundId,
  type BoardCardThemeId,
  type BoardDesignId,
} from "./board-themes";
import {
  applyOfficialBoardHierarchy,
  isValidParentLevel,
  normalizeBoardLevel,
} from "./board-hierarchy";
import {
  buildDayUpdateReport,
  calendarDayKey,
  dayReportMessage,
  formatCalendarDayLabel,
  shiftCalendarDay,
} from "./calendar-report";
import { extractMeetingUrlFromText, sanitizeMeetingUrl } from "./meeting-links";
import { sanitizeApplicationUrl } from "./application-url";
import { sanitizeExecutiveSummary } from "./executive-summary";
import {
  normalizeDailyNotes,
  normalizeDailyNoteAttachmentIds,
  resolveCardDates,
  sanitizeCalendarDay,
  sanitizeDailyNoteBody,
} from "./card-schedule";
import {
  findDuplicateWhatsAppGroup,
  mergeWhatsAppGroup,
  normalizeWhatsAppGroupInput,
  normalizeWhatsAppGroups,
} from "./whatsapp-groups";
import {
  applyAssigneePatch,
  cardAssigneeIds,
  collectContactIds,
  membersForSnapshot,
  syncCardAssignees,
} from "./members";
import { preferredMemberIdForEmail } from "./board-access";
import {
  mergeMayaLogRecords,
  mayaDayLogId,
  mayaMessageTimestamp,
  omitMayaDayLog,
  removeMayaChatMessage,
  stripMayaStandupChat,
  upsertMayaDayLog,
} from "./maya-chat";

function normalizeCalendarEvent(event: TeamCalendarEvent): TeamCalendarEvent {
  const meetingUrl =
    sanitizeMeetingUrl(event.meetingUrl) ||
    extractMeetingUrlFromText(event.description) ||
    null;
  return {
    ...event,
    time: event.time ?? null,
    meetingUrl,
    memberIds: Array.isArray(event.memberIds) ? event.memberIds : [],
  };
}

function normalizeCard(card: Card): Card {
  const assignees = syncCardAssignees(cardAssigneeIds(card));
  const dates = resolveCardDates(card.startDate, card.dueDate);
  return {
    ...card,
    assigneeId: assignees.assigneeId,
    assigneeIds: assignees.assigneeIds,
    requirementId: card.requirementId ?? null,
    acceptanceCriteria: card.acceptanceCriteria ?? "",
    checklist: Array.isArray(card.checklist) ? card.checklist : [],
    comments: Array.isArray(card.comments) ? card.comments : [],
    dailyNotes: normalizeDailyNotes(card.dailyNotes),
    archived: card.archived ?? false,
    labels: Array.isArray(card.labels) ? card.labels : [],
    coverColor: card.coverColor ?? null,
    origin: card.origin ?? null,
    originKey: card.originKey ?? null,
    startDate: dates.startDate,
    dueDate: dates.dueDate,
    priority: card.priority ?? null,
  };
}

interface BoardState {
  boards: Record<string, Board>;
  lists: Record<string, List>;
  cards: Record<string, Card>;
  members: Record<string, TeamMember>;
  teams: Record<string, Team>;
  meetings: Record<string, Meeting>;
  managers: Record<string, VirtualManager>;
  standups: Record<string, StandupSession>;
  mayaLogs: Record<string, MayaDayLog>;
  activities: Record<string, KanbanActivity>;
  requirements: Record<string, Requirement>;
  calendarEvents: Record<string, TeamCalendarEvent>;
  currentUserId: string | null;
  activeBoardId: string | null;
  activeMeetingId: string | null;
  activeStandupId: string | null;
  hydrated: boolean;
  /** Não recria o board oficial ASESI depois que o usuário o excluiu */
  skipAsesiSeed: boolean;
  setHydrated: (value: boolean) => void;
  createBoard: (
    title: string,
    description?: string,
    appearance?: {
      backgroundId?: BoardBackgroundId;
      designId?: BoardDesignId;
      teamId?: string | null;
      level?: BoardLevel;
      parentBoardId?: string | null;
      cardThemeId?: BoardCardThemeId;
      backgroundImageUrl?: string | null;
      backgroundTint?: number;
      executiveSummary?: string;
      objectives?: string;
      applicationUrl?: string | null;
    },
  ) => string;
  setActiveBoard: (boardId: string) => void;
  renameBoard: (boardId: string, title: string) => void;
  updateBoardDescription: (boardId: string, description: string) => void;
  updateBoardExecutiveSummary: (boardId: string, executiveSummary: string) => void;
  updateBoardObjectives: (boardId: string, objectives: string) => void;
  updateBoardApplicationUrl: (boardId: string, applicationUrl: string | null) => boolean;
  addBoardGitRepo: (boardId: string, url: string, label?: string) => string | null;
  removeBoardGitRepo: (boardId: string, repoId: string) => void;
  addBoardWhatsAppGroup: (
    boardId: string,
    input: {
      name?: string;
      inviteUrl?: string | null;
      jid?: string | null;
      notes?: string;
    },
  ) => string | null;
  updateBoardWhatsAppGroup: (
    boardId: string,
    groupId: string,
    patch: {
      name?: string;
      inviteUrl?: string | null;
      jid?: string | null;
      notes?: string;
    },
  ) => boolean;
  removeBoardWhatsAppGroup: (boardId: string, groupId: string) => void;
  setBoardRiskReport: (boardId: string, report: Board["riskReport"]) => void;
  ensureMayaRisksColumn: (boardId: string) => void;
  assignBoardParent: (boardId: string, parentBoardId: string | null) => void;
  setBoardLevel: (boardId: string, level: BoardLevel) => void;
  updateBoardAppearance: (
    boardId: string,
    appearance: {
      backgroundId?: BoardBackgroundId;
      designId?: BoardDesignId;
      cardThemeId?: BoardCardThemeId;
      backgroundImageUrl?: string | null;
      backgroundTint?: number;
    },
  ) => void;
  assignTeamToBoard: (boardId: string, teamId: string | null) => void;
  deleteBoard: (boardId: string) => void;
  createTeam: (input: {
    name: string;
    description?: string;
    color?: LabelColor;
    memberIds?: string[];
  }) => string;
  updateTeam: (
    teamId: string,
    patch: Partial<Pick<Team, "name" | "description" | "color">>,
  ) => void;
  deleteTeam: (teamId: string) => void;
  addMemberToTeam: (
    teamId: string,
    data: {
      name: string;
      email: string;
      role?: TeamRole;
      color?: LabelColor;
      image?: string | null;
    },
  ) => string;
  updateMember: (
    memberId: string,
    patch: Partial<Pick<TeamMember, "name" | "email" | "image" | "color">>,
  ) => void;
  addExternalContact: (
    boardId: string,
    data: { name: string; email?: string; image?: string | null },
  ) => string;
  removeExternalContact: (boardId: string, memberId: string) => void;
  removeMemberFromTeam: (teamId: string, memberId: string) => void;
  addExistingMemberToTeam: (teamId: string, memberId: string) => void;
  addList: (boardId: string, title: string) => string;
  renameList: (listId: string, title: string) => void;
  deleteList: (listId: string) => void;
  addCard: (
    listId: string,
    title: string,
    extras?: Partial<
      Pick<
        Card,
        | "description"
        | "priority"
        | "dueDate"
        | "startDate"
        | "dailyNotes"
        | "labels"
        | "coverColor"
        | "origin"
        | "originKey"
        | "assigneeId"
        | "assigneeIds"
        | "requirementId"
        | "acceptanceCriteria"
        | "checklist"
        | "comments"
        | "attachments"
        | "archived"
      >
    >,
  ) => string;
  updateCard: (cardId: string, patch: Partial<Card>) => void;
  deleteCard: (cardId: string) => void;
  archiveCard: (cardId: string) => void;
  restoreCard: (cardId: string, listId?: string) => void;
  addCardComment: (cardId: string, body: string) => void;
  addCardDailyNote: (
    cardId: string,
    date: string,
    body: string,
    attachmentIds?: string[],
  ) => string | null;
  updateCardDailyNote: (
    cardId: string,
    noteId: string,
    body: string,
    attachmentIds?: string[],
  ) => boolean;
  removeCardDailyNote: (cardId: string, noteId: string) => void;
  addCardAttachment: (cardId: string, attachment: CardAttachment) => void;
  removeCardAttachment: (cardId: string, attachmentId: string) => void;
  createRequirement: (input: {
    boardId: string;
    title: string;
    description?: string;
    code?: string;
    status?: RequirementStatus;
    priority?: Requirement["priority"];
    ownerId?: string | null;
    dueDate?: string | null;
  }) => string;
  updateRequirement: (requirementId: string, patch: Partial<Requirement>) => void;
  deleteRequirement: (requirementId: string) => void;
  regenerateRequirementPrompts: (requirementId: string) => void;
  regenerateBoardRequirementPrompts: (boardId: string) => number;
  ensureBoardRequirementPrompts: (boardId: string) => number;
  createCalendarEvent: (input: {
    boardId: string;
    title: string;
    description?: string;
    kind?: TeamEventKind;
    date: string;
    time?: string | null;
    meetingUrl?: string | null;
    teamId?: string | null;
    memberIds?: string[];
  }) => string;
  updateCalendarEvent: (eventId: string, patch: Partial<TeamCalendarEvent>) => void;
  deleteCalendarEvent: (eventId: string) => void;
  moveCard: (cardId: string, toListId: string, toIndex: number) => void;
  reorderCardInList: (listId: string, activeId: string, overId: string) => void;
  addCardsBulk: (
    listId: string,
    items: {
      title: string;
      description?: string;
      priority?: Card["priority"];
      assigneeId?: string | null;
      dueDate?: string | null;
    }[],
  ) => void;
  applyPriorityUpdates: (
    updates: { cardId: string; priority: NonNullable<Card["priority"]> }[],
  ) => void;
  setCurrentUserName: (name: string) => void;
  syncAuthUser: (profile: {
    name: string;
    email: string;
    image?: string | null;
  }) => void;
  addTeamMember: (
    boardId: string,
    data: {
      name: string;
      email: string;
      role?: TeamRole;
      color?: LabelColor;
      image?: string | null;
    },
  ) => string;
  removeTeamMember: (boardId: string, memberId: string) => void;
  createMeeting: (input: {
    boardId: string;
    title: string;
    scheduledAt?: string | null;
    participantIds?: string[];
    startNow?: boolean;
  }) => string;
  updateMeeting: (meetingId: string, patch: Partial<Meeting>) => void;
  deleteMeeting: (meetingId: string) => void;
  joinMeeting: (meetingId: string) => void;
  leaveMeeting: () => void;
  endMeeting: (meetingId: string) => void;
  ensureManager: (boardId: string) => void;
  updateManager: (boardId: string, patch: Partial<VirtualManager>) => void;
  startDailyStandup: (boardId: string, opts?: { withMeeting?: boolean }) => string;
  submitCheckIn: (
    standupId: string,
    memberId: string,
    data: { yesterday: string; today: string; blockers: string },
  ) => void;
  replyToStandupChat: (standupId: string, text: string, asMemberId?: string) => void;
  applyStandupAiTurn: (
    standupId: string,
    input: {
      memberId: string;
      userText: string;
      managerMessage: string;
      extract: Partial<{ yesterday: string; today: string; blockers: string }>;
      advanceQuestion: boolean;
      completeMember: boolean;
    },
  ) => void;
  appendManagerChat: (standupId: string, content: string, memberId?: string | null) => void;
  appendMayaDayChat: (
    boardId: string,
    input: {
      role: "manager" | "member";
      memberId?: string | null;
      content: string;
    },
  ) => void;
  deleteMayaDayChat: (boardId: string, date: string) => void;
  deleteMayaChatMessage: (boardId: string, date: string, messageId: string) => void;
  setActiveStandup: (standupId: string | null) => void;
  closeStandup: (standupId: string, summary: string) => void;
  applyManagerActions: (actions: AiAction[], boardId?: string) => void;
  ensureAsesiBoard: () => string;
  mergeBoardSnapshot: (snapshot: BoardSnapshot, opts?: { setActive?: boolean }) => void;
  adoptServerSnapshots: (snapshots: BoardSnapshot[]) => void;
  adoptUserMayaLogs: (logs: Record<string, MayaDayLog>) => void;
  exportBoardSnapshot: (boardId: string) => BoardSnapshot | null;
  addBoardMemberFromProfile: (
    boardId: string,
    profile: { name: string; email: string; image?: string | null },
    opts?: { teamId?: string | null; extraBoardIds?: string[] },
  ) => string;
  recordActivity: (input: {
    boardId: string;
    memberId?: string | null;
    kind: KanbanActivity["kind"];
    cardId?: string;
    note?: string;
  }) => void;
  postCalendarDayAlert: (boardId: string, date?: string) => string | null;
  resetDemo: () => void;
}

const sample = createSampleWorkspace();
const MEMBER_COLORS: LabelColor[] = ["teal", "amber", "rose", "sky", "lime", "violet"];

function ensureBoardMembers(board: Board): Board {
  return ensureBoardAppearance(board);
}

function touchBoardsWithMember(
  boards: Record<string, Board>,
  memberId: string,
  now: string,
): Record<string, Board> {
  const next = { ...boards };
  for (const [id, board] of Object.entries(next)) {
    const safe = ensureBoardMembers(board);
    if (
      (safe.memberIds || []).includes(memberId) ||
      (safe.externalMemberIds || []).includes(memberId)
    ) {
      next[id] = { ...safe, updatedAt: now };
    }
  }
  return next;
}

function syncBoardsWithTeam(
  boards: Record<string, Board>,
  teamId: string,
  memberIds: string[],
  now: string,
): Record<string, Board> {
  const next = { ...boards };
  for (const [id, board] of Object.entries(next)) {
    if (board.teamId === teamId) {
      next[id] = {
        ...ensureBoardMembers(board),
        memberIds: [...memberIds],
        updatedAt: now,
      };
    }
  }
  return next;
}

function withStandupAndMayaLog(
  state: { standups: Record<string, StandupSession>; mayaLogs: Record<string, MayaDayLog> },
  standup: StandupSession,
) {
  return {
    standups: { ...state.standups, [standup.id]: standup },
  };
}

function pushMayaChat(
  chat: StandupChatMessage[],
  msg: Omit<StandupChatMessage, "createdAt">,
) {
  const createdAt = mayaMessageTimestamp(chat.at(-1)?.createdAt);
  chat.push({ ...msg, createdAt });
  return createdAt;
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set, get) => ({
      ...sample,
      hydrated: false,
      skipAsesiSeed: false,
      setHydrated: (value) => set({ hydrated: value }),

      createBoard: (title, description = "", appearance) => {
        const boardId = nanoid();
        const listDefs = [
          { title: "A fazer" },
          { title: "Em progresso" },
          { title: "Concluído" },
          { title: MAYA_RISKS_LIST_TITLE, systemKey: MAYA_RISKS_LIST_KEY },
        ];
        const now = new Date().toISOString();
        const listIds: string[] = [];
        const lists: Record<string, List> = {};
        const currentUserId = get().currentUserId;
        const teamId = appearance?.teamId ?? null;
        const team = teamId ? get().teams[teamId] : null;
        const memberIds = Array.from(
          new Set([
            ...(team?.memberIds ?? []),
            ...(currentUserId ? [currentUserId] : []),
          ]),
        );

        const level = normalizeBoardLevel(appearance?.level ?? "project");
        let parentBoardId = appearance?.parentBoardId ?? null;
        if (parentBoardId) {
          const parent = get().boards[parentBoardId];
          if (!parent || !isValidParentLevel(parent.level, level)) {
            parentBoardId = null;
          }
        }
        if (level === "organization") parentBoardId = null;

        for (const listDef of listDefs) {
          const listId = nanoid();
          listIds.push(listId);
          lists[listId] = {
            id: listId,
            boardId,
            title: listDef.title,
            cardIds: [],
            systemKey: listDef.systemKey,
          };
        }

        const board: Board = applyOfficialBoardHierarchy({
          id: boardId,
          title: title.trim() || "Novo board",
          description,
          executiveSummary: sanitizeExecutiveSummary(appearance?.executiveSummary),
          objectives: sanitizeExecutiveSummary(appearance?.objectives),
          applicationUrl: sanitizeApplicationUrl(appearance?.applicationUrl),
          listIds,
          memberIds,
          teamId: team ? team.id : null,
          level,
          parentBoardId,
          backgroundId: appearance?.backgroundId ?? DEFAULT_BACKGROUND_ID,
          designId: appearance?.designId ?? DEFAULT_DESIGN_ID,
          cardThemeId: appearance?.cardThemeId ?? DEFAULT_CARD_THEME_ID,
          backgroundImageUrl: appearance?.backgroundImageUrl ?? null,
          backgroundTint: appearance?.backgroundTint ?? DEFAULT_BACKGROUND_TINT,
          gitRepos: [],
          whatsappGroups: [],
          riskReport: null,
          createdAt: now,
          updatedAt: now,
        });

        const manager: VirtualManager = {
          boardId,
          name: "Maya",
          persona:
            "Gestor(a) virtual: analisa riscos, compara o Git com o kanban e atualiza cards.",
          enabled: true,
          autoStartDaily: false,
          dailyTime: "09:30",
          lastStandupDate: null,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          boards: { ...state.boards, [boardId]: board },
          lists: { ...state.lists, ...lists },
          managers: { ...state.managers, [boardId]: manager },
          activeBoardId: boardId,
        }));

        return boardId;
      },

      setActiveBoard: (boardId) => set({ activeBoardId: boardId }),

      renameBoard: (boardId, title) =>
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          return {
            boards: {
              ...state.boards,
              [boardId]: {
                ...ensureBoardMembers(board),
                title: title.trim() || board.title,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),

      updateBoardDescription: (boardId, description) =>
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          return {
            boards: {
              ...state.boards,
              [boardId]: {
                ...ensureBoardMembers(board),
                description,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),

      updateBoardExecutiveSummary: (boardId, executiveSummary) =>
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          return {
            boards: {
              ...state.boards,
              [boardId]: {
                ...ensureBoardMembers(board),
                executiveSummary: sanitizeExecutiveSummary(executiveSummary),
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),

      updateBoardObjectives: (boardId, objectives) =>
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          return {
            boards: {
              ...state.boards,
              [boardId]: {
                ...ensureBoardMembers(board),
                objectives: sanitizeExecutiveSummary(objectives),
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),

      updateBoardApplicationUrl: (boardId, applicationUrl) => {
        const trimmed = (applicationUrl || "").trim();
        const sanitized = sanitizeApplicationUrl(trimmed);
        if (trimmed && !sanitized) return false;
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          return {
            boards: {
              ...state.boards,
              [boardId]: {
                ...ensureBoardMembers(board),
                applicationUrl: sanitized,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
        return true;
      },

      addBoardGitRepo: (boardId, url, label) => {
        const trimmed = url.trim();
        if (!trimmed) return null;
        let repoId = "";
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          const repos = [...(board.gitRepos || [])];
          if (repos.some((r) => r.url === trimmed)) return state;
          repoId = nanoid();
          const now = new Date().toISOString();
          repos.push({ id: repoId, url: trimmed, label: label?.trim() || undefined, addedAt: now });
          return {
            boards: {
              ...state.boards,
              [boardId]: { ...ensureBoardMembers(board), gitRepos: repos, updatedAt: now },
            },
          };
        });
        return repoId || null;
      },

      removeBoardGitRepo: (boardId, repoId) =>
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          return {
            boards: {
              ...state.boards,
              [boardId]: {
                ...ensureBoardMembers(board),
                gitRepos: (board.gitRepos || []).filter((r) => r.id !== repoId),
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),

      addBoardWhatsAppGroup: (boardId, input) => {
        const normalized = normalizeWhatsAppGroupInput(input);
        if (!normalized) return null;
        let groupId = "";
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          const groups = [...normalizeWhatsAppGroups(board.whatsappGroups)];
          const now = new Date().toISOString();
          const existing = findDuplicateWhatsAppGroup(groups, normalized);
          if (existing) {
            const merged = mergeWhatsAppGroup(existing, input, now);
            if (!merged) return state;
            groupId = existing.id;
            return {
              boards: {
                ...state.boards,
                [boardId]: {
                  ...ensureBoardMembers(board),
                  whatsappGroups: groups.map((g) => (g.id === existing.id ? merged : g)),
                  updatedAt: now,
                },
              },
            };
          }
          groupId = nanoid();
          groups.push({
            id: groupId,
            name: normalized.name,
            inviteUrl: normalized.inviteUrl,
            jid: normalized.jid,
            notes: normalized.notes || undefined,
            addedAt: now,
            updatedAt: now,
          });
          return {
            boards: {
              ...state.boards,
              [boardId]: { ...ensureBoardMembers(board), whatsappGroups: groups, updatedAt: now },
            },
          };
        });
        return groupId || null;
      },

      updateBoardWhatsAppGroup: (boardId, groupId, patch) => {
        let ok = false;
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          const groups = [...normalizeWhatsAppGroups(board.whatsappGroups)];
          const index = groups.findIndex((g) => g.id === groupId);
          if (index < 0) return state;
          const now = new Date().toISOString();
          const merged = mergeWhatsAppGroup(groups[index], patch, now);
          if (!merged) return state;
          const clash = findDuplicateWhatsAppGroup(groups, merged, groupId);
          if (clash) return state;
          ok = true;
          groups[index] = merged;
          return {
            boards: {
              ...state.boards,
              [boardId]: { ...ensureBoardMembers(board), whatsappGroups: groups, updatedAt: now },
            },
          };
        });
        return ok;
      },

      removeBoardWhatsAppGroup: (boardId, groupId) =>
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          return {
            boards: {
              ...state.boards,
              [boardId]: {
                ...ensureBoardMembers(board),
                whatsappGroups: normalizeWhatsAppGroups(board.whatsappGroups).filter(
                  (g) => g.id !== groupId,
                ),
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),

      setBoardRiskReport: (boardId, report) =>
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          const pieces = cloneBoardPieces(board, state.lists, state.cards);
          syncMayaRiskCards(pieces, report);
          const next = {
            boards: { ...state.boards },
            lists: { ...state.lists },
            cards: { ...state.cards },
          };
          mergePiecesInto(next, pieces);
          return next;
        }),

      ensureMayaRisksColumn: (boardId) =>
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          const pieces = cloneBoardPieces(board, state.lists, state.cards);
          ensureMayaRisksList(pieces);
          if (board.riskReport) syncMayaRiskCards(pieces, board.riskReport);
          const next = {
            boards: { ...state.boards },
            lists: { ...state.lists },
            cards: { ...state.cards },
          };
          mergePiecesInto(next, pieces);
          return next;
        }),

      assignBoardParent: (boardId, parentBoardId) =>
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          if (board.level === "organization") return state;
          const now = new Date().toISOString();
          let nextParent: string | null = parentBoardId;
          if (nextParent) {
            const parent = state.boards[nextParent];
            if (!parent || !isValidParentLevel(parent.level, board.level)) {
              return state;
            }
            // evita ciclo
            let cursor: Board | undefined = parent;
            while (cursor) {
              if (cursor.id === boardId) return state;
              cursor = cursor.parentBoardId
                ? state.boards[cursor.parentBoardId]
                : undefined;
            }
          }
          return {
            boards: {
              ...state.boards,
              [boardId]: applyOfficialBoardHierarchy({
                ...ensureBoardMembers(board),
                parentBoardId: nextParent,
                updatedAt: now,
              }),
            },
          };
        }),

      setBoardLevel: (boardId, level) =>
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          const normalized = normalizeBoardLevel(level);
          const now = new Date().toISOString();
          let parentBoardId = board.parentBoardId;
          if (normalized === "organization") parentBoardId = null;
          if (parentBoardId) {
            const parent = state.boards[parentBoardId];
            if (!parent || !isValidParentLevel(parent.level, normalized)) {
              parentBoardId = null;
            }
          }
          return {
            boards: {
              ...state.boards,
              [boardId]: applyOfficialBoardHierarchy({
                ...ensureBoardMembers(board),
                level: normalized,
                parentBoardId,
                updatedAt: now,
              }),
            },
          };
        }),

      updateBoardAppearance: (boardId, appearance) =>
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          const next = { ...ensureBoardMembers(board) };
          if (appearance.backgroundId) next.backgroundId = appearance.backgroundId;
          if (appearance.designId) next.designId = appearance.designId;
          if (appearance.cardThemeId) next.cardThemeId = appearance.cardThemeId;
          if (appearance.backgroundImageUrl !== undefined) {
            next.backgroundImageUrl = appearance.backgroundImageUrl;
          }
          if (appearance.backgroundTint !== undefined) {
            next.backgroundTint = appearance.backgroundTint;
          }
          next.updatedAt = new Date().toISOString();
          return {
            boards: {
              ...state.boards,
              [boardId]: next,
            },
          };
        }),

      assignTeamToBoard: (boardId, teamId) =>
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          const now = new Date().toISOString();
          if (!teamId) {
            return {
              boards: {
                ...state.boards,
                [boardId]: {
                  ...ensureBoardMembers(board),
                  teamId: null,
                  updatedAt: now,
                },
              },
            };
          }
          const team = state.teams[teamId];
          if (!team) return state;
          return {
            boards: {
              ...state.boards,
              [boardId]: {
                ...ensureBoardMembers(board),
                teamId,
                memberIds: [...team.memberIds],
                updatedAt: now,
              },
            },
          };
        }),

      createTeam: ({ name, description = "", color, memberIds }) => {
        const teamId = nanoid();
        const now = new Date().toISOString();
        const currentUserId = get().currentUserId;
        const ids =
          memberIds && memberIds.length > 0
            ? [...memberIds]
            : currentUserId
              ? [currentUserId]
              : [];

        const team: Team = {
          id: teamId,
          name: name.trim() || "Nova equipe",
          description: description.trim(),
          memberIds: ids,
          color: color ?? MEMBER_COLORS[Object.keys(get().teams).length % MEMBER_COLORS.length],
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          teams: { ...state.teams, [teamId]: team },
        }));
        return teamId;
      },

      updateTeam: (teamId, patch) =>
        set((state) => {
          const team = state.teams[teamId];
          if (!team) return state;
          return {
            teams: {
              ...state.teams,
              [teamId]: {
                ...team,
                ...patch,
                name: patch.name !== undefined ? patch.name.trim() || team.name : team.name,
                description:
                  patch.description !== undefined ? patch.description : team.description,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),

      deleteTeam: (teamId) =>
        set((state) => {
          if (!state.teams[teamId]) return state;
          const teams = { ...state.teams };
          delete teams[teamId];
          const boards = { ...state.boards };
          const now = new Date().toISOString();
          for (const [id, board] of Object.entries(boards)) {
            if (board.teamId === teamId) {
              boards[id] = {
                ...ensureBoardMembers(board),
                teamId: null,
                updatedAt: now,
              };
            }
          }
          return { teams, boards };
        }),

      addMemberToTeam: (teamId, data) => {
        const memberId = nanoid();
        const now = new Date().toISOString();
        set((state) => {
          const team = state.teams[teamId];
          if (!team) return state;
          const color =
            data.color ??
            MEMBER_COLORS[Object.keys(state.members).length % MEMBER_COLORS.length];
          const member: TeamMember = {
            id: memberId,
            name: data.name.trim() || "Membro",
            email: data.email.trim() || `${memberId}@equipe.local`,
            role: data.role ?? "member",
            color,
            image: data.image ?? null,
            kind: "member",
            createdAt: now,
          };
          const memberIds = [...team.memberIds, memberId];
          return {
            members: { ...state.members, [memberId]: member },
            teams: {
              ...state.teams,
              [teamId]: { ...team, memberIds, updatedAt: now },
            },
            boards: syncBoardsWithTeam(state.boards, teamId, memberIds, now),
          };
        });
        return memberId;
      },

      updateMember: (memberId, patch) =>
        set((state) => {
          const existing = state.members[memberId];
          if (!existing) return state;
          const now = new Date().toISOString();
          const next: TeamMember = {
            ...existing,
            name:
              patch.name !== undefined
                ? patch.name.trim() || existing.name
                : existing.name,
            email: patch.email !== undefined ? patch.email.trim() : existing.email,
            image: patch.image !== undefined ? patch.image : existing.image,
            color: patch.color ?? existing.color,
          };
          return {
            members: { ...state.members, [memberId]: next },
            boards: touchBoardsWithMember(state.boards, memberId, now),
          };
        }),

      addExternalContact: (boardId, data) => {
        const now = new Date().toISOString();
        let memberId = "";
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          const safe = ensureBoardMembers(board);
          const name = data.name.trim();
          if (!name) return state;
          const email = (data.email || "").trim().toLowerCase();
          const existing = email
            ? Object.values(state.members).find(
                (m) => m.email.trim().toLowerCase() === email,
              )
            : undefined;

          if (existing && existing.kind !== "external") {
            memberId = existing.id;
            if (data.image && data.image !== existing.image) {
              return {
                members: {
                  ...state.members,
                  [existing.id]: { ...existing, image: data.image },
                },
                boards: touchBoardsWithMember(state.boards, existing.id, now),
              };
            }
            return state;
          }

          memberId = existing?.id || nanoid();
          const member: TeamMember = existing
            ? {
                ...existing,
                name,
                email: email || existing.email,
                image: data.image ?? existing.image,
                kind: "external",
              }
            : {
                id: memberId,
                name,
                email: email || `${memberId}@externo.local`,
                role: "member",
                color:
                  MEMBER_COLORS[Object.keys(state.members).length % MEMBER_COLORS.length],
                image: data.image ?? null,
                kind: "external",
                createdAt: now,
              };
          const externalMemberIds = Array.from(
            new Set([...(safe.externalMemberIds || []), memberId]),
          );
          return {
            members: { ...state.members, [memberId]: member },
            boards: {
              ...state.boards,
              [boardId]: { ...safe, externalMemberIds, updatedAt: now },
            },
          };
        });
        return memberId;
      },

      removeExternalContact: (boardId, memberId) =>
        set((state) => {
          const board = state.boards[boardId];
          const member = state.members[memberId];
          if (!board || !member || member.kind !== "external") return state;
          const now = new Date().toISOString();
          const safe = ensureBoardMembers(board);
          const cards = { ...state.cards };
          for (const listId of safe.listIds) {
            const list = state.lists[listId];
            if (!list) continue;
            for (const cardId of list.cardIds) {
              const card = cards[cardId];
              if (card?.assigneeId === memberId) {
                cards[cardId] = { ...card, assigneeId: null, updatedAt: now };
              }
            }
          }
          const usedElsewhere = Object.values(state.boards).some(
            (b) =>
              b.id !== boardId && (b.externalMemberIds || []).includes(memberId),
          );
          const nextMembers = { ...state.members };
          if (!usedElsewhere) delete nextMembers[memberId];
          return {
            members: nextMembers,
            cards,
            boards: {
              ...state.boards,
              [boardId]: {
                ...safe,
                externalMemberIds: (safe.externalMemberIds || []).filter(
                  (id) => id !== memberId,
                ),
                updatedAt: now,
              },
            },
          };
        }),

      removeMemberFromTeam: (teamId, memberId) =>
        set((state) => {
          const team = state.teams[teamId];
          if (!team) return state;
          if (memberId === state.currentUserId && team.memberIds.length <= 1) {
            return state;
          }
          const now = new Date().toISOString();
          const memberIds = team.memberIds.filter((id) => id !== memberId);
          return {
            teams: {
              ...state.teams,
              [teamId]: { ...team, memberIds, updatedAt: now },
            },
            boards: syncBoardsWithTeam(state.boards, teamId, memberIds, now),
          };
        }),

      addExistingMemberToTeam: (teamId, memberId) =>
        set((state) => {
          const team = state.teams[teamId];
          const member = state.members[memberId];
          if (!team || !member || team.memberIds.includes(memberId)) return state;
          const now = new Date().toISOString();
          const memberIds = [...team.memberIds, memberId];
          return {
            teams: {
              ...state.teams,
              [teamId]: { ...team, memberIds, updatedAt: now },
            },
            boards: syncBoardsWithTeam(state.boards, teamId, memberIds, now),
          };
        }),

      deleteBoard: (boardId) =>
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;

          const boards = { ...state.boards };
          const grandparent = board.parentBoardId;
          const now = new Date().toISOString();
          for (const [id, child] of Object.entries(boards)) {
            if (child.parentBoardId === boardId) {
              boards[id] = {
                ...ensureBoardMembers(child),
                parentBoardId: grandparent,
                updatedAt: now,
              };
            }
          }
          delete boards[boardId];

          const lists = { ...state.lists };
          const cards = { ...state.cards };
          for (const listId of board.listIds) {
            const list = lists[listId];
            if (list) {
              for (const cardId of list.cardIds) delete cards[cardId];
              delete lists[listId];
            }
          }

          const managers = { ...state.managers };
          delete managers[boardId];

          const meetings = { ...state.meetings };
          for (const [id, m] of Object.entries(meetings)) {
            if (m.boardId === boardId) delete meetings[id];
          }

          const standups = { ...state.standups };
          for (const [id, s] of Object.entries(standups)) {
            if (s.boardId === boardId) delete standups[id];
          }

          const mayaLogs = { ...(state.mayaLogs || {}) };
          for (const [id, log] of Object.entries(mayaLogs)) {
            if (log.boardId === boardId) delete mayaLogs[id];
          }

          const activities = { ...state.activities };
          for (const [id, a] of Object.entries(activities)) {
            if (a.boardId === boardId) delete activities[id];
          }

          const remaining = Object.keys(boards);
          const requirements = { ...(state.requirements || {}) };
          for (const [id, req] of Object.entries(requirements)) {
            if (req.boardId === boardId) delete requirements[id];
          }
          const calendarEvents = { ...(state.calendarEvents || {}) };
          for (const [id, event] of Object.entries(calendarEvents)) {
            if (event.boardId === boardId) delete calendarEvents[id];
          }
          return {
            boards,
            lists,
            cards,
            managers,
            meetings,
            standups,
            mayaLogs,
            activities,
            requirements,
            calendarEvents,
            skipAsesiSeed: boardId === ASESI_BOARD_ID ? true : state.skipAsesiSeed,
            activeBoardId:
              state.activeBoardId === boardId
                ? remaining[0] ?? null
                : state.activeBoardId,
            activeStandupId:
              state.activeStandupId && standups[state.activeStandupId]
                ? state.activeStandupId
                : null,
            activeMeetingId:
              state.activeMeetingId && meetings[state.activeMeetingId]
                ? state.activeMeetingId
                : null,
          };
        }),

      addList: (boardId, title) => {
        const listId = nanoid();
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          return {
            lists: {
              ...state.lists,
              [listId]: {
                id: listId,
                boardId,
                title: title.trim() || "Nova lista",
                cardIds: [],
              },
            },
            boards: {
              ...state.boards,
              [boardId]: {
                ...ensureBoardMembers(board),
                listIds: [...board.listIds, listId],
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
        return listId;
      },

      renameList: (listId, title) =>
        set((state) => {
          const list = state.lists[listId];
          if (!list) return state;
          return {
            lists: {
              ...state.lists,
              [listId]: { ...list, title: title.trim() || list.title },
            },
          };
        }),

      deleteList: (listId) => {
        set((state) => {
          const list = state.lists[listId];
          if (!list || isMayaRisksList(list)) return state;
          const board = state.boards[list.boardId];
          if (!board) return state;

          const cards = { ...state.cards };
          for (const cardId of list.cardIds) {
            delete cards[cardId];
          }
          const lists = { ...state.lists };
          delete lists[listId];

          return {
            cards,
            lists,
            boards: {
              ...state.boards,
              [board.id]: {
                ...board,
                listIds: board.listIds.filter((id) => id !== listId),
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
      },

      addCard: (listId, title, extras = {}) => {
        const cardId = nanoid();
        const now = new Date().toISOString();
        let boardId: string | null = null;
        set((state) => {
          const list = state.lists[listId];
          if (!list) return state;
          boardId = list.boardId;
          const card: Card = {
            id: cardId,
            listId,
            title: title.trim() || "Novo card",
            description: extras.description ?? "",
            labels: extras.labels ?? [],
            coverColor: extras.coverColor ?? null,
            origin: extras.origin ?? null,
            originKey: extras.originKey ?? null,
            ...resolveCardDates(extras.startDate, extras.dueDate),
            dailyNotes: normalizeDailyNotes(extras.dailyNotes),
            priority: extras.priority ?? null,
            ...syncCardAssignees(
              extras.assigneeIds ?? (extras.assigneeId ? [extras.assigneeId] : []),
            ),
            requirementId: extras.requirementId ?? null,
            acceptanceCriteria: extras.acceptanceCriteria ?? "",
            checklist: extras.checklist ?? [],
            comments: extras.comments ?? [],
            attachments: extras.attachments ?? [],
            archived: extras.archived ?? false,
            createdAt: now,
            updatedAt: now,
          };
          return {
            cards: { ...state.cards, [cardId]: card },
            lists: {
              ...state.lists,
              [listId]: { ...list, cardIds: [...list.cardIds, cardId] },
            },
          };
        });
        if (boardId) {
          get().recordActivity({
            boardId,
            kind: "card_create",
            cardId,
            note: title.trim() || "Novo card",
          });
        }
        return cardId;
      },

      updateCard: (cardId, patch) => {
        let boardId: string | null = null;
        set((state) => {
          const card = state.cards[cardId];
          if (!card) return state;
          const list = state.lists[card.listId];
          boardId = list?.boardId ?? null;
          const assigneeFields = applyAssigneePatch(patch);
          const next = {
            ...card,
            ...patch,
            ...(assigneeFields ?? {}),
            id: card.id,
            updatedAt: new Date().toISOString(),
          };
          const dates = resolveCardDates(next.startDate, next.dueDate);
          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...next,
                startDate: dates.startDate,
                dueDate: dates.dueDate,
                dailyNotes: normalizeDailyNotes(next.dailyNotes),
              },
            },
          };
        });
        if (boardId) {
          get().recordActivity({
            boardId,
            kind: "card_update",
            cardId,
          });
        }
      },

      deleteCard: (cardId) => {
        let boardId: string | null = null;
        set((state) => {
          const card = state.cards[cardId];
          if (!card) return state;
          const list = state.lists[card.listId];
          boardId = list?.boardId ?? null;
          const nextCards = { ...state.cards };
          delete nextCards[cardId];
          return {
            cards: nextCards,
            lists: list
              ? {
                  ...state.lists,
                  [list.id]: {
                    ...list,
                    cardIds: list.cardIds.filter((id) => id !== cardId),
                  },
                }
              : state.lists,
          };
        });
        if (boardId) {
          get().recordActivity({ boardId, kind: "card_delete", cardId });
        }
      },

      archiveCard: (cardId) => {
        let boardId: string | null = null;
        set((state) => {
          const card = state.cards[cardId];
          if (!card || card.archived) return state;
          const list = state.lists[card.listId];
          boardId = list?.boardId ?? null;
          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...card,
                archived: true,
                updatedAt: new Date().toISOString(),
              },
            },
            lists: list
              ? {
                  ...state.lists,
                  [list.id]: {
                    ...list,
                    cardIds: list.cardIds.filter((id) => id !== cardId),
                  },
                }
              : state.lists,
          };
        });
        if (boardId) {
          get().recordActivity({ boardId, kind: "card_archive", cardId });
        }
      },

      restoreCard: (cardId, targetListId) => {
        let boardId: string | null = null;
        set((state) => {
          const card = state.cards[cardId];
          if (!card) return state;
          const board = state.boards[state.lists[card.listId]?.boardId ?? ""];
          if (!board) return state;
          boardId = board.id;
          const listId = targetListId || board.listIds[0];
          const list = state.lists[listId];
          if (!list) return state;
          const cards = {
            ...state.cards,
            [cardId]: {
              ...card,
              archived: false,
              listId,
              updatedAt: new Date().toISOString(),
            },
          };
          const lists = { ...state.lists };
          for (const lid of board.listIds) {
            const l = lists[lid];
            if (!l) continue;
            lists[lid] = {
              ...l,
              cardIds: l.cardIds.filter((id) => id !== cardId),
            };
          }
          lists[listId] = {
            ...list,
            cardIds: [...lists[listId].cardIds, cardId],
          };
          return { cards, lists };
        });
        if (boardId) {
          get().recordActivity({ boardId, kind: "card_update", cardId, note: "restaurado" });
        }
      },

      addCardComment: (cardId, body) => {
        const text = body.trim();
        if (!text) return;
        const commentId = nanoid();
        const now = new Date().toISOString();
        let boardId: string | null = null;
        set((state) => {
          const card = state.cards[cardId];
          if (!card) return state;
          const list = state.lists[card.listId];
          boardId = list?.boardId ?? null;
          const authorId = state.currentUserId;
          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...card,
                comments: [
                  ...card.comments,
                  { id: commentId, authorId, body: text, createdAt: now },
                ],
                updatedAt: now,
              },
            },
          };
        });
        if (boardId) {
          get().recordActivity({
            boardId,
            kind: "card_comment",
            cardId,
            note: text.slice(0, 80),
          });
        }
      },

      addCardDailyNote: (cardId, date, body, attachmentIds) => {
        const day = sanitizeCalendarDay(date);
        const text = sanitizeDailyNoteBody(body);
        const ids = normalizeDailyNoteAttachmentIds(attachmentIds);
        if (!day || (!text && ids.length === 0)) return null;
        const noteId = nanoid();
        const now = new Date().toISOString();
        let boardId: string | null = null;
        set((state) => {
          const card = state.cards[cardId];
          if (!card) return state;
          boardId = state.lists[card.listId]?.boardId ?? null;
          const note: CardDailyNote = {
            id: noteId,
            date: day,
            body: text,
            attachmentIds: ids.length ? ids : undefined,
            authorId: state.currentUserId,
            createdAt: now,
            updatedAt: now,
          };
          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...card,
                dailyNotes: normalizeDailyNotes([...(card.dailyNotes || []), note]),
                updatedAt: now,
              },
            },
          };
        });
        if (boardId) {
          get().recordActivity({
            boardId,
            kind: "card_update",
            cardId,
            note: `obs ${day}: ${(text || ids.join(", ")).slice(0, 60)}`,
          });
        }
        return noteId;
      },

      updateCardDailyNote: (cardId, noteId, body, attachmentIds) => {
        const text = sanitizeDailyNoteBody(body);
        let ok = false;
        set((state) => {
          const card = state.cards[cardId];
          if (!card) return state;
          const notes = card.dailyNotes || [];
          const current = notes.find((note) => note.id === noteId);
          if (!current) return state;
          const ids =
            attachmentIds === undefined
              ? normalizeDailyNoteAttachmentIds(current.attachmentIds)
              : normalizeDailyNoteAttachmentIds(attachmentIds);
          if (!text && ids.length === 0) return state;
          const now = new Date().toISOString();
          ok = true;
          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...card,
                dailyNotes: normalizeDailyNotes(
                  notes.map((note) =>
                    note.id === noteId
                      ? {
                          ...note,
                          body: text,
                          attachmentIds: ids.length ? ids : undefined,
                          updatedAt: now,
                        }
                      : note,
                  ),
                ),
                updatedAt: now,
              },
            },
          };
        });
        return ok;
      },

      removeCardDailyNote: (cardId, noteId) => {
        set((state) => {
          const card = state.cards[cardId];
          if (!card) return state;
          const notes = card.dailyNotes || [];
          if (!notes.some((note) => note.id === noteId)) return state;
          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...card,
                dailyNotes: notes.filter((note) => note.id !== noteId),
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
      },

      addCardAttachment: (cardId, attachment) => {
        let boardId: string | null = null;
        set((state) => {
          const card = state.cards[cardId];
          if (!card) return state;
          boardId = state.lists[card.listId]?.boardId ?? null;
          const current = card.attachments || [];
          if (current.some((item) => item.id === attachment.id)) return state;
          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...card,
                attachments: [...current, attachment],
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
        if (boardId) {
          get().recordActivity({
            boardId,
            kind: "card_update",
            cardId,
            note: `anexo ${attachment.name}`,
          });
        }
      },

      removeCardAttachment: (cardId, attachmentId) => {
        let boardId: string | null = null;
        set((state) => {
          const card = state.cards[cardId];
          if (!card) return state;
          boardId = state.lists[card.listId]?.boardId ?? null;
          const current = card.attachments || [];
          if (!current.some((item) => item.id === attachmentId)) return state;
          const notes = card.dailyNotes || [];
          return {
            cards: {
              ...state.cards,
              [cardId]: {
                ...card,
                attachments: current.filter((item) => item.id !== attachmentId),
                dailyNotes: normalizeDailyNotes(
                  notes.map((note) => ({
                    ...note,
                    attachmentIds: (note.attachmentIds || []).filter((id) => id !== attachmentId),
                  })),
                ),
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
        if (boardId) {
          get().recordActivity({
            boardId,
            kind: "card_update",
            cardId,
            note: "anexo removido",
          });
        }
      },

      createRequirement: (input) => {
        const id = nanoid();
        const now = new Date().toISOString();
        const boardReqs = Object.values(get().requirements || {}).filter(
          (r) => r.boardId === input.boardId,
        );
        const code =
          input.code?.trim() ||
          `REQ-${String(boardReqs.length + 1).padStart(2, "0")}`;
        const boardTitle = get().boards[input.boardId]?.title;
        const base = {
          id,
          boardId: input.boardId,
          code,
          title: input.title.trim() || "Novo requisito",
          description: input.description?.trim() || "",
          status: input.status ?? ("draft" as RequirementStatus),
          priority: input.priority ?? ("medium" as Requirement["priority"]),
          ownerId: input.ownerId ?? null,
          dueDate: input.dueDate ?? null,
          createdAt: now,
          updatedAt: now,
        };
        const prompts = buildRequirementPrompts({
          ...base,
          boardTitle,
        });
        const requirement: Requirement = { ...base, ...prompts };
        set((state) => ({
          requirements: { ...(state.requirements || {}), [id]: requirement },
        }));
        return id;
      },

      updateRequirement: (requirementId, patch) => {
        set((state) => {
          const current = state.requirements?.[requirementId];
          if (!current) return state;
          const next: Requirement = {
            ...current,
            ...patch,
            id: current.id,
            boardId: current.boardId,
            updatedAt: new Date().toISOString(),
          };
          const contentChanged =
            patch.title !== undefined ||
            patch.description !== undefined ||
            patch.priority !== undefined ||
            patch.status !== undefined ||
            patch.code !== undefined;
          const boardTitle = state.boards[next.boardId]?.title;
          const withPrompts =
            contentChanged || !next.specPrompt
              ? {
                  ...next,
                  ...buildRequirementPrompts({
                    code: next.code,
                    title: next.title,
                    description: next.description,
                    priority: next.priority,
                    status: next.status,
                    boardTitle,
                  }),
                }
              : next;
          return {
            requirements: {
              ...state.requirements,
              [requirementId]: withPrompts,
            },
          };
        });
      },

      regenerateRequirementPrompts: (requirementId) => {
        set((state) => {
          const current = state.requirements?.[requirementId];
          if (!current) return state;
          const boardTitle = state.boards[current.boardId]?.title;
          const prompts = buildRequirementPrompts({
            code: current.code,
            title: current.title,
            description: current.description,
            priority: current.priority,
            status: current.status,
            boardTitle,
          });
          return {
            requirements: {
              ...state.requirements,
              [requirementId]: {
                ...current,
                ...prompts,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
      },

      regenerateBoardRequirementPrompts: (boardId) => {
        let count = 0;
        set((state) => {
          const boardTitle = state.boards[boardId]?.title;
          const next = { ...(state.requirements || {}) };
          for (const [id, req] of Object.entries(next)) {
            if (req.boardId !== boardId) continue;
            next[id] = {
              ...req,
              ...buildRequirementPrompts({
                code: req.code,
                title: req.title,
                description: req.description,
                priority: req.priority,
                status: req.status,
                boardTitle,
              }),
              updatedAt: new Date().toISOString(),
            };
            count += 1;
          }
          return { requirements: next };
        });
        return count;
      },

      ensureBoardRequirementPrompts: (boardId) => {
        let count = 0;
        set((state) => {
          const boardTitle = state.boards[boardId]?.title;
          const next = { ...(state.requirements || {}) };
          let changed = false;
          for (const [id, req] of Object.entries(next)) {
            if (req.boardId !== boardId) continue;
            if (
              req.specPrompt &&
              req.testPrompt &&
              req.mcpPayload &&
              req.a2aObjective
            ) {
              continue;
            }
            next[id] = withRequirementPrompts(req, boardTitle);
            count += 1;
            changed = true;
          }
          return changed ? { requirements: next } : state;
        });
        return count;
      },

      deleteRequirement: (requirementId) => {
        set((state) => {
          const next = { ...(state.requirements || {}) };
          delete next[requirementId];
          const cards = { ...state.cards };
          for (const [cid, card] of Object.entries(cards)) {
            if (card.requirementId === requirementId) {
              cards[cid] = { ...card, requirementId: null };
            }
          }
          return { requirements: next, cards };
        });
      },

      createCalendarEvent: (input) => {
        const id = nanoid();
        const now = new Date().toISOString();
        const board = get().boards[input.boardId];
        const event: TeamCalendarEvent = {
          id,
          boardId: input.boardId,
          teamId: input.teamId ?? board?.teamId ?? null,
          title: input.title.trim() || "Evento",
          description: input.description?.trim() || "",
          kind: input.kind ?? "other",
          date: input.date,
          time: input.time ?? null,
          meetingUrl:
            sanitizeMeetingUrl(input.meetingUrl) ||
            extractMeetingUrlFromText(input.description) ||
            null,
          memberIds: input.memberIds ?? [],
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          calendarEvents: { ...(state.calendarEvents || {}), [id]: event },
        }));
        return id;
      },

      updateCalendarEvent: (eventId, patch) => {
        set((state) => {
          const current = state.calendarEvents?.[eventId];
          if (!current) return state;
          return {
            calendarEvents: {
              ...state.calendarEvents,
              [eventId]: {
                ...current,
                ...patch,
                id: current.id,
                boardId: current.boardId,
                meetingUrl: (() => {
                  const nextDescription =
                    patch.description !== undefined
                      ? patch.description
                      : current.description;
                  const explicit =
                    patch.meetingUrl !== undefined
                      ? sanitizeMeetingUrl(patch.meetingUrl)
                      : sanitizeMeetingUrl(current.meetingUrl);
                  return (
                    explicit ||
                    extractMeetingUrlFromText(nextDescription) ||
                    null
                  );
                })(),
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
      },

      deleteCalendarEvent: (eventId) => {
        set((state) => {
          const next = { ...(state.calendarEvents || {}) };
          delete next[eventId];
          return { calendarEvents: next };
        });
      },

      moveCard: (cardId, toListId, toIndex) => {
        let boardId: string | null = null;
        set((state) => {
          const card = state.cards[cardId];
          const toList = state.lists[toListId];
          if (!card || !toList) return state;

          const fromList = state.lists[card.listId];
          if (!fromList) return state;
          boardId = toList.boardId;

          const fromIds = fromList.cardIds.filter((id) => id !== cardId);
          const toIds =
            card.listId === toListId
              ? fromIds
              : toList.cardIds.filter((id) => id !== cardId);

          const clamped = Math.max(0, Math.min(toIndex, toIds.length));
          toIds.splice(clamped, 0, cardId);

          const lists = {
            ...state.lists,
            [fromList.id]: {
              ...fromList,
              cardIds: card.listId === toListId ? toIds : fromIds,
            },
            [toList.id]: { ...toList, cardIds: toIds },
          };

          if (card.listId === toListId) {
            lists[fromList.id] = { ...fromList, cardIds: toIds };
          }

          return {
            lists,
            cards: {
              ...state.cards,
              [cardId]: {
                ...card,
                listId: toListId,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
        if (boardId) {
          get().recordActivity({ boardId, kind: "card_move", cardId });
        }
      },

      reorderCardInList: (listId, activeId, overId) => {
        const list = get().lists[listId];
        if (!list) return;
        const oldIndex = list.cardIds.indexOf(activeId);
        const newIndex = list.cardIds.indexOf(overId);
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
        get().moveCard(activeId, listId, newIndex);
      },

      addCardsBulk: (listId, items) => {
        for (const item of items) {
          get().addCard(listId, item.title, {
            description: item.description,
            priority: item.priority ?? null,
            assigneeId: item.assigneeId ?? null,
            assigneeIds: item.assigneeId ? [item.assigneeId] : [],
            dueDate: item.dueDate ?? null,
          });
        }
      },

      applyPriorityUpdates: (updates) => {
        for (const update of updates) {
          get().updateCard(update.cardId, { priority: update.priority });
        }
      },

      setCurrentUserName: (name) =>
        set((state) => {
          const id = state.currentUserId;
          if (!id || !state.members[id]) return state;
          return {
            members: {
              ...state.members,
              [id]: { ...state.members[id], name: name.trim() || state.members[id].name },
            },
          };
        }),

      syncAuthUser: (profile) =>
        set((state) => {
          const email = profile.email.trim().toLowerCase();
          const name = profile.name.trim() || "Usuário";
          const image = profile.image ?? null;
          const now = new Date().toISOString();

          // Prefer matching by email across members
          const preferredId = preferredMemberIdForEmail(
            email,
            state.members,
            state.boards,
            state.teams,
          );
          const existing =
            (preferredId ? state.members[preferredId] : undefined) ??
            (state.currentUserId ? state.members[state.currentUserId] : null);

          if (existing) {
            const memberId = existing.id;
            return {
              currentUserId: memberId,
              members: {
                ...state.members,
                [memberId]: {
                  ...existing,
                  name,
                  email: email || existing.email,
                  image,
                  role: existing.role === "owner" ? "owner" : existing.role,
                },
              },
            };
          }

          const memberId = nanoid();
          const member: TeamMember = {
            id: memberId,
            name,
            email: email || `${memberId}@gmail.local`,
            role: "owner",
            color: "teal",
            image,
            createdAt: now,
          };

          const nextMembers = { ...state.members, [memberId]: member };
          if (state.currentUserId && state.currentUserId !== memberId) {
            // demote previous local "Você" placeholder if unused
            const prev = nextMembers[state.currentUserId];
            if (prev && prev.email.endsWith("@trelloai.local")) {
              delete nextMembers[state.currentUserId];
            }
          }

          return {
            currentUserId: memberId,
            members: nextMembers,
          };
        }),

      addTeamMember: (boardId, data) => {
        const memberId = nanoid();
        const now = new Date().toISOString();
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          const color =
            data.color ??
            MEMBER_COLORS[Object.keys(state.members).length % MEMBER_COLORS.length];
          const member: TeamMember = {
            id: memberId,
            name: data.name.trim() || "Membro",
            email: data.email.trim() || `${memberId}@equipe.local`,
            role: data.role ?? "member",
            color,
            image: data.image ?? null,
            kind: "member",
            createdAt: now,
          };
          const safeBoard = ensureBoardMembers(board);
          let teams = state.teams;
          let boards = {
            ...state.boards,
            [boardId]: {
              ...safeBoard,
              memberIds: [...safeBoard.memberIds, memberId],
              updatedAt: now,
            },
          };

          if (safeBoard.teamId && state.teams[safeBoard.teamId]) {
            const team = state.teams[safeBoard.teamId];
            const memberIds = team.memberIds.includes(memberId)
              ? team.memberIds
              : [...team.memberIds, memberId];
            teams = {
              ...state.teams,
              [team.id]: { ...team, memberIds, updatedAt: now },
            };
            boards = syncBoardsWithTeam(boards, team.id, memberIds, now);
          }

          return {
            members: { ...state.members, [memberId]: member },
            teams,
            boards,
          };
        });
        return memberId;
      },

      removeTeamMember: (boardId, memberId) =>
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          const safeBoard = ensureBoardMembers(board);
          if (memberId === state.currentUserId) return state;

          const nextMembers = { ...state.members };
          // keep member profile if on other boards; only detach from this board
          const usedElsewhere = Object.values(state.boards).some(
            (b) => b.id !== boardId && (b.memberIds ?? []).includes(memberId),
          );
          if (!usedElsewhere) delete nextMembers[memberId];

          const nextMeetings = { ...state.meetings };
          for (const meeting of Object.values(nextMeetings)) {
            if (meeting.boardId !== boardId) continue;
            nextMeetings[meeting.id] = {
              ...meeting,
              participantIds: meeting.participantIds.filter((id) => id !== memberId),
              updatedAt: new Date().toISOString(),
            };
          }

          return {
            members: nextMembers,
            meetings: nextMeetings,
            boards: {
              ...state.boards,
              [boardId]: {
                ...safeBoard,
                memberIds: safeBoard.memberIds.filter((id) => id !== memberId),
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),

      createMeeting: ({ boardId, title, scheduledAt = null, participantIds, startNow }) => {
        const meetingId = nanoid();
        const now = new Date().toISOString();
        const state = get();
        const board = state.boards[boardId];
        if (!board) return meetingId;

        const safeBoard = ensureBoardMembers(board);
        const meeting: Meeting = {
          id: meetingId,
          boardId,
          title: title.trim() || "Reunião da equipe",
          roomSlug: buildMeetingRoomSlug(board.title, meetingId),
          status: startNow ? "live" : "scheduled",
          scheduledAt: startNow ? now : scheduledAt,
          participantIds:
            participantIds && participantIds.length > 0
              ? participantIds
              : [...safeBoard.memberIds],
          createdById: state.currentUserId ?? safeBoard.memberIds[0] ?? meetingId,
          createdAt: now,
          updatedAt: now,
        };

        set((s) => ({
          meetings: { ...s.meetings, [meetingId]: meeting },
          activeMeetingId: startNow ? meetingId : s.activeMeetingId,
        }));

        return meetingId;
      },

      updateMeeting: (meetingId, patch) =>
        set((state) => {
          const meeting = state.meetings[meetingId];
          if (!meeting) return state;
          return {
            meetings: {
              ...state.meetings,
              [meetingId]: {
                ...meeting,
                ...patch,
                id: meeting.id,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),

      deleteMeeting: (meetingId) =>
        set((state) => {
          const next = { ...state.meetings };
          delete next[meetingId];
          return {
            meetings: next,
            activeMeetingId:
              state.activeMeetingId === meetingId ? null : state.activeMeetingId,
          };
        }),

      joinMeeting: (meetingId) => {
        const meeting = get().meetings[meetingId];
        if (!meeting) return;
        get().updateMeeting(meetingId, { status: "live" });
        set({ activeMeetingId: meetingId });
      },

      leaveMeeting: () => set({ activeMeetingId: null }),

      endMeeting: (meetingId) => {
        get().updateMeeting(meetingId, { status: "ended" });
        set((state) => ({
          activeMeetingId:
            state.activeMeetingId === meetingId ? null : state.activeMeetingId,
        }));
      },

      ensureManager: (boardId) => {
        if (get().managers[boardId]) return;
        const now = new Date().toISOString();
        set((state) => ({
          managers: {
            ...state.managers,
            [boardId]: {
              boardId,
              name: "Maya",
              persona:
                "Gestor(a) virtual: analisa riscos, compara o Git com o kanban e atualiza cards.",
              enabled: true,
              autoStartDaily: false,
              dailyTime: "09:30",
              lastStandupDate: null,
              createdAt: now,
              updatedAt: now,
            },
          },
        }));
      },

      updateManager: (boardId, patch) =>
        set((state) => {
          const manager = state.managers[boardId];
          if (!manager) return state;
          return {
            managers: {
              ...state.managers,
              [boardId]: {
                ...manager,
                ...patch,
                boardId,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),

      startDailyStandup: (boardId, opts = {}) => {
        get().ensureManager(boardId);
        const state = get();
        const board = state.boards[boardId];
        const manager = state.managers[boardId];
        if (!board || !manager) return "";

        const today = calendarDayKey();
        const existing = Object.values(state.standups).find(
          (s) => s.boardId === boardId && s.date === today && s.status !== "closed",
        );
        if (existing) {
          // migrate old sessions without chat
          if (!existing.chat) {
            const firstId = existing.checkIns[0]?.memberId ?? null;
            const memberName = firstId ? state.members[firstId]?.name : "time";
            const questions = existing.questions?.length
              ? existing.questions
              : defaultManagerQuestions();
            const nowFix = new Date().toISOString();
            const chat: StandupChatMessage[] = [
              {
                id: nanoid(),
                role: "manager",
                memberId: null,
                content: `Olá, time! Sou ${manager.name}. Vamos à daily de hoje — pergunto para cada um como anda o projeto.`,
                createdAt: nowFix,
              },
            ];
            if (firstId) {
              chat.push({
                id: nanoid(),
                role: "manager",
                memberId: firstId,
                content: `${memberName}, ${questions[0]}`,
                createdAt: mayaMessageTimestamp(nowFix),
              });
            }
            const migrated: StandupSession = {
              ...existing,
              chat,
              currentMemberIndex: 0,
              currentQuestionIndex: 0,
              awaitingReplyFrom: firstId,
              questions,
            };
            set((s) => ({
              ...withStandupAndMayaLog(s, migrated),
              activeStandupId: existing.id,
            }));
          } else {
            set((s) => ({
              ...withStandupAndMayaLog(s, existing),
              activeStandupId: existing.id,
            }));
          }
          return existing.id;
        }

        const standupId = nanoid();
        const now = new Date().toISOString();
        const memberIds = ensureBoardMembers(board).memberIds;
        const checkIns: StandupCheckIn[] = memberIds.map((memberId) => ({
          memberId,
          yesterday: "",
          today: "",
          blockers: "",
          submittedAt: null,
        }));
        const questions = defaultManagerQuestions();
        const firstMemberId = memberIds[0] ?? null;
        const firstName = firstMemberId
          ? state.members[firstMemberId]?.name || "membro"
          : "time";

        let meetingId: string | null = null;
        if (opts.withMeeting !== false) {
          meetingId = get().createMeeting({
            boardId,
            title: `Daily — ${manager.name} · ${today}`,
            startNow: false,
            participantIds: memberIds,
          });
        }

        const chat: StandupChatMessage[] = [
          {
            id: nanoid(),
            role: "manager",
            memberId: null,
            content: `Olá, time! Sou ${manager.name}, gestor(a) virtual deste board. Vou perguntar para cada um como anda o projeto e depois atualizo o kanban.`,
            createdAt: now,
          },
        ];
        if (firstMemberId) {
          chat.push({
            id: nanoid(),
            role: "manager",
            memberId: firstMemberId,
            content: `${firstName}, ${questions[0]}`,
            createdAt: mayaMessageTimestamp(now),
          });
        }

        const standup: StandupSession = {
          id: standupId,
          boardId,
          date: today,
          status: "open",
          questions,
          checkIns,
          chat,
          currentMemberIndex: 0,
          currentQuestionIndex: 0,
          awaitingReplyFrom: firstMemberId,
          managerSummary: "",
          meetingId,
          createdAt: now,
          updatedAt: now,
        };

        set((s) => ({
          ...withStandupAndMayaLog(s, standup),
          activeStandupId: standupId,
          managers: {
            ...s.managers,
            [boardId]: {
              ...s.managers[boardId],
              lastStandupDate: today,
              updatedAt: now,
            },
          },
        }));

        // Aviso de calendário: ontem + hoje (quem atualizou / quem não)
        get().postCalendarDayAlert(boardId, shiftCalendarDay(today, -1));
        get().postCalendarDayAlert(boardId, today);

        return standupId;
      },

      submitCheckIn: (standupId, memberId, data) =>
        set((state) => {
          const standup = state.standups[standupId];
          if (!standup) return state;
          const checkIns = standup.checkIns.map((c) =>
            c.memberId === memberId
              ? {
                  ...c,
                  yesterday: data.yesterday,
                  today: data.today,
                  blockers: data.blockers,
                  submittedAt: new Date().toISOString(),
                }
              : c,
          );
          return {
            standups: {
              ...state.standups,
              [standupId]: {
                ...standup,
                checkIns,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),

      replyToStandupChat: (standupId, text, asMemberId) => {
        const trimmed = text.trim();
        if (!trimmed) return;

        let boardIdForActivity: string | null = null;
        let memberForActivity: string | null = null;

        set((state) => {
          const standup = state.standups[standupId];
          if (!standup || standup.status !== "open") return state;

          const memberIds = standup.checkIns.map((c) => c.memberId);
          const memberIndex = Math.min(
            standup.currentMemberIndex ?? 0,
            Math.max(memberIds.length - 1, 0),
          );
          const questionIndex = standup.currentQuestionIndex ?? 0;
          const targetMemberId =
            asMemberId ||
            standup.awaitingReplyFrom ||
            memberIds[memberIndex] ||
            null;
          if (!targetMemberId) return state;

          boardIdForActivity = standup.boardId;
          memberForActivity = targetMemberId;

          const chat = [...(standup.chat ?? [])];
          const now = pushMayaChat(chat, {
            id: nanoid(),
            role: "member",
            memberId: targetMemberId,
            content: trimmed,
          });

          const field =
            questionIndex === 0 ? "yesterday" : questionIndex === 1 ? "today" : "blockers";
          let checkIns = standup.checkIns.map((c) =>
            c.memberId === targetMemberId ? { ...c, [field]: trimmed } : c,
          );

          const questions =
            standup.questions?.length > 0
              ? standup.questions
              : defaultManagerQuestions();
          let nextMemberIndex = memberIndex;
          let nextQuestionIndex = questionIndex + 1;
          let awaitingReplyFrom: string | null = targetMemberId;
          const manager = state.managers[standup.boardId];
          const managerName = manager?.name || "Gestor";

          if (nextQuestionIndex >= questions.length) {
            checkIns = checkIns.map((c) =>
              c.memberId === targetMemberId
                ? { ...c, submittedAt: now }
                : c,
            );
            const memberName = state.members[targetMemberId]?.name || "você";
            pushMayaChat(chat, {
              id: nanoid(),
              role: "manager",
              memberId: targetMemberId,
              content: `Obrigado, ${memberName}! Anotei seu status.`,
            });

            nextMemberIndex = memberIndex + 1;
            nextQuestionIndex = 0;

            if (nextMemberIndex < memberIds.length) {
              const nextId = memberIds[nextMemberIndex];
              const nextName = state.members[nextId]?.name || "próximo";
              awaitingReplyFrom = nextId;
              pushMayaChat(chat, {
                id: nanoid(),
                role: "manager",
                memberId: nextId,
                content: `${nextName}, ${questions[0]}`,
              });
            } else {
              awaitingReplyFrom = null;
              pushMayaChat(chat, {
                id: nanoid(),
                role: "manager",
                memberId: null,
                content: `Pronto — falei com todo o time. Quando quiser, peço para processar a daily e eu crio/atualizo os cards no board.`,
              });
            }
          } else {
            const memberName = state.members[targetMemberId]?.name || "você";
            pushMayaChat(chat, {
              id: nanoid(),
              role: "manager",
              memberId: targetMemberId,
              content: `${memberName}, ${questions[nextQuestionIndex]}`,
            });
            awaitingReplyFrom = targetMemberId;
          }

          void managerName;

          const nextStandup: StandupSession = {
            ...standup,
            chat,
            checkIns,
            currentMemberIndex: nextMemberIndex,
            currentQuestionIndex: nextQuestionIndex,
            awaitingReplyFrom,
            updatedAt: now,
          };
          return withStandupAndMayaLog(state, nextStandup);
        });

        if (boardIdForActivity && memberForActivity) {
          get().recordActivity({
            boardId: boardIdForActivity,
            memberId: memberForActivity,
            kind: "standup_reply",
            note: trimmed.slice(0, 120),
          });
        }
      },

      applyStandupAiTurn: (standupId, input) => {
        const trimmed = input.userText.trim();
        if (!trimmed) return;

        let boardIdForActivity: string | null = null;

        set((state) => {
          const standup = state.standups[standupId];
          if (!standup || standup.status !== "open") return state;

          const memberIds = standup.checkIns.map((c) => c.memberId);
          const memberIndex = Math.min(
            standup.currentMemberIndex ?? 0,
            Math.max(memberIds.length - 1, 0),
          );
          const questionIndex = standup.currentQuestionIndex ?? 0;
          const targetMemberId = input.memberId;
          boardIdForActivity = standup.boardId;

          const chat = [...(standup.chat ?? [])];
          const now = pushMayaChat(chat, {
            id: nanoid(),
            role: "member",
            memberId: targetMemberId,
            content: trimmed,
          });
          pushMayaChat(chat, {
            id: nanoid(),
            role: "manager",
            memberId: targetMemberId,
            content: input.managerMessage,
          });

          let checkIns = standup.checkIns.map((c) => {
            if (c.memberId !== targetMemberId) return c;
            return {
              ...c,
              yesterday: input.extract.yesterday ?? c.yesterday,
              today: input.extract.today ?? c.today,
              blockers: input.extract.blockers ?? c.blockers,
            };
          });

          const questions =
            standup.questions?.length > 0
              ? standup.questions
              : defaultManagerQuestions();

          let nextMemberIndex = memberIndex;
          let nextQuestionIndex = questionIndex;
          let awaitingReplyFrom: string | null = targetMemberId;

          if (input.completeMember || (input.advanceQuestion && questionIndex >= questions.length - 1)) {
            checkIns = checkIns.map((c) =>
              c.memberId === targetMemberId ? { ...c, submittedAt: now } : c,
            );
            nextMemberIndex = memberIndex + 1;
            nextQuestionIndex = 0;

            if (nextMemberIndex < memberIds.length) {
              const nextId = memberIds[nextMemberIndex];
              const nextName = state.members[nextId]?.name || "próximo";
              awaitingReplyFrom = nextId;
              pushMayaChat(chat, {
                id: nanoid(),
                role: "manager",
                memberId: nextId,
                content: `${nextName}, ${questions[0]}`,
              });
            } else {
              awaitingReplyFrom = null;
              pushMayaChat(chat, {
                id: nanoid(),
                role: "manager",
                memberId: null,
                content:
                  "Pronto — falei com todo o time. Quando quiser, peço para processar a daily e eu crio/atualizo os cards no board com a IA.",
              });
            }
          } else if (input.advanceQuestion) {
            nextQuestionIndex = Math.min(questionIndex + 1, questions.length - 1);
            awaitingReplyFrom = targetMemberId;
          } else {
            awaitingReplyFrom = targetMemberId;
          }

          return withStandupAndMayaLog(state, {
            ...standup,
            chat,
            checkIns,
            currentMemberIndex: nextMemberIndex,
            currentQuestionIndex: nextQuestionIndex,
            awaitingReplyFrom,
            updatedAt: now,
          });
        });

        if (boardIdForActivity) {
          get().recordActivity({
            boardId: boardIdForActivity,
            memberId: input.memberId,
            kind: "standup_reply",
            note: trimmed.slice(0, 120),
          });
        }
      },

      appendManagerChat: (standupId, content, memberId = null) => {
        const text = content.trim();
        if (!text) return;
        set((state) => {
          const standup = state.standups[standupId];
          if (!standup) return state;
          const chat = [...(standup.chat ?? [])];
          const now = pushMayaChat(chat, {
            id: nanoid(),
            role: "manager",
            memberId,
            content: text,
          });
          const nextStandup: StandupSession = {
            ...standup,
            chat,
            updatedAt: now,
          };
          return withStandupAndMayaLog(state, nextStandup);
        });
      },

      appendMayaDayChat: (boardId, input) => {
        const text = input.content.trim();
        if (!text) return;
        const date = calendarDayKey();
        set((state) => {
          const log = state.mayaLogs?.[mayaDayLogId(boardId, date)];
          const last = log?.messages?.at(-1)?.createdAt || null;
          const now = mayaMessageTimestamp(last);
          const msg: StandupChatMessage = {
            id: nanoid(),
            role: input.role,
            memberId: input.memberId ?? null,
            content: text,
            createdAt: now,
          };
          return { mayaLogs: upsertMayaDayLog(state.mayaLogs || {}, boardId, date, [msg]) };
        });
      },

      deleteMayaDayChat: (boardId, date) => {
        if (!boardId.trim() || !date.trim()) return;
        set((state) => ({
          mayaLogs: omitMayaDayLog(state.mayaLogs || {}, boardId, date),
          standups: stripMayaStandupChat(state.standups || {}, boardId, date),
        }));
      },

      deleteMayaChatMessage: (boardId, date, messageId) => {
        const id = messageId.trim();
        if (!boardId.trim() || !date.trim() || !id) return;
        set((state) => ({
          mayaLogs: removeMayaChatMessage(state.mayaLogs || {}, boardId, date, id),
          standups: stripMayaStandupChat(
            state.standups || {},
            boardId,
            date,
            new Set([id]),
          ),
        }));
      },

      setActiveStandup: (standupId) => set({ activeStandupId: standupId }),

      closeStandup: (standupId, summary) =>
        set((state) => {
          const standup = state.standups[standupId];
          if (!standup) return state;
          const now = new Date().toISOString();
          const closed: StandupSession = {
            ...standup,
            status: "closed",
            managerSummary: summary,
            updatedAt: now,
          };
          return {
            ...withStandupAndMayaLog(state, closed),
            activeStandupId:
              state.activeStandupId === standupId ? null : state.activeStandupId,
          };
        }),

      applyManagerActions: (actions, boardId) => {
        const targetBoardId =
          boardId || get().activeBoardId || Object.keys(get().boards)[0] || null;

        for (const action of actions) {
          if (action.type === "create_cards") {
            const listId =
              action.listId ||
              (targetBoardId ? get().boards[targetBoardId]?.listIds[0] : undefined);
            if (!listId) continue;
            get().addCardsBulk(listId, action.cards);
          }
          if (action.type === "suggest_priorities") {
            get().applyPriorityUpdates(action.updates);
          }
          if (action.type === "update_cards") {
            for (const u of action.updates) {
              const patch: Partial<Card> = {};
              if (u.title !== undefined) patch.title = u.title;
              if (u.description !== undefined) patch.description = u.description;
              if (u.priority !== undefined) patch.priority = u.priority;
              if (u.assigneeId !== undefined) patch.assigneeId = u.assigneeId;
              if (u.dueDate !== undefined) patch.dueDate = u.dueDate;
              if (Object.keys(patch).length) get().updateCard(u.cardId, patch);
              if (u.moveToListId) {
                const list = get().lists[u.moveToListId];
                if (list) get().moveCard(u.cardId, u.moveToListId, list.cardIds.length);
              }
            }
          }
          if (action.type === "create_lists" && targetBoardId) {
            for (const title of action.titles.slice(0, 6)) {
              if (title.trim()) get().addList(targetBoardId, title.trim());
            }
          }
          if (action.type === "assign_cards") {
            for (const a of action.assignments) {
              get().updateCard(a.cardId, { assigneeId: a.assigneeId });
            }
          }
        }
      },

      ensureAsesiBoard: () => {
        const state = get();
        if (state.skipAsesiSeed && !state.boards[ASESI_BOARD_ID]) {
          return ASESI_BOARD_ID;
        }

        if (!state.boards[CGE_BOARD_ID]) {
          const me = state.currentUserId ? state.members[state.currentUserId] : null;
          const seed = createCgeBoardSeed(
            me
              ? { id: me.id, name: me.name, email: me.email, image: me.image }
              : undefined,
          );
          set((s) => {
            const memberIds = Array.from(
              new Set([
                seed.ownerId,
                ...(s.currentUserId ? [s.currentUserId] : []),
                ...(s.boards[ASESI_BOARD_ID]?.memberIds || []),
              ]),
            );
            const team = s.teams[seed.team.id]
              ? {
                  ...s.teams[seed.team.id],
                  memberIds: Array.from(
                    new Set([...s.teams[seed.team.id].memberIds, ...memberIds]),
                  ),
                }
              : { ...seed.team, memberIds };
            return {
              boards: {
                ...s.boards,
                [CGE_BOARD_ID]: { ...seed.board, memberIds, teamId: team.id },
              },
              lists: { ...s.lists, ...seed.lists },
              members: { ...seed.members, ...s.members },
              teams: { ...s.teams, [team.id]: team },
              managers: { ...s.managers, [CGE_BOARD_ID]: seed.manager },
            };
          });
        }

        if (state.boards[ASESI_BOARD_ID]) {
          const hasReq = Object.values(state.requirements || {}).some(
            (r) => r.boardId === ASESI_BOARD_ID,
          );
          const hasCal = Object.values(state.calendarEvents || {}).some(
            (e) => e.boardId === ASESI_BOARD_ID,
          );
          if (!hasReq || !hasCal) {
            const me = state.currentUserId
              ? state.members[state.currentUserId]
              : null;
            const seed = createAsesiBoardSeed(
              me
                ? {
                    id: me.id,
                    name: me.name,
                    email: me.email,
                    image: me.image,
                  }
                : undefined,
            );
            set((s) => ({
              requirements: hasReq
                ? s.requirements
                : { ...(s.requirements || {}), ...seed.requirements },
              calendarEvents: hasCal
                ? s.calendarEvents
                : { ...(s.calendarEvents || {}), ...seed.calendarEvents },
            }));
          }
          set((s) => {
            const board = s.boards[ASESI_BOARD_ID];
            const cge = s.boards[CGE_BOARD_ID];
            if (!board || !cge) return s;
            if (board.parentBoardId === CGE_BOARD_ID && board.level === "team") {
              return s;
            }
            return {
              boards: {
                ...s.boards,
                [ASESI_BOARD_ID]: {
                  ...ensureBoardMembers(board),
                  level: "team",
                  parentBoardId: CGE_BOARD_ID,
                  updatedAt: new Date().toISOString(),
                },
              },
            };
          });
          return ASESI_BOARD_ID;
        }

        const me = state.currentUserId ? state.members[state.currentUserId] : null;
        const seed = createAsesiBoardSeed(
          me
            ? { id: me.id, name: me.name, email: me.email, image: me.image }
            : undefined,
        );

        set((s) => {
          const members = { ...s.members, ...seed.members };
          const ownerId = seed.ownerId;
          const team = {
            ...seed.team,
            memberIds: Array.from(
              new Set([ownerId, ...(s.currentUserId ? [s.currentUserId] : [])]),
            ),
          };
          if (s.currentUserId && s.members[s.currentUserId] && s.currentUserId !== ownerId) {
            members[s.currentUserId] = s.members[s.currentUserId];
          }

          const board = {
            ...seed.board,
            memberIds: [...team.memberIds],
            level: "team" as const,
            parentBoardId: s.boards[CGE_BOARD_ID] ? CGE_BOARD_ID : seed.board.parentBoardId,
          };

          return {
            boards: { ...s.boards, [ASESI_BOARD_ID]: board },
            lists: { ...s.lists, ...seed.lists },
            cards: { ...s.cards, ...seed.cards },
            members,
            teams: { ...s.teams, [seed.team.id]: team },
            managers: { ...s.managers, [ASESI_BOARD_ID]: seed.manager },
            requirements: { ...(s.requirements || {}), ...seed.requirements },
            calendarEvents: {
              ...(s.calendarEvents || {}),
              ...seed.calendarEvents,
            },
          };
        });

        return ASESI_BOARD_ID;
      },

      exportBoardSnapshot: (boardId) => {
        const state = get();
        const board = state.boards[boardId];
        if (!board) return null;

        const lists: Record<string, List> = {};
        const cards: Record<string, Card> = {};
        for (const listId of board.listIds) {
          const list = state.lists[listId];
          if (!list) continue;
          lists[listId] = list;
          for (const cardId of list.cardIds) {
            if (state.cards[cardId]) cards[cardId] = state.cards[cardId];
          }
        }

        const members = membersForSnapshot(
          state.members,
          collectContactIds({
            board,
            team: board.teamId ? state.teams[board.teamId] : null,
            cards: Object.values(cards),
            requirements: Object.values(state.requirements || {}).filter(
              (req) => req.boardId === boardId,
            ),
          }),
        );

        const teams: Record<string, Team> = {};
        if (board.teamId && state.teams[board.teamId]) {
          teams[board.teamId] = state.teams[board.teamId];
        }

        const meetings: Record<string, Meeting> = {};
        for (const [id, meeting] of Object.entries(state.meetings)) {
          if (meeting.boardId === boardId) meetings[id] = meeting;
        }

        const standups: Record<string, StandupSession> = {};
        for (const [id, standup] of Object.entries(state.standups)) {
          if (standup.boardId === boardId) standups[id] = standup;
        }

        const activities: Record<string, KanbanActivity> = {};
        for (const [id, activity] of Object.entries(state.activities || {})) {
          if (activity.boardId === boardId) activities[id] = activity;
        }

        const requirements: Record<string, Requirement> = {};
        for (const [id, req] of Object.entries(state.requirements || {})) {
          if (req.boardId === boardId) requirements[id] = req;
        }

        const calendarEvents: Record<string, TeamCalendarEvent> = {};
        for (const [id, ev] of Object.entries(state.calendarEvents || {})) {
          if (ev.boardId === boardId) calendarEvents[id] = ev;
        }

        const managers: Record<string, VirtualManager> = {};
        if (state.managers[boardId]) managers[boardId] = state.managers[boardId];

        return {
          board: applyOfficialBoardHierarchy(board),
          lists,
          cards,
          members,
          teams,
          meetings,
          managers,
          standups,
          mayaLogs: {},
          activities,
          requirements,
          calendarEvents,
          updatedAt: new Date().toISOString(),
        };
      },

      mergeBoardSnapshot: (snapshot, opts) => {
        set((state) => {
          const pieces = cloneBoardPieces(
            applyOfficialBoardHierarchy(ensureBoardMembers(snapshot.board)),
            snapshot.lists,
            Object.fromEntries(
              Object.entries(snapshot.cards).map(([id, card]) => [id, normalizeCard(card)]),
            ),
          );
          ensureMayaRisksList(pieces);
          if (pieces.board.riskReport) syncMayaRiskCards(pieces, pieces.board.riskReport);
          const cards = { ...state.cards, ...pieces.cards };
          return {
            boards: { ...state.boards, [pieces.board.id]: pieces.board },
            lists: { ...state.lists, ...pieces.lists },
            cards,
            members: { ...state.members, ...snapshot.members },
            teams: { ...state.teams, ...snapshot.teams },
            meetings: { ...state.meetings, ...snapshot.meetings },
            managers: { ...state.managers, ...snapshot.managers },
            standups: { ...state.standups, ...snapshot.standups },
            activities: { ...(state.activities || {}), ...snapshot.activities },
            requirements: {
              ...(state.requirements || {}),
              ...(snapshot.requirements || {}),
            },
            calendarEvents: {
              ...(state.calendarEvents || {}),
              ...Object.fromEntries(
                Object.entries(snapshot.calendarEvents || {}).map(([id, ev]) => [
                  id,
                  normalizeCalendarEvent(ev),
                ]),
              ),
            },
            activeBoardId: opts?.setActive ? pieces.board.id : state.activeBoardId,
          };
        });
      },

      adoptServerSnapshots: (snapshots) => {
        const keep = new Set(snapshots.map((snap) => snap.board.id));
        set((state) => {
          const boards: Record<string, Board> = {};
          const lists: Record<string, List> = {};
          const cards: Record<string, Card> = {};
          const meetings: Record<string, Meeting> = {};
          const managers: Record<string, VirtualManager> = {};
          const standups: Record<string, StandupSession> = {};
          const mayaLogs: Record<string, MayaDayLog> = {};
          const activities: Record<string, KanbanActivity> = {};
          const requirements: Record<string, Requirement> = {};
          const calendarEvents: Record<string, TeamCalendarEvent> = {};

          for (const [id, board] of Object.entries(state.boards)) {
            if (keep.has(id)) boards[id] = board;
          }
          for (const [id, list] of Object.entries(state.lists)) {
            if (keep.has(list.boardId)) lists[id] = list;
          }
          for (const [id, card] of Object.entries(state.cards)) {
            const list = lists[card.listId] || state.lists[card.listId];
            if (list && keep.has(list.boardId)) cards[id] = card;
          }
          for (const [id, meeting] of Object.entries(state.meetings)) {
            if (keep.has(meeting.boardId)) meetings[id] = meeting;
          }
          for (const [id, manager] of Object.entries(state.managers)) {
            if (keep.has(id) || keep.has(manager.boardId)) managers[id] = manager;
          }
          for (const [id, standup] of Object.entries(state.standups)) {
            if (keep.has(standup.boardId)) standups[id] = standup;
          }
          for (const [id, log] of Object.entries(state.mayaLogs || {})) {
            if (keep.has(log.boardId)) mayaLogs[id] = log;
          }
          for (const [id, activity] of Object.entries(state.activities || {})) {
            if (keep.has(activity.boardId)) activities[id] = activity;
          }
          for (const [id, req] of Object.entries(state.requirements || {})) {
            if (keep.has(req.boardId)) requirements[id] = req;
          }
          for (const [id, ev] of Object.entries(state.calendarEvents || {})) {
            if (keep.has(ev.boardId)) calendarEvents[id] = ev;
          }

          return {
            boards,
            lists,
            cards,
            meetings,
            managers,
            standups,
            mayaLogs,
            activities,
            requirements,
            calendarEvents,
            activeBoardId:
              state.activeBoardId && keep.has(state.activeBoardId)
                ? state.activeBoardId
                : snapshots[0]?.board.id || null,
          };
        });
        for (const snapshot of snapshots) {
          get().mergeBoardSnapshot(snapshot, { setActive: false });
        }
        const after = get();
        const email = after.currentUserId
          ? after.members[after.currentUserId]?.email || ""
          : "";
        const preferred = preferredMemberIdForEmail(
          email,
          after.members,
          after.boards,
          after.teams,
        );
        if (preferred && preferred !== after.currentUserId) {
          set({ currentUserId: preferred });
        }
      },

      adoptUserMayaLogs: (logs) => {
        set((state) => ({
          mayaLogs: mergeMayaLogRecords(state.mayaLogs, logs),
        }));
      },

      addBoardMemberFromProfile: (boardId, profile, opts) => {
        const email = profile.email.trim().toLowerCase();
        const name = profile.name.trim() || "Membro";
        const now = new Date().toISOString();
        let memberId = "";
        const extraBoardIds = opts?.extraBoardIds ?? [];
        const teamId = opts?.teamId;

        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;

          const existing = Object.values(state.members).find(
            (m) => m.email.trim().toLowerCase() === email && email.length > 0,
          );

          memberId = existing?.id || nanoid();
          const member: TeamMember = existing
            ? {
                ...existing,
                name,
                email: email || existing.email,
                image: profile.image ?? existing.image,
              }
            : {
                id: memberId,
                name,
                email: email || `${memberId}@invite.local`,
                role: "member",
                color: "sky",
                image: profile.image ?? null,
                createdAt: now,
              };

          const targetTeamId = teamId || board.teamId;
          let teams = state.teams;
          if (targetTeamId && state.teams[targetTeamId]) {
            const team = state.teams[targetTeamId];
            teams = {
              ...state.teams,
              [team.id]: {
                ...team,
                memberIds: Array.from(new Set([...team.memberIds, memberId])),
                updatedAt: now,
              },
            };
          }

          const boardIds = Array.from(new Set([boardId, ...extraBoardIds]));
          const boards = { ...state.boards };
          for (const id of boardIds) {
            const current = boards[id];
            if (!current) continue;
            boards[id] = {
              ...ensureBoardMembers(current),
              memberIds: Array.from(new Set([...(current.memberIds || []), memberId])),
              updatedAt: now,
            };
          }

          return {
            members: { ...state.members, [memberId]: member },
            boards,
            teams,
            currentUserId: state.currentUserId || memberId,
          };
        });

        return memberId;
      },

      recordActivity: ({ boardId, memberId, kind, cardId, note }) => {
        const actor = memberId || get().currentUserId;
        if (!actor) return;
        const id = nanoid();
        const now = new Date().toISOString();
        const activity: KanbanActivity = {
          id,
          boardId,
          memberId: actor,
          date: calendarDayKey(),
          kind,
          cardId,
          note,
          createdAt: now,
        };
        set((state) => ({
          activities: { ...(state.activities || {}), [id]: activity },
        }));
      },

      postCalendarDayAlert: (boardId, date) => {
        const state = get();
        const board = state.boards[boardId];
        const manager = state.managers[boardId];
        if (!board || !manager) return null;

        const day = date || calendarDayKey();
        const memberIds = ensureBoardMembers(board).memberIds;
        const activities = Object.values(state.activities || {});
        const report = buildDayUpdateReport(boardId, day, memberIds, activities);
        const updatedNames = report.updatedMemberIds.map(
          (id) => state.members[id]?.name || id,
        );
        const missingNames = report.missingMemberIds.map(
          (id) => state.members[id]?.name || id,
        );
        const message = dayReportMessage(
          manager.name,
          formatCalendarDayLabel(day),
          updatedNames,
          missingNames,
        );

        // Attach alert to open standup chat if any; otherwise keep as managerSummary on a sticky note via standup of today
        const today = calendarDayKey();
        const openStandup = Object.values(state.standups).find(
          (s) => s.boardId === boardId && s.date === today && s.status === "open",
        );
        const now = new Date().toISOString();
        const chatMsg: StandupChatMessage = {
          id: nanoid(),
          role: "manager",
          memberId: null,
          content: message,
          createdAt: now,
        };
        set((s) => {
          const logs = upsertMayaDayLog(s.mayaLogs || {}, boardId, today, [chatMsg]);
          if (!openStandup) return { mayaLogs: logs };
          return withStandupAndMayaLog(
            { ...s, mayaLogs: logs },
            {
              ...s.standups[openStandup.id],
              chat: [...(s.standups[openStandup.id].chat || []), chatMsg],
              updatedAt: now,
            },
          );
        });

        return message;
      },

      resetDemo: () => {
        const next = createSampleWorkspace();
        set({ ...next, hydrated: true, skipAsesiSeed: false });
      },
    }),
    {
      name: "trelloai-board-v3",
      partialize: (state) => ({
        boards: state.boards,
        lists: state.lists,
        cards: state.cards,
        members: state.members,
        teams: state.teams,
        meetings: state.meetings,
        managers: state.managers,
        standups: state.standups,
        mayaLogs: state.mayaLogs,
        activities: state.activities,
        requirements: state.requirements,
        calendarEvents: state.calendarEvents,
        currentUserId: state.currentUserId,
        activeBoardId: state.activeBoardId,
        skipAsesiSeed: state.skipAsesiSeed,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const boards = { ...state.boards };
        for (const [id, board] of Object.entries(boards)) {
          boards[id] = ensureBoardMembers(board);
        }
        state.boards = boards;
        if (!state.members) state.members = {};
        if (!state.teams) state.teams = {};
        if (!state.meetings) state.meetings = {};
        if (!state.managers) state.managers = {};
        if (!state.standups) state.standups = {};
        if (!state.mayaLogs) state.mayaLogs = {};
        if (!state.activities) state.activities = {};
        if (!state.requirements) state.requirements = {};
        if (!state.calendarEvents) state.calendarEvents = {};
        if (state.skipAsesiSeed === undefined) state.skipAsesiSeed = false;

        for (const [id, card] of Object.entries(state.cards || {})) {
          if (card) state.cards[id] = normalizeCard(card as Card);
        }

        for (const [id, ev] of Object.entries(state.calendarEvents || {})) {
          if (ev) state.calendarEvents[id] = normalizeCalendarEvent(ev);
        }

        for (const [id, req] of Object.entries(state.requirements || {})) {
          if (!req) continue;
          const boardTitle = state.boards[req.boardId]?.title;
          state.requirements[id] = withRequirementPrompts(req, boardTitle);
        }

        for (const boardId of Object.keys(state.managers)) {
          const m = state.managers[boardId];
          if (m && m.autoStartDaily === undefined) {
            state.managers[boardId] = { ...m, autoStartDaily: false };
          }
        }

        for (const boardId of Object.keys(state.boards)) {
          if (!state.managers[boardId]) {
            const now = new Date().toISOString();
            state.managers[boardId] = {
              boardId,
              name: "Maya",
              persona:
                "Gestor(a) virtual: reúne o time diariamente, pergunta o andamento e atualiza o kanban.",
              enabled: true,
              autoStartDaily: false,
              dailyTime: "09:30",
              lastStandupDate: null,
              createdAt: now,
              updatedAt: now,
            };
          }
        }

        state.setHydrated(true);
      },
    },
  ),
);
