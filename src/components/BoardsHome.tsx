"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  LayoutGrid,
  Palette,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { AuthButton } from "@/components/AuthButton";
import { BrandMark } from "@/components/BrandMark";
import { TeamsManager } from "@/components/TeamsManager";
import { InvitePanel } from "@/components/InvitePanel";
import { DeleteBoardDialog } from "@/components/DeleteBoardDialog";
import { BoardAppearanceEditor } from "@/components/BoardAppearanceDrawer";
import { useToast } from "@/components/Toast";
import { removeBoardFromServer, saveVisibleBoards } from "@/lib/board-sync";
import {
  BOARD_LEVEL_LABELS,
  BOARD_LEVEL_STYLES,
  BOARD_LEVELS,
  eligibleParentBoards,
  getDescendantBoardIds,
} from "@/lib/board-hierarchy";
import { extractBoardIndicators } from "@/lib/board-indicators";
import { extractGoalAttainment } from "@/lib/goal-attainment";
import { BoardIndicators } from "@/components/BoardIndicators";
import { GoalAttainmentPanel } from "@/components/GoalAttainmentPanel";
import { MayaSuggestionsBar } from "@/components/MayaSuggestionsBar";
import { ExecutiveSummaryField } from "@/components/BoardExecutiveSummary";
import { suggestMayaActivities } from "@/lib/maya-suggestions";
import { executiveSummaryExcerpt } from "@/lib/executive-summary";
import { useVisibleBoards } from "@/lib/use-visible-boards";
import { featuredHomeBoards, isFeaturedHomeBoard } from "@/lib/board-visibility";
import {
  DEFAULT_BACKGROUND_ID,
  DEFAULT_BACKGROUND_TINT,
  DEFAULT_CARD_THEME_ID,
  DEFAULT_DESIGN_ID,
  getBackground,
  type BoardBackgroundId,
  type BoardCardThemeId,
  type BoardDesignId,
} from "@/lib/board-themes";
import { useBoardStore } from "@/lib/store";
import { BoardVisibilityPicker } from "@/components/BoardVisibilityPicker";
import type { Board, BoardLevel } from "@/lib/types";
import type { BoardIndicatorStats } from "@/lib/board-indicators";
import type { MayaSuggestion } from "@/lib/maya-suggestions";

type HomeTab = "boards" | "teams";

function FeaturedBoardCard({
  board,
  boards,
  stats,
  rolledUp,
  suggestions,
  onOpen,
  onInvite,
}: {
  board: Board;
  boards: Record<string, Board>;
  stats?: BoardIndicatorStats;
  rolledUp: boolean;
  suggestions: MayaSuggestion[];
  onOpen: () => void;
  onInvite: () => void;
}) {
  const isOrg = board.level === "organization";
  const attainment = extractGoalAttainment(board.id, boards);
  return (
    <article
      className={`flex flex-col overflow-hidden rounded-3xl border p-5 sm:p-6 ${
        isOrg
          ? "border-sky-400/35 bg-gradient-to-br from-sky-500/15 via-black/20 to-blue-600/10"
          : "border-[var(--accent)]/30 bg-gradient-to-br from-[var(--accent)]/15 via-black/20 to-emerald-500/10"
      }`}
    >
      <p
        className={`text-xs font-semibold uppercase tracking-wide ${
          isOrg ? "text-sky-300" : "text-[var(--accent)]"
        }`}
      >
        {BOARD_LEVEL_LABELS[board.level]}
      </p>
      <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">
        {board.title}
      </h2>
      {board.description ? (
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          {board.description}
        </p>
      ) : null}
      {board.executiveSummary ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/85">
          <span
            className={`text-[11px] font-semibold uppercase tracking-wide ${
              isOrg ? "text-sky-300" : "text-[var(--accent)]"
            }`}
          >
            Resumo executivo
          </span>
          <span className="mt-1 block">
            {executiveSummaryExcerpt(board.executiveSummary, 280)}
          </span>
        </p>
      ) : null}
      {attainment ? (
        <div className="mt-4">
          <GoalAttainmentPanel attainment={attainment} variant="cover" />
        </div>
      ) : null}
      {stats ? (
        <div className={attainment ? "mt-3" : "mt-4"}>
          <BoardIndicators stats={stats} variant="full" rolledUp={rolledUp} />
          <MayaSuggestionsBar
            suggestions={suggestions}
            variant="compact"
            onSelect={onOpen}
          />
        </div>
      ) : null}
      <div className="mt-auto flex w-full flex-col gap-2 pt-4 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-on)] transition hover:brightness-110 sm:w-auto"
        >
          Abrir
          <span className="hidden max-w-[14rem] truncate sm:inline"> {board.title}</span>
        </button>
        <button
          type="button"
          onClick={onInvite}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm text-white transition hover:border-[var(--accent)] sm:w-auto"
        >
          <UserPlus className="h-4 w-4" />
          Convidar equipe
        </button>
      </div>
    </article>
  );
}

