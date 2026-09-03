"use client";

import {
  Bot,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Home,
  LayoutGrid,
  MessageCircle,
  MoreHorizontal,
  Palette,
  Pencil,
  History,
  RotateCcw,
  UserPlus,
  Users,
  Video,
  Target,
  Trash2,
} from "lucide-react";
import { useBoardStore } from "@/lib/store";
import { boardThemeStyle } from "@/lib/board-themes";
import { BoardCanvas } from "@/components/BoardCanvas";
import { ConsolidatedBoardCanvas } from "@/components/ConsolidatedBoardCanvas";
import { AiChatDialog } from "@/components/AiChatDialog";
import { JangadaBuddy } from "@/components/JangadaBuddy";
import { MeetingsPanel } from "@/components/MeetingsPanel";
import { MeetingRoom } from "@/components/MeetingRoom";
import { AuthButton } from "@/components/AuthButton";
import { CearaMark } from "@/components/BrandMark";
import { ManagerPanel } from "@/components/ManagerPanel";
import { BoardAppearanceDrawer } from "@/components/BoardAppearanceDrawer";
import { InvitePanel } from "@/components/InvitePanel";
import { DeleteBoardDialog } from "@/components/DeleteBoardDialog";
import { useToast } from "@/components/Toast";
import { removeBoardFromServer } from "@/lib/board-sync";
import { RequirementsPanel } from "@/components/RequirementsPanel";
import { TeamCalendarPanel } from "@/components/TeamCalendarPanel";
import { ActivityPanel } from "@/components/ActivityPanel";
import { WhatsAppGroupsPanel } from "@/components/WhatsAppGroupsPanel";
import { TeamBoardView } from "@/components/TeamBoardView";
import { ProjectBriefPanel } from "@/components/ProjectBriefPanel";
import { BoardFilterBar } from "@/components/BoardFilterBar";
import {
  BOARD_LEVEL_LABELS,
  BOARD_LEVEL_STYLES,
  getBoardAncestors,
  getChildBoards,
  getDescendantBoardIds,
} from "@/lib/board-hierarchy";
import {
  EMPTY_BOARD_FILTER,
  cardMatchesFilter,
  type BoardCardFilter,
} from "@/lib/board-filters";
import { extractBoardIndicators } from "@/lib/board-indicators";
import { extractGoalAttainment } from "@/lib/goal-attainment";
import { BoardIndicators } from "@/components/BoardIndicators";
import { GoalAttainmentPanel } from "@/components/GoalAttainmentPanel";
import { BoardExecutiveSummary } from "@/components/BoardExecutiveSummary";
import {
  applyMayaSuggestionFilter,
  MayaSuggestionsBar,
} from "@/components/MayaSuggestionsBar";
import { suggestMayaActivities } from "@/lib/maya-suggestions";
import { useVisibleBoards } from "@/lib/use-visible-boards";
import { boardAssigneeOptions, cardAssigneeIds } from "@/lib/members";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type SidePanel =
  | "manager"
  | "meetings"
  | "invite"
  | "requirements"
  | "calendar"
  | "activity"
  | "whatsapp"
  | "brief"
  | null;

