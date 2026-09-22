"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Bot,
  ClipboardList,
  Copy,
  FileCode2,
  FlaskConical,
  LayoutList,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react";
import { useBoardStore } from "@/lib/store";
import {
  priorityLabel,
  priorityStyles,
  requirementStatusLabel,
  requirementStatusStyles,
} from "@/lib/utils";
import type { Requirement, RequirementStatus } from "@/lib/types";
import { useToast } from "@/components/Toast";

const STATUSES: RequirementStatus[] = [
  "draft",
  "approved",
  "in_progress",
  "done",
  "rejected",
];

type StatusFilter = "all" | RequirementStatus;
type EditorMode = "create" | "edit" | null;
type PromptTab = "spec" | "test" | "code" | "mcp" | "a2a";

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function PromptViewer({
  req,
  onClose,
  onRegenerate,
}: {
  req: Requirement;
  onClose: () => void;
  onRegenerate: () => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<PromptTab>("spec");

  const tabs: { id: PromptTab; label: string; icon: ReactNode }[] = [
    { id: "spec", label: "Spec-based", icon: <FileCode2 className="h-3.5 w-3.5" /> },
    { id: "test", label: "Testes", icon: <FlaskConical className="h-3.5 w-3.5" /> },
    { id: "code", label: "Código", icon: <SquareTerminal className="h-3.5 w-3.5" /> },
    { id: "mcp", label: "MCP", icon: <Sparkles className="h-3.5 w-3.5" /> },
    { id: "a2a", label: "A2A", icon: <Bot className="h-3.5 w-3.5" /> },
  ];

  const content =
    tab === "spec"
      ? req.specPrompt || ""
      : tab === "test"
        ? req.testPrompt || ""
        : tab === "code"
          ? req.codePrompt || ""
          : tab === "mcp"
            ? req.mcpPayload || ""
            : req.a2aObjective || "";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Prompts ${req.code}`}
      className="fixed inset-0 z-[230] flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col bg-[var(--ink-2)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] bg-black/40 px-3 py-2.5 backdrop-blur-md sm:px-6 sm:py-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            {req.code} · prompts
          </p>
          <h3 className="truncate font-[family-name:var(--font-display)] text-lg text-white sm:text-2xl">
            Spec · Testes · Código · MCP · A2A
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onRegenerate();
              toast("Prompts regenerados");
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-2.5 py-2 text-xs text-white hover:bg-white/5 sm:text-sm"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Regenerar</span>
          </button>
          <button
            type="button"
            className="rounded-xl border border-[var(--line)] p-2.5 text-[var(--muted)] hover:text-white"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="board-scroll flex shrink-0 gap-1.5 overflow-x-auto border-b border-[var(--line)] px-3 py-2 sm:px-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
              tab === t.id
                ? "bg-[var(--accent)] font-semibold text-[var(--accent-on)]"
                : "border border-[var(--line)] text-[var(--muted)] hover:text-white"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="board-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
        <pre className="min-h-full whitespace-pre-wrap break-words rounded-2xl border border-[var(--line)] bg-black/30 p-4 font-mono text-[11px] leading-relaxed text-white/90 sm:p-5 sm:text-xs md:text-sm">
          {content || "Sem conteúdo — regenerar prompts."}
        </pre>
      </div>

      <footer className="flex shrink-0 border-t border-[var(--line)] bg-black/40 px-3 py-2.5 sm:px-6 sm:py-4">
        <button
          type="button"
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--accent-on)]"
          onClick={async () => {
            if (!content) return;
            await copyText(content);
            toast(
              tab === "mcp"
                ? "Payload MCP copiado"
                : tab === "a2a"
                  ? "Objetivo A2A copiado"
                  : "Prompt copiado",
            );
          }}
        >
          <Copy className="h-4 w-4" />
          Copiar {tabs.find((t) => t.id === tab)?.label}
        </button>
      </footer>
    </div>,
    document.body,
  );
}

export function RequirementsPanel({
  boardId,
  onClose,
}: {
  boardId: string;
  onClose: () => void;
}) {
  const board = useBoardStore((s) => s.boards[boardId]);
  const members = useBoardStore((s) => s.members);
  const requirements = useBoardStore((s) => s.requirements);
  const cards = useBoardStore((s) => s.cards);
  const createRequirement = useBoardStore((s) => s.createRequirement);
  const updateRequirement = useBoardStore((s) => s.updateRequirement);
  const deleteRequirement = useBoardStore((s) => s.deleteRequirement);
  const regenerateRequirementPrompts = useBoardStore(
    (s) => s.regenerateRequirementPrompts,
  );
  const regenerateBoardRequirementPrompts = useBoardStore(
    (s) => s.regenerateBoardRequirementPrompts,
  );
  const ensureBoardRequirementPrompts = useBoardStore(
    (s) => s.ensureBoardRequirementPrompts,
  );
  const addCard = useBoardStore((s) => s.addCard);
  const { toast } = useToast();

  const [mounted, setMounted] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [promptsReqId, setPromptsReqId] = useState<string | null>(null);

  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftPriority, setDraftPriority] = useState<"low" | "medium" | "high">(
    "medium",
  );
  const [draftStatus, setDraftStatus] = useState<RequirementStatus>("draft");
  const [draftOwnerId, setDraftOwnerId] = useState("");
  const [draftDueDate, setDraftDueDate] = useState("");
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    ensureBoardRequirementPrompts(boardId);
  }, [boardId, ensureBoardRequirementPrompts]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (promptsReqId) setPromptsReqId(null);
      else if (editorMode) closeEditor();
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, editorMode, promptsReqId]);

  useEffect(() => {
    if (!editorMode) return;
    const t = window.setTimeout(() => titleRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [editorMode, editingId]);

  const boardMembers = useMemo(() => {
    if (!board) return [];
    return (board.memberIds ?? []).map((id) => members[id]).filter(Boolean);
  }, [board, members]);

  const list = useMemo(
    () =>
      Object.values(requirements || {})
        .filter((r) => r.boardId === boardId)
        .sort((a, b) => a.code.localeCompare(b.code)),
    [requirements, boardId],
  );

  const counts = useMemo(() => {
    const base: Record<StatusFilter, number> = {
      all: list.length,
      draft: 0,
      approved: 0,
      in_progress: 0,
      done: 0,
      rejected: 0,
    };
    for (const r of list) base[r.status] += 1;
    return base;
  }, [list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
      );
    });
  }, [list, statusFilter, query]);

  const editingReq = editingId ? requirements?.[editingId] : null;
  const promptsReq = promptsReqId ? requirements?.[promptsReqId] : null;

  const linkedCount = (requirementId: string) =>
    Object.values(cards).filter((c) => c.requirementId === requirementId).length;

  const resetDraft = () => {
    setDraftTitle("");
    setDraftDescription("");
    setDraftPriority("medium");
    setDraftStatus("draft");
    setDraftOwnerId("");
    setDraftDueDate("");
  };

  const closeEditor = () => {
    setEditorMode(null);
    setEditingId(null);
    resetDraft();
  };

  const openCreate = () => {
    resetDraft();
    setEditingId(null);
    setEditorMode("create");
  };

  const openEdit = (req: Requirement) => {
    setEditingId(req.id);
    setDraftTitle(req.title);
    setDraftDescription(req.description);
    setDraftPriority(req.priority);
    setDraftStatus(req.status);
    setDraftOwnerId(req.ownerId ?? "");
    setDraftDueDate(req.dueDate ?? "");
    setEditorMode("edit");
  };

  const saveEditor = () => {
    if (!draftTitle.trim()) return;

    if (editorMode === "create") {
      const id = createRequirement({
        boardId,
        title: draftTitle.trim(),
        description: draftDescription,
        priority: draftPriority,
        ownerId: draftOwnerId || null,
        dueDate: draftDueDate || null,
        status: draftStatus,
      });
      setJustCreated(id);
      toast("Requisito cadastrado com prompts Spec/Testes/Código/MCP/A2A");
      window.setTimeout(() => setJustCreated(null), 1800);
      closeEditor();
      return;
    }

    if (editorMode === "edit" && editingId) {
      updateRequirement(editingId, {
        title: draftTitle.trim() || "Requisito",
        description: draftDescription,
        priority: draftPriority,
        status: draftStatus,
        ownerId: draftOwnerId || null,
        dueDate: draftDueDate || null,
      });
      toast("Requisito salvo (prompts atualizados)");
      closeEditor();
    }
  };

  const createCardFromRequirement = (req: Requirement) => {
    const firstListId = board?.listIds?.[0];
    if (!firstListId) {
      toast("Crie uma lista no board antes de gerar o card");
      return;
    }
    addCard(firstListId, req.title, {
      description: req.description,
      priority: req.priority,
      dueDate: req.dueDate ?? null,
      assigneeId: req.ownerId ?? null,
      requirementId: req.id,
      acceptanceCriteria: req.testPrompt
        ? `Ver plano de testes em ${req.code}`
        : "",
    });
    toast(`Card criado a partir de ${req.code}`);
  };

  if (!mounted) return null;

  const filters: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "Todos" },
    ...STATUSES.map((s) => ({
      id: s as StatusFilter,
      label: requirementStatusLabel[s],
    })),
  ];

  const editorOpen = editorMode !== null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cadastro de requisitos"
      className="anim-overlay fixed inset-0 z-[200] flex h-[100dvh] w-full max-w-full flex-col bg-[var(--ink)]"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(900px 420px at 8% -5%, rgba(46,196,182,0.16), transparent 55%), radial-gradient(700px 380px at 92% 0%, rgba(255,183,3,0.1), transparent 50%)",
        }}
      />

      <header className="anim-sheet relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] bg-black/25 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4 lg:px-10">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            {board?.title ?? "Board"}
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-xl tracking-tight text-white sm:text-2xl">
            Requisitos
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="hidden rounded-full border border-[var(--line)] bg-black/20 px-3 py-1 text-xs text-[var(--muted)] lg:inline">
            {list.length} no total
          </span>
          <button
            type="button"
            onClick={() => {
              const n = regenerateBoardRequirementPrompts(boardId);
              toast(
                n
                  ? `${n} requisito(s) com prompts Spec/Testes/Código/MCP/A2A`
                  : "Nenhum requisito neste board",
              );
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-2.5 py-2 text-xs text-white hover:bg-white/5 sm:text-sm"
            title="Gerar/regenerar prompts de todos"
          >
            <Sparkles className="h-4 w-4 text-[var(--accent)]" />
            <span className="hidden sm:inline">Prompts todos</span>
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent-on)] transition hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo requisito</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-[var(--line)] bg-black/20 p-2.5 text-[var(--muted)] transition hover:border-white/20 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="board-scroll relative z-10 min-h-0 flex-1 overflow-y-auto">
        <div className="anim-sheet mx-auto w-full max-w-7xl space-y-4 px-4 py-5 sm:px-6 sm:py-8 lg:px-10">
          <p className="text-xs text-[var(--muted)] sm:text-sm">
            Cada requisito gera automaticamente prompts de{" "}
            <span className="text-white/80">spec-based</span>,{" "}
            <span className="text-white/80">testes</span>, payload{" "}
            <span className="text-white/80">MCP</span> e objetivo{" "}
            <span className="text-white/80">A2A</span>.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por código, título…"
                className="w-full rounded-2xl border border-[var(--line)] bg-black/25 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          <div className="board-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition ${
                  statusFilter === f.id
                    ? "bg-[var(--accent)] font-semibold text-[var(--accent-on)]"
                    : "border border-[var(--line)] bg-black/20 text-[var(--muted)] hover:text-white"
                }`}
              >
                {f.label}
                <span className="ml-1.5 opacity-70">{counts[f.id]}</span>
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--line)] bg-black/15 px-6 py-20 text-center">
              <ClipboardList className="mx-auto mb-3 h-10 w-10 text-[var(--muted)] opacity-70" />
              <p className="text-base text-white">
                {list.length === 0
                  ? "Nenhum requisito ainda"
                  : "Nada encontrado neste filtro"}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {list.length === 0
                      ? "Cadastre um requisito para gerar prompts Spec/Testes/Código/MCP/A2A."
                  : "Ajuste a busca ou o status."}
              </p>
              {list.length === 0 ? (
                <button
                  type="button"
                  onClick={openCreate}
                  className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-on)]"
                >
                  <Plus className="h-4 w-4" />
                  Novo requisito
                </button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((req, index) => {
                const owner = req.ownerId ? members[req.ownerId] : null;
                const hasPrompts = Boolean(
                  req.specPrompt && req.testPrompt && req.codePrompt && req.mcpPayload,
                );
                return (
                  <article
                    key={req.id}
                    className={`flex flex-col rounded-3xl border bg-[var(--panel-strong)] p-4 transition ${
                      justCreated === req.id
                        ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30"
                        : "border-[var(--line)] hover:border-[var(--accent)]/35"
                    }`}
                    style={{
                      animationDelay: `${Math.min(index, 8) * 40}ms`,
                    }}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                            {req.code}
                          </span>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ${requirementStatusStyles[req.status]}`}
                          >
                            {requirementStatusLabel[req.status]}
                          </span>
                          {hasPrompts ? (
                            <span className="rounded-md bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)] ring-1 ring-[var(--accent)]/30">
                              Spec·Test·Código·MCP
                            </span>
                          ) : null}
                        </div>
                        <h3 className="text-base font-medium leading-snug text-white">
                          {req.title}
                        </h3>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-white/5 hover:text-white"
                          onClick={() => openEdit(req)}
                          aria-label="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-white/5 hover:text-rose-300"
                          onClick={() => {
                            if (confirm(`Excluir ${req.code}?`)) {
                              deleteRequirement(req.id);
                            }
                          }}
                          aria-label="Excluir requisito"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {req.description ? (
                      <p className="mb-3 line-clamp-4 flex-1 text-sm leading-relaxed text-[var(--muted)]">
                        {req.description}
                      </p>
                    ) : (
                      <div className="mb-3 flex-1" />
                    )}

                    <div className="mb-3 flex flex-wrap gap-1.5">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${priorityStyles[req.priority]}`}
                      >
                        {priorityLabel[req.priority]}
                      </span>
                      <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-[var(--muted)] ring-1 ring-white/10">
                        {linkedCount(req.id)} card(s)
                      </span>
                      {owner ? (
                        <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-white/80 ring-1 ring-white/10">
                          {owner.name.split(" ")[0]}
                        </span>
                      ) : null}
                      {req.dueDate ? (
                        <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-[var(--muted)] ring-1 ring-white/10">
                          {req.dueDate.split("-").reverse().join("/")}
                        </span>
                      ) : null}
                    </div>

                    <label className="block text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                      Status
                      <select
                        className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[var(--ink)] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
                        value={req.status}
                        onChange={(e) =>
                          updateRequirement(req.id, {
                            status: e.target.value as RequirementStatus,
                          })
                        }
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {requirementStatusLabel[s]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPromptsReqId(req.id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2.5 text-xs font-medium text-white transition hover:bg-[var(--accent)]/20"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
                        Prompts
                      </button>
                      <button
                        type="button"
                        onClick={() => createCardFromRequirement(req)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] px-3 py-2.5 text-xs font-medium text-white transition hover:border-[var(--accent)]/50 hover:bg-white/5"
                      >
                        <LayoutList className="h-3.5 w-3.5 text-[var(--accent)]" />
                        Criar card
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {editorOpen
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={
                editorMode === "create" ? "Novo requisito" : "Editar requisito"
              }
              className="fixed inset-0 z-[220] flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col bg-[var(--ink-2)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
            >
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] bg-black/40 px-3 py-2.5 backdrop-blur-md sm:px-6 sm:py-4 md:px-8 lg:px-10">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    {editorMode === "edit" && editingReq
                      ? editingReq.code
                      : board?.title ?? "Board"}
                  </p>
                  <h3 className="truncate font-[family-name:var(--font-display)] text-lg tracking-tight text-white sm:text-2xl md:text-3xl">
                    {editorMode === "create"
                      ? "Novo requisito"
                      : "Editar requisito"}
                  </h3>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-xl border border-[var(--line)] p-2.5 text-[var(--muted)] hover:bg-white/5 hover:text-white touch-manipulation"
                  onClick={closeEditor}
                  aria-label="Fechar editor"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="board-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
                <div className="flex min-h-full w-full flex-1 flex-col gap-4 px-3 py-4 sm:gap-5 sm:px-6 sm:py-6 md:px-8 lg:px-10 lg:py-8">
                  <label className="block shrink-0 text-xs text-[var(--muted)] sm:text-sm">
                    Título
                    <input
                      ref={titleRef}
                      className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-[var(--ink)] px-3.5 py-3 text-base text-white outline-none focus:border-[var(--accent)] sm:px-5 sm:py-4 sm:text-xl md:text-2xl"
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      placeholder="Ex.: Autenticação institucional"
                    />
                  </label>

                  <label className="flex min-h-0 flex-1 flex-col text-xs text-[var(--muted)] sm:text-sm">
                    Descrição / escopo
                    <textarea
                      className="mt-1.5 min-h-[42dvh] w-full flex-1 resize-y rounded-2xl border border-[var(--line)] bg-[var(--ink)] px-3.5 py-3 text-sm leading-relaxed text-white outline-none focus:border-[var(--accent)] sm:min-h-[48dvh] sm:px-5 sm:py-4 sm:text-base md:min-h-[52dvh] md:text-lg md:leading-8"
                      value={draftDescription}
                      onChange={(e) => setDraftDescription(e.target.value)}
                      placeholder="Escopo, regra de negócio, critérios de aceite, dependências…"
                    />
                  </label>

                  <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="block text-xs text-[var(--muted)] sm:text-sm">
                      Status
                      <select
                        className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-[var(--ink)] px-3 py-3 text-sm text-white outline-none focus:border-[var(--accent)] sm:px-4 sm:text-base"
                        value={draftStatus}
                        onChange={(e) =>
                          setDraftStatus(e.target.value as RequirementStatus)
                        }
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {requirementStatusLabel[s]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-xs text-[var(--muted)] sm:text-sm">
                      Prioridade
                      <select
                        className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-[var(--ink)] px-3 py-3 text-sm text-white outline-none focus:border-[var(--accent)] sm:px-4 sm:text-base"
                        value={draftPriority}
                        onChange={(e) =>
                          setDraftPriority(
                            e.target.value as "low" | "medium" | "high",
                          )
                        }
                      >
                        <option value="high">Alta</option>
                        <option value="medium">Média</option>
                        <option value="low">Baixa</option>
                      </select>
                    </label>

                    <label className="block text-xs text-[var(--muted)] sm:text-sm">
                      Responsável
                      <select
                        className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-[var(--ink)] px-3 py-3 text-sm text-white outline-none focus:border-[var(--accent)] sm:px-4 sm:text-base"
                        value={draftOwnerId}
                        onChange={(e) => setDraftOwnerId(e.target.value)}
                      >
                        <option value="">Sem responsável</option>
                        {boardMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-xs text-[var(--muted)] sm:text-sm">
                      Prazo
                      <input
                        type="date"
                        className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-[var(--ink)] px-3 py-3 text-sm text-white outline-none focus:border-[var(--accent)] sm:px-4 sm:text-base"
                        value={draftDueDate}
                        onChange={(e) => setDraftDueDate(e.target.value)}
                      />
                    </label>
                  </div>

                  <p className="shrink-0 rounded-2xl border border-[var(--line)] bg-black/20 px-4 py-3 text-xs text-[var(--muted)] sm:text-sm">
                    Ao salvar, este requisito gera/atualiza prompts de
                    implementação <strong className="text-white/80">spec-based</strong>,{" "}
                    <strong className="text-white/80">testes</strong>, payload{" "}
                    <strong className="text-white/80">MCP</strong> e objetivo{" "}
                    <strong className="text-white/80">A2A</strong>.
                  </p>
                </div>
              </div>

              <footer className="flex shrink-0 border-t border-[var(--line)] bg-black/40 px-3 py-2.5 backdrop-blur-md sm:px-6 sm:py-4 md:px-8 lg:px-10">
                <div className="flex w-full gap-2 sm:gap-3">
                  <button
                    type="button"
                    className="min-h-12 flex-1 touch-manipulation rounded-xl border border-[var(--line)] px-3 py-3 text-sm text-[var(--muted)] hover:text-white sm:rounded-2xl sm:text-base"
                    onClick={closeEditor}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="min-h-12 flex-[1.4] touch-manipulation rounded-xl bg-[var(--accent)] px-3 py-3 text-sm font-semibold text-[var(--accent-on)] disabled:opacity-50 sm:flex-[1.6] sm:rounded-2xl sm:text-base"
                    onClick={saveEditor}
                    disabled={!draftTitle.trim()}
                  >
                    {editorMode === "create" ? "Cadastrar" : "Salvar"}
                  </button>
                </div>
              </footer>
            </div>,
            document.body,
          )
        : null}

      {promptsReq ? (
        <PromptViewer
          req={promptsReq}
          onClose={() => setPromptsReqId(null)}
          onRegenerate={() => regenerateRequirementPrompts(promptsReq.id)}
        />
      ) : null}
    </div>,
    document.body,
  );
}