export function BoardsHome() {
  const router = useRouter();
  const boards = useBoardStore((s) => s.boards);
  const teams = useBoardStore((s) => s.teams);
  const lists = useBoardStore((s) => s.lists);
  const cards = useBoardStore((s) => s.cards);
  const requirements = useBoardStore((s) => s.requirements);
  const members = useBoardStore((s) => s.members);
  const currentUserId = useBoardStore((s) => s.currentUserId);
  const createBoard = useBoardStore((s) => s.createBoard);
  const setActiveBoard = useBoardStore((s) => s.setActiveBoard);
  const updateBoardAppearance = useBoardStore((s) => s.updateBoardAppearance);
  const renameBoard = useBoardStore((s) => s.renameBoard);
  const updateBoardDescription = useBoardStore((s) => s.updateBoardDescription);
  const updateBoardExecutiveSummary = useBoardStore((s) => s.updateBoardExecutiveSummary);
  const assignTeamToBoard = useBoardStore((s) => s.assignTeamToBoard);
  const assignBoardParent = useBoardStore((s) => s.assignBoardParent);
  const setBoardLevel = useBoardStore((s) => s.setBoardLevel);
  const createTeam = useBoardStore((s) => s.createTeam);
  const deleteBoard = useBoardStore((s) => s.deleteBoard);
  const { boardList, teamList: teamOptions } = useVisibleBoards();
  const { toast } = useToast();

  const me = currentUserId ? members[currentUserId] : null;

  const featuredBoards = useMemo(() => featuredHomeBoards(boardList), [boardList]);
  const featuredIds = useMemo(
    () => new Set(featuredBoards.map((board) => board.id)),
    [featuredBoards],
  );

  const [tab, setTab] = useState<HomeTab>("boards");
  const [creating, setCreating] = useState(false);
  const [boardQuery, setBoardQuery] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [executiveSummary, setExecutiveSummary] = useState("");
  const [bgId, setBgId] = useState<BoardBackgroundId>(DEFAULT_BACKGROUND_ID);
  const [designId, setDesignId] = useState<BoardDesignId>(DEFAULT_DESIGN_ID);
  const [cardThemeId, setCardThemeId] = useState<BoardCardThemeId>(DEFAULT_CARD_THEME_ID);
  const [createImageUrl, setCreateImageUrl] = useState<string | null>(null);
  const [createTint, setCreateTint] = useState(DEFAULT_BACKGROUND_TINT);
  const [teamId, setTeamId] = useState<string>("");
  const [boardLevel, setBoardLevelState] = useState<BoardLevel>("project");
  const [parentBoardId, setParentBoardId] = useState<string>("");
  const [newTeamName, setNewTeamName] = useState("");
  const [customizeId, setCustomizeId] = useState<string | null>(null);
  const [inviteBoardId, setInviteBoardId] = useState<string | null>(null);
  const [customizeNewTeam, setCustomizeNewTeam] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [pickingBoards, setPickingBoards] = useState(false);

  const customizeBoard = customizeId ? boards[customizeId] : null;

  const filteredBoards = useMemo(() => {
    const q = boardQuery.trim().toLowerCase();
    const source = boardList.filter((b) => !featuredIds.has(b.id));
    if (!q) return source;
    return source.filter((b) => {
      const teamName = b.teamId ? teams[b.teamId]?.name ?? "" : "";
      const parentTitle = b.parentBoardId
        ? boards[b.parentBoardId]?.title ?? ""
        : "";
      return (
        b.title.toLowerCase().includes(q) ||
        (b.description || "").toLowerCase().includes(q) ||
        (b.executiveSummary || "").toLowerCase().includes(q) ||
        teamName.toLowerCase().includes(q) ||
        parentTitle.toLowerCase().includes(q) ||
        BOARD_LEVEL_LABELS[b.level].toLowerCase().includes(q)
      );
    });
  }, [boardList, boardQuery, teams, boards, featuredIds]);

  const parentBoardOptions = useMemo(
    () => eligibleParentBoards(boardLevel, boardList),
    [boardList, boardLevel],
  );

  const indicatorsByBoard = useMemo(() => {
    const map: Record<string, ReturnType<typeof extractBoardIndicators>> = {};
    for (const b of boardList) {
      const descendantIds = getDescendantBoardIds(b.id, boards);
      map[b.id] = extractBoardIndicators({
        boardIds: [b.id, ...descendantIds],
        boards,
        lists,
        cards,
        requirements,
      });
    }
    return map;
  }, [boardList, boards, lists, cards, requirements]);

  const suggestionsByBoard = useMemo(() => {
    const map: Record<string, ReturnType<typeof suggestMayaActivities>> = {};
    for (const b of boardList) {
      const descendantIds = getDescendantBoardIds(b.id, boards);
      map[b.id] = suggestMayaActivities({
        boardIds: [b.id, ...descendantIds],
        rootBoardId: b.id,
        boards,
        lists,
        cards,
        requirements,
        members,
        limit: 1,
      });
    }
    return map;
  }, [boardList, boards, lists, cards, requirements, members]);

  const openBoard = (boardId: string) => {
    setActiveBoard(boardId);
    router.push(`/board/${boardId}`);
  };

  const boardCounts = (boardId: string) => {
    const board = boards[boardId];
    if (!board) return { listCount: 0, cardCount: 0, childCount: 0 };
    return {
      listCount: board.listIds.length,
      cardCount: board.listIds.reduce((n, lid) => n + (lists[lid]?.cardIds.length ?? 0), 0),
      childCount: Object.values(boards).filter((b) => b.parentBoardId === boardId).length,
    };
  };

  const confirmDeleteBoard = async () => {
    if (!pendingDeleteId) return;
    const target = boards[pendingDeleteId];
    if (!target) {
      setPendingDeleteId(null);
      return;
    }
    setDeleteBusy(true);
    const synced = await removeBoardFromServer(target.id);
    deleteBoard(target.id);
    setDeleteBusy(false);
    setPendingDeleteId(null);
    setCustomizeId((cur) => (cur === target.id ? null : cur));
    toast(
      synced
        ? `Board "${target.title}" excluído.`
        : `Board "${target.title}" removido neste dispositivo. Se reaparecer, tente de novo logado.`,
    );
  };

  const hideBoard = async (boardId: string) => {
    if (isFeaturedHomeBoard(boardId)) {
      toast("O board da organização e o do time ficam sempre no destaque.");
      return;
    }
    const nextIds = boardList.filter((b) => b.id !== boardId).map((b) => b.id);
    try {
      await saveVisibleBoards(nextIds);
    } catch {
      toast("Não foi possível ocultar este board.");
      return;
    }
    const title = boards[boardId]?.title || "Board";
    toast(`"${title}" saiu da sua home. Você pode reexibir em Boards visíveis.`);
  };

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    let linkedTeamId = teamId || null;
    if (!linkedTeamId && newTeamName.trim()) {
      linkedTeamId = createTeam({
        name: newTeamName.trim(),
        memberIds: currentUserId ? [currentUserId] : [],
      });
    }
    const id = createBoard(title.trim(), description.trim(), {
      backgroundId: bgId,
      designId,
      cardThemeId,
      backgroundImageUrl: createImageUrl,
      backgroundTint: createTint,
      teamId: linkedTeamId,
      level: boardLevel,
      parentBoardId: parentBoardId || null,
      executiveSummary,
    });
    setTitle("");
    setDescription("");
    setExecutiveSummary("");
    setTeamId("");
    setBoardLevelState("project");
    setParentBoardId("");
    setNewTeamName("");
    setBgId(DEFAULT_BACKGROUND_ID);
    setDesignId(DEFAULT_DESIGN_ID);
    setCardThemeId(DEFAULT_CARD_THEME_ID);
    setCreateImageUrl(null);
    setCreateTint(DEFAULT_BACKGROUND_TINT);
    setCreating(false);
    openBoard(id);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="app-bar shrink-0 border-b backdrop-blur-md">
        <div className="mx-auto flex min-h-14 max-w-6xl items-center gap-2 px-3 py-2 sm:h-16 sm:gap-3 sm:px-6 sm:py-0">
          <div className="min-w-0 flex-1">
            <BrandMark size="sm" subtitle="Ceará · Terra da Luz" />
            <p className="mt-0.5 hidden truncate text-xs text-[var(--muted)] sm:block">
              {me ? `Olá, ${me.name.split(" ")[0]}` : "Seus boards"}
            </p>
          </div>
          <AuthButton />
          <button
            type="button"
            onClick={() => setPickingBoards(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--line)] p-2 text-sm text-[var(--muted)] transition hover:text-white sm:px-3 sm:py-2"
            title="Escolher quais boards aparecem na home"
          >
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Boards visíveis</span>
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl btn-accent p-2 text-sm font-semibold sm:px-3 sm:py-2"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo board</span>
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-white sm:text-3xl">
              {tab === "boards" ? "Seus boards" : "Equipes"}
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {tab === "boards"
                ? "O board da organização e o do time ficam no destaque. Escolha quais outros kanbans aparecem abaixo."
                : "Crie equipes e vincule-as a cada board. Cada equipe só vê os próprios kanbans."}
            </p>
          </div>

          <div className="flex rounded-xl border border-[var(--line)] bg-black/20 p-1">
            <button
              type="button"
              onClick={() => setTab("boards")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
                tab === "boards"
                  ? "bg-[var(--accent)] font-semibold text-[var(--accent-on)]"
                  : "text-[var(--muted)] hover:text-white"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              Boards
            </button>
            <button
              type="button"
              onClick={() => setTab("teams")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
                tab === "teams"
                  ? "bg-[var(--accent)] font-semibold text-[var(--accent-on)]"
                  : "text-[var(--muted)] hover:text-white"
              }`}
            >
              <Users className="h-4 w-4" />
              Equipes
            </button>
          </div>
        </div>

        {tab === "teams" ? <TeamsManager /> : null}

        {tab === "boards" && featuredBoards.length > 0 ? (
          <section className="mb-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
              Destaque
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {featuredBoards.map((board) => (
                <FeaturedBoardCard
                  key={board.id}
                  board={board}
                  boards={boards}
                  stats={indicatorsByBoard[board.id]}
                  rolledUp={getDescendantBoardIds(board.id, boards).length > 0}
                  suggestions={suggestionsByBoard[board.id] || []}
                  onOpen={() => openBoard(board.id)}
                  onInvite={() => setInviteBoardId(board.id)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {tab === "boards" ? (
          <div className="mb-4">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <input
                value={boardQuery}
                onChange={(e) => setBoardQuery(e.target.value)}
                placeholder="Buscar boards ou times…"
                className="w-full rounded-2xl border border-[var(--line)] bg-black/25 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>
        ) : null}

        {tab === "boards" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/35 bg-white/10 p-6 text-white/80 transition hover:border-white/55 hover:bg-white/15 hover:text-white"
          >
            <Plus className="h-8 w-8 text-[var(--accent)]" />
            <span className="text-sm font-medium">Criar board</span>
          </button>

          {!boardQuery.trim() && filteredBoards.length === 0 && featuredBoards.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-[var(--line)] bg-black/15 px-6 py-12 text-center">
              <p className="text-sm text-white">Nenhum board nesta lista</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Escolha quais boards visualizar, peça um convite da equipe ou crie um board novo.
              </p>
              <button
                type="button"
                onClick={() => setPickingBoards(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent-on)]"
              >
                <Eye className="h-4 w-4" />
                Escolher boards
              </button>
            </div>
          ) : null}

          {filteredBoards.map((board) => {
            const bg = getBackground(board.backgroundId);
            const team = board.teamId ? teams[board.teamId] : null;
            const listCount = board.listIds.length;
            const cardCount = board.listIds.reduce(
              (n, lid) => n + (lists[lid]?.cardIds.length ?? 0),
              0,
            );
            const memberCount = board.memberIds?.length ?? 0;
            const attainment = extractGoalAttainment(board.id, boards);

            return (
              <article
                key={board.id}
                className="group relative flex min-h-[168px] flex-col overflow-hidden rounded-xl border border-white/20 shadow-[0_8px_20px_rgba(9,30,66,0.22)] transition hover:border-white/40 hover:shadow-[0_12px_28px_rgba(9,30,66,0.28)]"
              >
                <button
                  type="button"
                  onClick={() => openBoard(board.id)}
                  className="flex min-h-[168px] flex-1 flex-col text-left"
                >
                  <div
                    className="relative flex flex-1 flex-col justify-end p-4"
                    style={
                      board.backgroundImageUrl
                        ? {
                            backgroundImage: `url("${board.backgroundImageUrl.replace(/"/g, "")}")`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }
                        : { backgroundImage: bg.preview }
                    }
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
                    <div className="relative z-[1]">
                      <span
                        className={`mb-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${BOARD_LEVEL_STYLES[board.level]}`}
                      >
                        {BOARD_LEVEL_LABELS[board.level]}
                      </span>
                      <h2 className="font-[family-name:var(--font-display)] text-lg leading-snug text-white drop-shadow-sm">
                        {board.title}
                      </h2>
                      {board.description ? (
                        <p className="mt-1 line-clamp-2 text-xs text-white/85">
                          {board.description}
                        </p>
                      ) : null}
                      {board.executiveSummary ? (
                        <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-white/80">
                          <span className="font-semibold uppercase tracking-wide text-white/70">
                            Resumo ·{" "}
                          </span>
                          {executiveSummaryExcerpt(board.executiveSummary, 180)}
                        </p>
                      ) : null}
                      <p className="mt-2 text-[11px] text-white/75">
                        {board.parentBoardId
                          ? `↑ ${boards[board.parentBoardId]?.title ?? "Superior"} · `
                          : ""}
                        {team ? `${team.name} · ` : ""}
                        {listCount} listas · {cardCount} cards · {memberCount} membros
                      </p>
                      <div className="mt-2">
                        {attainment ? (
                          <div className="mb-1.5">
                            <GoalAttainmentPanel
                              attainment={attainment}
                              variant="compact"
                            />
                          </div>
                        ) : null}
                        <BoardIndicators
                          stats={indicatorsByBoard[board.id]}
                          variant="compact"
                          rolledUp={
                            getDescendantBoardIds(board.id, boards).length > 0
                          }
                        />
                        <MayaSuggestionsBar
                          suggestions={suggestionsByBoard[board.id] || []}
                          variant="compact"
                          onSelect={() => openBoard(board.id)}
                        />
                      </div>
                    </div>
                  </div>
                </button>

                <div className="flex shrink-0 items-center justify-end gap-1 border-t border-white/10 bg-black/45 px-2 py-1.5">
                  <button
                    type="button"
                    title="Ocultar da minha home"
                    onClick={(e) => {
                      e.stopPropagation();
                      void hideBoard(board.id);
                    }}
                    className="rounded-lg border border-white/15 bg-black/35 p-2 text-white hover:bg-black/65"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Convidar para o board"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInviteBoardId(board.id);
                    }}
                    className="rounded-lg border border-white/15 bg-black/35 p-2 text-white hover:bg-black/65"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Renomear / personalizar"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCustomizeId(board.id);
                    }}
                    className="rounded-lg border border-white/15 bg-black/35 p-2 text-white hover:bg-black/65"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Excluir board"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteId(board.id);
                    }}
                    className="rounded-lg border border-rose-400/30 bg-black/35 p-2 text-rose-100 hover:bg-rose-600/70"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Aparência (fundo do board e dos cards)"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCustomizeId(board.id);
                    }}
                    className="rounded-lg border border-white/15 bg-black/35 p-2 text-white hover:bg-black/65"
                  >
                    <Palette className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
          {boardQuery.trim() && filteredBoards.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-[var(--line)] bg-black/15 px-6 py-12 text-center">
              <p className="text-sm text-white">Nenhum board encontrado</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Tente outro termo de busca.
              </p>
            </div>
          ) : null}
        </div>
        ) : null}
      </main>

      {creating ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <form
            onSubmit={onCreate}
            className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-[var(--line)] bg-[var(--panel-strong)] sm:rounded-3xl"
          >
            <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <div>
                <p className="font-[family-name:var(--font-display)] text-lg text-white">
                  Novo board
                </p>
                <p className="text-xs text-[var(--muted)]">Nome, equipe, fundo e design</p>
              </div>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-lg p-2 text-[var(--muted)] hover:text-white"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="board-scroll space-y-4 overflow-y-auto p-4">
              <label className="block text-xs text-[var(--muted)]">
                Título
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
                  placeholder="Ex.: Sprint Q3"
                />
              </label>
              <label className="block text-xs text-[var(--muted)]">
                Descrição
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
                  placeholder="Opcional — frase curta"
                />
              </label>
              <ExecutiveSummaryField
                value={executiveSummary}
                onChange={setExecutiveSummary}
              />

              <label className="block text-xs text-[var(--muted)]">
                Nível hierárquico
                <select
                  value={boardLevel}
                  onChange={(e) => {
                    const next = e.target.value as BoardLevel;
                    setBoardLevelState(next);
                    setParentBoardId("");
                  }}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
                >
                  {BOARD_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {BOARD_LEVEL_LABELS[lvl]}
                    </option>
                  ))}
                </select>
              </label>

              {parentBoardOptions.length > 0 ? (
                <label className="block text-xs text-[var(--muted)]">
                  Board superior
                  <select
                    value={parentBoardId}
                    onChange={(e) => setParentBoardId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
                  >
                    <option value="">Sem vínculo (opcional)</option>
                    {parentBoardOptions.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="block text-xs text-[var(--muted)]">
                Equipe do kanban
                <select
                  value={teamId}
                  onChange={(e) => {
                    setTeamId(e.target.value);
                    if (e.target.value) setNewTeamName("");
                  }}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
                >
                  <option value="">Sem equipe / criar nova abaixo</option>
                  {teamOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.memberIds.length} membros)
                    </option>
                  ))}
                </select>
              </label>

              {!teamId ? (
                <label className="block text-xs text-[var(--muted)]">
                  Ou cadastrar novo time
                  <input
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
                    placeholder="Nome da equipe (ex.: Produto)"
                  />
                </label>
              ) : null}

              <BoardAppearanceEditor
                backgroundId={bgId}
                designId={designId}
                cardThemeId={cardThemeId}
                backgroundImageUrl={createImageUrl}
                backgroundTint={createTint}
                onChange={(patch) => {
                  if (patch.backgroundId) setBgId(patch.backgroundId);
                  if (patch.designId) setDesignId(patch.designId);
                  if (patch.cardThemeId) setCardThemeId(patch.cardThemeId);
                  if (patch.backgroundImageUrl !== undefined) {
                    setCreateImageUrl(patch.backgroundImageUrl);
                  }
                  if (patch.backgroundTint !== undefined) setCreateTint(patch.backgroundTint);
                }}
              />
            </div>

            <footer className="flex gap-2 border-t border-[var(--line)] p-4">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="flex-1 rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--muted)] hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!title.trim()}
                className="flex-1 rounded-xl bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-[var(--accent-on)] disabled:opacity-40"
              >
                Criar e abrir
              </button>
            </footer>
          </form>
        </div>
      ) : null}

      {customizeBoard ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-[var(--line)] bg-[var(--panel-strong)] sm:rounded-3xl">
            <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-[var(--accent)]" />
                <div>
                  <p className="font-[family-name:var(--font-display)] text-lg text-white">
                    Personalizar
                  </p>
                  <p className="text-xs text-[var(--muted)]">{customizeBoard.title}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCustomizeId(null)}
                className="rounded-lg p-2 text-[var(--muted)] hover:text-white"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="board-scroll space-y-4 overflow-y-auto p-4">
              <label className="block text-xs text-[var(--muted)]">
                Título
                <input
                  value={customizeBoard.title}
                  onChange={(e) => renameBoard(customizeBoard.id, e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="block text-xs text-[var(--muted)]">
                Descrição
                <input
                  value={customizeBoard.description}
                  onChange={(e) =>
                    updateBoardDescription(customizeBoard.id, e.target.value)
                  }
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
                />
              </label>
              <ExecutiveSummaryField
                value={customizeBoard.executiveSummary || ""}
                onChange={(value) =>
                  updateBoardExecutiveSummary(customizeBoard.id, value)
                }
              />

              <label className="block text-xs text-[var(--muted)]">
                Nível hierárquico
                <select
                  value={customizeBoard.level}
                  onChange={(e) =>
                    setBoardLevel(customizeBoard.id, e.target.value as BoardLevel)
                  }
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
                >
                  {BOARD_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {BOARD_LEVEL_LABELS[lvl]}
                    </option>
                  ))}
                </select>
              </label>

              {eligibleParentBoards(customizeBoard.level, boardList, customizeBoard.id)
                .length > 0 ? (
                <label className="block text-xs text-[var(--muted)]">
                  Board superior
                  <select
                    value={customizeBoard.parentBoardId ?? ""}
                    onChange={(e) =>
                      assignBoardParent(
                        customizeBoard.id,
                        e.target.value ? e.target.value : null,
                      )
                    }
                    className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
                  >
                    <option value="">Sem superior</option>
                    {eligibleParentBoards(
                      customizeBoard.level,
                      boardList,
                      customizeBoard.id,
                    ).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="block text-xs text-[var(--muted)]">
                Equipe atribuída
                <select
                  value={customizeBoard.teamId ?? ""}
                  onChange={(e) => {
                    assignTeamToBoard(customizeBoard.id, e.target.value || null);
                    if (e.target.value) setCustomizeNewTeam("");
                  }}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
                >
                  <option value="">Sem equipe</option>
                  {teamOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.memberIds.length} membros)
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex gap-2">
                <input
                  value={customizeNewTeam}
                  onChange={(e) => setCustomizeNewTeam(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
                  placeholder="Cadastrar novo time neste board"
                />
                <button
                  type="button"
                  disabled={!customizeNewTeam.trim()}
                  onClick={() => {
                    const name = customizeNewTeam.trim();
                    if (!name || !customizeBoard) return;
                    const id = createTeam({
                      name,
                      memberIds: customizeBoard.memberIds?.length
                        ? [...customizeBoard.memberIds]
                        : currentUserId
                          ? [currentUserId]
                          : [],
                    });
                    assignTeamToBoard(customizeBoard.id, id);
                    setCustomizeNewTeam("");
                  }}
                  className="shrink-0 rounded-xl bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-[var(--accent-on)] disabled:opacity-40"
                >
                  Criar
                </button>
              </div>

              <BoardAppearanceEditor
                backgroundId={customizeBoard.backgroundId}
                designId={customizeBoard.designId}
                cardThemeId={customizeBoard.cardThemeId}
                backgroundImageUrl={customizeBoard.backgroundImageUrl}
                backgroundTint={customizeBoard.backgroundTint}
                onChange={(patch) => updateBoardAppearance(customizeBoard.id, patch)}
              />
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--line)] p-4 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => setPendingDeleteId(customizeBoard.id)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 px-3 py-2.5 text-sm text-rose-300 hover:bg-rose-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir
              </button>
              <div className="flex gap-2 sm:ml-auto">
                <button
                  type="button"
                  onClick={() => setCustomizeId(null)}
                  className="flex-1 rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--muted)] hover:text-white sm:flex-none"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => openBoard(customizeBoard.id)}
                  className="flex-1 rounded-xl bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-[var(--accent-on)] sm:flex-none"
                >
                  Abrir board
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}

      {inviteBoardId ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setInviteBoardId(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl border border-[var(--line)] bg-[var(--ink-2)] p-5 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <InvitePanel boardId={inviteBoardId} onClose={() => setInviteBoardId(null)} />
          </div>
        </div>
      ) : null}

      {pendingDeleteId && boards[pendingDeleteId] ? (
        <DeleteBoardDialog
          boardId={pendingDeleteId}
          title={boards[pendingDeleteId].title}
          {...boardCounts(pendingDeleteId)}
          busy={deleteBusy}
          onCancel={() => {
            if (!deleteBusy) setPendingDeleteId(null);
          }}
          onConfirm={() => void confirmDeleteBoard()}
        />
      ) : null}

      <BoardVisibilityPicker
        open={pickingBoards}
        onClose={() => setPickingBoards(false)}
      />
    </div>
  );
}