export function BoardShell({
  boardId,
}: {
  boardId: string;
}) {
  const router = useRouter();
  const boards = useBoardStore((s) => s.boards);
  const teams = useBoardStore((s) => s.teams);
  const { boardList, visibleIds } = useVisibleBoards();
  const lists = useBoardStore((s) => s.lists);
  const cards = useBoardStore((s) => s.cards);
  const members = useBoardStore((s) => s.members);
  const requirements = useBoardStore((s) => s.requirements);
  const calendarEvents = useBoardStore((s) => s.calendarEvents);
  const setActiveBoard = useBoardStore((s) => s.setActiveBoard);
  const ensureMayaRisksColumn = useBoardStore((s) => s.ensureMayaRisksColumn);
  const renameBoard = useBoardStore((s) => s.renameBoard);
  const updateBoardDescription = useBoardStore((s) => s.updateBoardDescription);
  const resetDemo = useBoardStore((s) => s.resetDemo);
  const deleteBoard = useBoardStore((s) => s.deleteBoard);
  const meetings = useBoardStore((s) => s.meetings);
  const createMeeting = useBoardStore((s) => s.createMeeting);
  const standups = useBoardStore((s) => s.standups);
  const managers = useBoardStore((s) => s.managers);

  const [panel, setPanel] = useState<SidePanel>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [cardFilter, setCardFilter] = useState<BoardCardFilter>(EMPTY_BOARD_FILTER);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setActiveBoard(boardId);
    ensureMayaRisksColumn(boardId);
  }, [boardId, setActiveBoard, ensureMayaRisksColumn]);

  useEffect(() => {
    if (!editingTitle) return;
    const t = window.setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(t);
  }, [editingTitle]);

  const board = visibleIds.has(boardId) ? boards[boardId] ?? null : null;
  const assignedTeam = board?.teamId ? teams[board.teamId] : null;
  const ancestors = useMemo(
    () => (board ? getBoardAncestors(board.id, boards).filter((b) => visibleIds.has(b.id)) : []),
    [board, boards, visibleIds],
  );
  const childBoards = useMemo(
    () => (board ? getChildBoards(board.id, boards) : []),
    [board, boards],
  );
  const descendantIds = useMemo(
    () => (board ? getDescendantBoardIds(board.id, boards) : []),
    [board, boards],
  );
  const hasChildBoards = descendantIds.length > 0;
  const [canvasView, setCanvasView] = useState<"local" | "all">("all");
  const [boardLayout, setBoardLayout] = useState<"kanban" | "team">("kanban");
  const scopeBoardIds = useMemo(
    () => (canvasView === "all" ? [boardId, ...descendantIds] : [boardId]),
    [canvasView, boardId, descendantIds],
  );

  const boardMembers = useMemo(() => {
    if (!board) return [];
    const extraIds = board.listIds.flatMap((listId) =>
      (lists[listId]?.cardIds ?? []).flatMap((id) => cardAssigneeIds(cards[id])),
    );
    const options = boardAssigneeOptions({
      board,
      members,
      extraIds,
      team: assignedTeam,
    });
    return [...options.team, ...options.external];
  }, [board, members, lists, cards, assignedTeam]);

  const { matchCount, totalCount } = useMemo(() => {
    if (!board) return { matchCount: 0, totalCount: 0 };
    const localCards = board.listIds.flatMap((listId) =>
      (lists[listId]?.cardIds ?? [])
        .map((id) => cards[id])
        .filter(Boolean),
    );
    const descendantCards = descendantIds.flatMap((bid) => {
      const b = boards[bid];
      if (!b) return [];
      return b.listIds.flatMap((listId) =>
        (lists[listId]?.cardIds ?? [])
          .map((id) => cards[id])
          .filter(Boolean)
          .filter((c) => !c.archived),
      );
    });
    const pool =
      canvasView === "all" ? [...localCards, ...descendantCards] : localCards;
    return {
      totalCount: pool.length,
      matchCount: pool.filter((c) => cardMatchesFilter(c, cardFilter)).length,
    };
  }, [board, lists, cards, cardFilter, descendantIds, boards, canvasView]);

  const boardIndicators = useMemo(() => {
    if (!board) return null;
    return extractBoardIndicators({
      boardIds: [board.id, ...descendantIds],
      boards,
      lists,
      cards,
      requirements,
    });
  }, [board, descendantIds, boards, lists, cards, requirements]);

  const goalAttainment = useMemo(
    () => (board ? extractGoalAttainment(board.id, boards) : null),
    [board, boards],
  );

  const mayaSuggestions = useMemo(() => {
    if (!board) return [];
    const scopeIds =
      canvasView === "all" ? [board.id, ...descendantIds] : [board.id];
    return suggestMayaActivities({
      boardIds: scopeIds,
      rootBoardId: board.id,
      boards,
      lists,
      cards,
      requirements,
      members,
    });
  }, [board, canvasView, descendantIds, boards, lists, cards, requirements, members]);

  const reqCount = useMemo(
    () =>
      Object.values(requirements || {}).filter((r) => r.boardId === boardId)
        .length,
    [requirements, boardId],
  );

  const calCount = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const prefix = `${y}-${m}`;
    return Object.values(calendarEvents || {}).filter(
      (e) => e.boardId === boardId && e.date.startsWith(prefix),
    ).length;
  }, [calendarEvents, boardId]);

  const liveCount = useMemo(() => {
    if (!board) return 0;
    return Object.values(meetings).filter(
      (m) => m.boardId === board.id && m.status === "live",
    ).length;
  }, [meetings, board]);

  const openStandup = useMemo(() => {
    if (!board) return false;
    const today = new Date().toISOString().slice(0, 10);
    return Object.values(standups).some(
      (s) => s.boardId === board.id && s.date === today && s.status === "open",
    );
  }, [standups, board]);

  const toggle = (next: SidePanel) => {
    setMoreOpen(false);
    setPanel((cur) => (cur === next ? null : next));
  };

  const themeStyle = board ? boardThemeStyle(board) : undefined;

  const confirmDeleteBoard = async () => {
    if (!board) return;
    setDeleteBusy(true);
    const title = board.title;
    const synced = await removeBoardFromServer(board.id);
    deleteBoard(board.id);
    setDeleteBusy(false);
    setPendingDelete(false);
    toast(
      synced
        ? `Board "${title}" excluído.`
        : `Board "${title}" removido neste dispositivo.`,
    );
    router.push("/");
  };

  if (!board) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-[var(--muted)]">Board não encontrado.</p>
        <Link
          href="/"
          className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-on)]"
        >
          Voltar aos boards
        </Link>
      </div>
    );
  }

  const toolBtn = (active: boolean) =>
    `relative rounded-xl border p-2 transition ${
      active
        ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
        : "border-[var(--line)] text-[var(--muted)] hover:text-white"
    }`;

  return (
    <div
      className="board-theme flex min-h-dvh w-full flex-col overflow-visible pb-[env(safe-area-inset-bottom)]"
      style={themeStyle}
    >
      <MeetingRoom />

      <header className="board-header-bar sticky top-0 z-30 shrink-0 border-b backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-2 sm:h-[3.75rem] sm:gap-3 sm:px-4 lg:px-6">
          <Link
            href="/"
            className="flex min-w-0 shrink items-center gap-2 rounded-xl px-1 py-1 transition hover:bg-white/5"
            title="Todos os boards"
          >
            <Home className="hidden h-4 w-4 shrink-0 text-[var(--accent)] lg:block" />
            <CearaMark size={28} />
            <div className="hidden min-w-0 sm:block">
              <p className="font-[family-name:var(--font-display)] text-lg leading-none tracking-tight text-white">
                Jangada
              </p>
              <p className="mt-1 hidden truncate text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ce-gold)] md:block">
                Meus boards
              </p>
            </div>
          </Link>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
            <div className="hidden items-center gap-2 md:flex">
              <LayoutGrid className="h-4 w-4 text-[var(--muted)]" />
              <select
                className="max-w-[12rem] rounded-lg border border-[var(--line)] bg-[var(--ink-2)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)] xl:max-w-[16rem]"
                value={boardId}
                onChange={(e) => router.push(`/board/${e.target.value}`)}
                aria-label="Trocar board"
              >
                {boardList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </div>

            <AuthButton />

            <div className="flex items-center gap-0.5 rounded-xl border border-[var(--line)] bg-black/20 p-0.5 sm:gap-1 sm:rounded-2xl sm:p-1">
              <button
                type="button"
                onClick={() => toggle("manager")}
                className={`relative inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition sm:rounded-xl sm:px-2.5 sm:py-2 ${
                  panel === "manager"
                    ? "bg-[var(--accent)] font-semibold text-[var(--accent-on)]"
                    : "text-[var(--muted)] hover:text-white"
                }`}
              >
                <Bot className="h-4 w-4" />
                <span className="hidden xl:inline">Maya</span>
                {openStandup ? (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--accent-2)] ring-2 ring-[var(--ink)]" />
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => toggle("meetings")}
                className={`relative inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition sm:rounded-xl sm:px-2.5 sm:py-2 ${
                  panel === "meetings"
                    ? "bg-[var(--accent-2)] font-semibold text-slate-950"
                    : "text-[var(--muted)] hover:text-white"
                }`}
              >
                <Video className="h-4 w-4" />
                <span className="hidden xl:inline">Equipe</span>
                {liveCount > 0 ? (
                  <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {liveCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setAiChatOpen((open) => !open);
                }}
                title="Jangadinha"
                className={`inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm transition sm:rounded-xl sm:px-2 sm:py-1.5 ${
                  aiChatOpen
                    ? "bg-white font-semibold text-slate-900"
                    : "text-[var(--muted)] hover:text-white"
                }`}
              >
                <JangadaBuddy size={22} mood={aiChatOpen ? "happy" : "idle"} />
                <span className="hidden xl:inline">Jangadinha</span>
              </button>
            </div>

            <div className="hidden items-center gap-1.5 lg:flex">
              <button
                type="button"
                onClick={() => toggle("invite")}
                title="Convidar usuários"
                className={toolBtn(panel === "invite")}
              >
                <UserPlus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  toggle(board.level === "project" ? "brief" : "requirements")
                }
                title={
                  board.level === "project"
                    ? "Objetivos e requisitos do projeto"
                    : "Requisitos"
                }
                className={toolBtn(
                  panel === "brief" || panel === "requirements",
                )}
              >
                {board.level === "project" ? (
                  <Target className="h-4 w-4" />
                ) : (
                  <ClipboardList className="h-4 w-4" />
                )}
                {reqCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-[var(--accent-on)]">
                    {reqCount > 99 ? "99+" : reqCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => toggle("calendar")}
                title="Calendário do time"
                className={toolBtn(panel === "calendar")}
              >
                <CalendarDays className="h-4 w-4" />
                {calCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent-2)] px-1 text-[9px] font-bold text-slate-950">
                    {calCount > 99 ? "99+" : calCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => toggle("whatsapp")}
                title="Grupos WhatsApp vinculados"
                className={toolBtn(panel === "whatsapp")}
              >
                <MessageCircle className="h-4 w-4" />
                {(board.whatsappGroups || []).length > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-400 px-1 text-[9px] font-bold text-slate-950">
                    {(board.whatsappGroups || []).length > 99
                      ? "99+"
                      : (board.whatsappGroups || []).length}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setAppearanceOpen(true)}
                title="Aparência: fundo do board e dos cards"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] p-2 text-[var(--muted)] transition hover:text-white xl:px-2.5 xl:py-2"
              >
                <Palette className="h-4 w-4" />
                <span className="hidden text-xs font-medium xl:inline">Aparência</span>
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(true)}
                title="Excluir board"
                className="rounded-xl border border-rose-500/30 p-2 text-rose-300 transition hover:bg-rose-500/15 hover:text-rose-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  createMeeting({
                    boardId: board.id,
                    title: `Reunião ao vivo — ${board.title}`,
                    startNow: true,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/90 p-2 text-sm font-medium text-white transition hover:brightness-110 xl:px-2.5 xl:py-1.5"
              >
                <Video className="h-4 w-4" />
                <span className="hidden xl:inline">Ao vivo</span>
              </button>
              <button
                type="button"
                onClick={() => toggle("activity")}
                title="Atividade"
                className={toolBtn(panel === "activity")}
              >
                <History className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={resetDemo}
                title="Resetar demo"
                className="rounded-xl border border-[var(--line)] p-2 text-[var(--muted)] transition hover:text-white"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              title="Mais ferramentas"
              aria-expanded={moreOpen}
              className={`rounded-xl border p-2 transition lg:hidden ${
                moreOpen
                  ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "border-[var(--line)] text-[var(--muted)] hover:text-white"
              }`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto flex w-full max-w-[1600px] px-2 py-2 sm:px-4 sm:py-3 lg:gap-3 lg:px-6">
        <main className="flex min-w-0 w-full flex-col">
          <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 sm:mb-3 sm:gap-3">
            <div className="min-w-0 flex-1">
              {editingTitle ? (
                <div className="space-y-2">
                  <input
                    ref={titleInputRef}
                    value={board.title}
                    onChange={(e) => renameBoard(board.id, e.target.value)}
                    onBlur={() => setEditingTitle(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Escape") {
                        e.preventDefault();
                        setEditingTitle(false);
                      }
                    }}
                    className="w-full max-w-xl rounded-xl border border-[var(--accent)]/50 bg-black/30 px-3 py-2 font-[family-name:var(--font-display)] text-xl text-white outline-none ring-2 ring-[var(--accent)]/20 sm:text-2xl"
                    aria-label="Nome do board"
                  />
                  <input
                    value={board.description}
                    onChange={(e) => updateBoardDescription(board.id, e.target.value)}
                    placeholder="Descrição do board"
                    className="w-full max-w-xl rounded-lg border border-[var(--line)] bg-black/20 px-3 py-1.5 text-sm text-[var(--muted)] outline-none focus:border-[var(--accent)]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setEditingTitle(false);
                    }}
                  />
                  <p className="text-[11px] text-[var(--muted)]">
                    Enter ou clique fora para salvar
                  </p>
                </div>
              ) : (
                <div className="flex max-w-full items-start gap-2">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setEditingTitle(true)}
                      className="group/title flex max-w-full items-start gap-2 rounded-xl text-left transition hover:bg-white/5"
                    >
                      <p className="truncate font-[family-name:var(--font-display)] text-xl text-white sm:text-2xl">
                        {board.title}
                      </p>
                      <span className="mt-1.5 shrink-0 rounded-lg border border-[var(--line)] p-1.5 text-[var(--muted)] opacity-100 transition group-hover/title:border-[var(--accent)]/40 group-hover/title:text-[var(--accent)] sm:opacity-70">
                        <Pencil className="h-3.5 w-3.5" />
                      </span>
                    </button>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${BOARD_LEVEL_STYLES[board.level]}`}
                      >
                        {BOARD_LEVEL_LABELS[board.level]}
                      </span>
                      {ancestors.map((a) => (
                        <Link
                          key={a.id}
                          href={`/board/${a.id}`}
                          className="truncate text-[11px] text-white/70 hover:text-white hover:underline"
                        >
                          {a.title}
                        </Link>
                      ))}
                      {descendantIds.length > 0 ? (
                        <span className="text-[11px] text-white/55">
                          · {descendantIds.length} board
                          {descendantIds.length === 1 ? "" : "s"} abaixo
                        </span>
                      ) : null}
                      {(board.whatsappGroups || []).length > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggle("whatsapp")}
                          className="inline-flex max-w-[14rem] items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-200 hover:bg-white/10"
                          title="Grupos WhatsApp vinculados"
                        >
                          <MessageCircle className="h-3 w-3" />
                          {(board.whatsappGroups || [])[0].name}
                          {(board.whatsappGroups || []).length > 1
                            ? ` +${(board.whatsappGroups || []).length - 1}`
                            : ""}
                        </button>
                      ) : null}
                    </div>
                    {childBoards.length === 0 ? (
                      <p className="mt-0.5 hidden truncate text-xs text-[var(--muted)] sm:block">
                        {board.description || "Clique para editar nome e descrição"}
                        {managers[board.id] ? ` · ${managers[board.id].name}` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            {assignedTeam ? (
              <button
                type="button"
                onClick={() => setPanel("meetings")}
                title="Equipe do board"
                className="inline-flex max-w-[10rem] items-center gap-1.5 truncate rounded-xl border border-[var(--line)] bg-black/20 px-2.5 py-1.5 text-xs text-[var(--muted)] transition hover:border-[var(--accent)]/40 hover:text-white sm:max-w-[14rem]"
              >
                <Users className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                <span className="truncate">{assignedTeam.name}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPanel("meetings")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--muted)] transition hover:border-[var(--accent)]/40 hover:text-white"
              >
                <Users className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cadastrar time</span>
              </button>
            )}

            {board.level === "project" ? (
              <button
                type="button"
                onClick={() => toggle("brief")}
                title="Objetivos e requisitos do projeto"
                className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition ${
                  panel === "brief"
                    ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                    : "border-[var(--line)] bg-black/20 text-[var(--muted)] hover:border-[var(--accent)]/40 hover:text-white"
                }`}
              >
                <Target className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">Objetivos</span>
                {reqCount > 0 ? (
                  <span className="rounded-full bg-white/15 px-1.5 text-[10px] font-bold">
                    {reqCount}
                  </span>
                ) : null}
              </button>
            ) : null}

            <select
              className="max-w-[min(11rem,42vw)] rounded-lg border border-[var(--line)] bg-[var(--ink-2)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)] md:hidden sm:text-sm"
              value={boardId}
              onChange={(e) => router.push(`/board/${e.target.value}`)}
              aria-label="Trocar board"
            >
              {boardList.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col px-2 sm:px-3">
            {goalAttainment ? (
              <div className="mb-2 shrink-0">
                <GoalAttainmentPanel
                  attainment={goalAttainment}
                  variant={board.level === "project" ? "compact" : "cover"}
                />
              </div>
            ) : null}
            {boardIndicators ? (
              <div className="mb-2 shrink-0 rounded-2xl border border-white/15 bg-black/20 px-3 py-1.5">
                <BoardIndicators
                  stats={boardIndicators}
                  variant="full"
                  rolledUp={descendantIds.length > 0}
                  descendantCount={descendantIds.length}
                  activeFilter={cardFilter}
                  onChipClick={(chip) => {
                    if (!chip.filter) return;
                    setCardFilter((cur) => {
                      const next = { ...cur };
                      if (chip.filter?.due) {
                        next.due =
                          cur.due === chip.filter.due ? "" : chip.filter.due;
                      }
                      if (chip.filter?.priority) {
                        next.priority =
                          cur.priority === chip.filter.priority
                            ? ""
                            : chip.filter.priority;
                      }
                      return next;
                    });
                  }}
                />
              </div>
            ) : null}
            {boardIndicators ? (
              <BoardExecutiveSummary
                boardId={board.id}
                title={board.title}
                description={board.description}
                summary={board.executiveSummary}
                stats={boardIndicators}
                descendantCount={descendantIds.length}
              />
            ) : null}
            <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <BoardFilterBar
                  filter={cardFilter}
                  onChange={setCardFilter}
                  members={boardMembers}
                  matchCount={matchCount}
                  totalCount={totalCount}
                />
              </div>
              <div className="flex shrink-0 gap-1 rounded-xl border border-white/15 bg-black/15 p-0.5">
                <button
                  type="button"
                  onClick={() => setBoardLayout("kanban")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    boardLayout === "kanban"
                      ? "bg-white text-[#0079bf]"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Kanban
                </button>
                <button
                  type="button"
                  onClick={() => setBoardLayout("team")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    boardLayout === "team"
                      ? "bg-white text-[#0079bf]"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  <CalendarRange className="h-3.5 w-3.5" />
                  Por pessoa
                </button>
              </div>
              {descendantIds.length > 0 ? (
                <div className="flex shrink-0 gap-1 rounded-xl border border-white/15 bg-black/15 p-0.5">
                  <button
                    type="button"
                    onClick={() => setCanvasView("all")}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                      canvasView === "all"
                        ? "bg-white text-[#0079bf]"
                        : "text-white/70 hover:text-white"
                    }`}
                  >
                    <span className="sm:hidden">Todos</span>
                    <span className="hidden sm:inline">Local + inferiores</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCanvasView("local")}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                      canvasView === "local"
                        ? "bg-white text-[#0079bf]"
                        : "text-white/70 hover:text-white"
                    }`}
                  >
                    <span className="sm:hidden">Aqui</span>
                    <span className="hidden sm:inline">Só este board</span>
                  </button>
                </div>
              ) : null}
            </div>
            <MayaSuggestionsBar
              suggestions={mayaSuggestions}
              filter={cardFilter}
              onOpenMaya={() => setPanel("manager")}
              onSelect={(suggestion) => {
                if (suggestion.openMaya) {
                  setPanel("manager");
                  return;
                }
                if (suggestion.boardId && suggestion.boardId !== board.id) {
                  router.push(`/board/${suggestion.boardId}`);
                  return;
                }
                if (suggestion.filter) {
                  setCardFilter(applyMayaSuggestionFilter(suggestion));
                }
              }}
            />
            <div className="flex flex-col pb-8">
              {boardLayout === "team" ? (
                <TeamBoardView
                  boardId={board.id}
                  filter={cardFilter}
                  scopeBoardIds={scopeBoardIds}
                />
              ) : (
                <>
                  <div className="shrink-0">
                    <BoardCanvas boardId={board.id} filter={cardFilter} />
                  </div>
                  {hasChildBoards ? (
                    <ConsolidatedBoardCanvas
                      boardId={board.id}
                      filter={cardFilter}
                    />
                  ) : null}
                </>
              )}
            </div>
          </div>
        </main>

        {panel && panel !== "requirements" && panel !== "calendar" ? (
          <>
            <button
              type="button"
              aria-label="Fechar painel"
              className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px] lg:hidden"
              onClick={() => setPanel(null)}
            />
            <div
              className={`
                fixed inset-x-0 bottom-0 z-50 flex max-h-[min(90dvh,720px)] flex-col
                sm:inset-y-3 sm:right-3 sm:left-auto sm:max-h-none sm:w-[min(100vw-1.5rem,420px)]
                lg:sticky lg:top-[4.5rem] lg:z-auto lg:flex lg:max-h-[calc(100dvh-5.5rem)] lg:w-[min(38vw,400px)] lg:shrink-0 lg:self-start
                xl:w-[420px]
              `}
            >
              {panel === "brief" ? (
                <ProjectBriefPanel
                  boardId={board.id}
                  onClose={() => setPanel(null)}
                  onOpenFullRequirements={() => setPanel("requirements")}
                />
              ) : null}
              {panel === "manager" ? (
                <ManagerPanel boardId={board.id} onClose={() => setPanel(null)} />
              ) : null}
              {panel === "meetings" ? (
                <MeetingsPanel boardId={board.id} onClose={() => setPanel(null)} />
              ) : null}
              {panel === "invite" ? (
                <aside className="anim-rise panel-glass flex h-full min-h-0 w-full flex-col overflow-hidden rounded-t-3xl p-4 sm:rounded-3xl">
                  <InvitePanel boardId={board.id} onClose={() => setPanel(null)} />
                </aside>
              ) : null}
              {panel === "activity" ? (
                <ActivityPanel boardId={board.id} onClose={() => setPanel(null)} />
              ) : null}
              {panel === "whatsapp" ? (
                <WhatsAppGroupsPanel boardId={board.id} onClose={() => setPanel(null)} />
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {panel === "requirements" ? (
        <RequirementsPanel
          boardId={board.id}
          onClose={() =>
            setPanel(board.level === "project" ? "brief" : null)
          }
        />
      ) : null}
      {panel === "calendar" ? (
        <TeamCalendarPanel boardId={board.id} onClose={() => setPanel(null)} />
      ) : null}

      {moreOpen ? (
        <>
          <button
            type="button"
            aria-label="Fechar menu"
            className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-[1px] lg:hidden"
            onClick={() => setMoreOpen(false)}
          />
          <nav
            className="fixed inset-x-0 bottom-0 z-[70] max-h-[min(80dvh,36rem)] overflow-y-auto rounded-t-3xl border border-[var(--line)] bg-[var(--panel-strong)] p-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl lg:hidden"
            aria-label="Ferramentas do board"
          >
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Ferramentas
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => toggle("invite")}
                className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-3 text-left text-sm text-white hover:bg-white/5"
              >
                <UserPlus className="h-4 w-4 text-[var(--accent)]" />
                Convidar
              </button>
              <button
                type="button"
                onClick={() =>
                  toggle(board.level === "project" ? "brief" : "requirements")
                }
                className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-3 text-left text-sm text-white hover:bg-white/5"
              >
                {board.level === "project" ? (
                  <Target className="h-4 w-4 text-[var(--accent)]" />
                ) : (
                  <ClipboardList className="h-4 w-4 text-[var(--accent)]" />
                )}
                {board.level === "project" ? "Objetivos" : "Requisitos"}
                {reqCount > 0 ? (
                  <span className="ml-auto rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-bold text-[var(--accent-on)]">
                    {reqCount > 99 ? "99+" : reqCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => toggle("calendar")}
                className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-3 text-left text-sm text-white hover:bg-white/5"
              >
                <CalendarDays className="h-4 w-4 text-[var(--accent)]" />
                Calendário
                {calCount > 0 ? (
                  <span className="ml-auto rounded-full bg-[var(--accent-2)] px-1.5 text-[10px] font-bold text-slate-950">
                    {calCount > 99 ? "99+" : calCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => toggle("whatsapp")}
                className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-3 text-left text-sm text-white hover:bg-white/5"
              >
                <MessageCircle className="h-4 w-4 text-[var(--accent)]" />
                WhatsApp
                {(board.whatsappGroups || []).length > 0 ? (
                  <span className="ml-auto rounded-full bg-emerald-400 px-1.5 text-[10px] font-bold text-slate-950">
                    {(board.whatsappGroups || []).length > 99
                      ? "99+"
                      : (board.whatsappGroups || []).length}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setAppearanceOpen(true);
                }}
                className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-3 text-left text-sm text-white hover:bg-white/5"
              >
                <Palette className="h-4 w-4 text-[var(--accent)]" />
                Aparência
              </button>
              <button
                type="button"
                onClick={() => toggle("activity")}
                className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-3 text-left text-sm text-white hover:bg-white/5"
              >
                <History className="h-4 w-4 text-[var(--accent)]" />
                Atividade
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  createMeeting({
                    boardId: board.id,
                    title: `Reunião ao vivo — ${board.title}`,
                    startNow: true,
                  });
                }}
                className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/15 px-3 py-3 text-left text-sm text-rose-100 hover:bg-rose-500/25"
              >
                <Video className="h-4 w-4" />
                Ao vivo
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  resetDemo();
                }}
                className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-3 text-left text-sm text-white hover:bg-white/5"
              >
                <RotateCcw className="h-4 w-4 text-[var(--accent)]" />
                Resetar demo
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setPendingDelete(true);
                }}
                className="flex items-center gap-2 rounded-xl border border-rose-500/30 px-3 py-3 text-left text-sm text-rose-200 hover:bg-rose-500/15"
              >
                <Trash2 className="h-4 w-4" />
                Excluir
              </button>
            </div>
          </nav>
        </>
      ) : null}

      {appearanceOpen ? (
        <BoardAppearanceDrawer
          boardId={board.id}
          onClose={() => setAppearanceOpen(false)}
        />
      ) : null}

      {aiChatOpen ? (
        <AiChatDialog boardId={board.id} onClose={() => setAiChatOpen(false)} />
      ) : null}

      {pendingDelete ? (
        <DeleteBoardDialog
          boardId={board.id}
          title={board.title}
          listCount={board.listIds.length}
          cardCount={board.listIds.reduce(
            (n, lid) => n + (lists[lid]?.cardIds.length ?? 0),
            0,
          )}
          childCount={childBoards.length}
          busy={deleteBusy}
          onCancel={() => {
            if (!deleteBusy) setPendingDelete(false);
          }}
          onConfirm={() => void confirmDeleteBoard()}
        />
      ) : null}

      {board.level === "project" && panel !== "brief" && panel !== "requirements" ? (
        <button
          type="button"
          onClick={() => toggle("brief")}
          title="Objetivos e requisitos do projeto"
          className="fixed right-0 top-[42%] z-30 hidden items-center gap-1.5 rounded-l-xl border border-r-0 border-white/20 bg-[var(--panel-strong)] px-1.5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85 shadow-lg transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent)] hover:text-[var(--accent-on)] lg:flex"
        >
          <Target className="h-3.5 w-3.5 shrink-0" />
          <span
            className="leading-none"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Objetivos
          </span>
        </button>
      ) : null}
    </div>
  );
}
