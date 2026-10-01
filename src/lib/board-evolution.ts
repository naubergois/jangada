import { getDescendantBoards } from "./board-hierarchy";
import { calendarDayKey } from "./calendar-report";
import type { Board, Card, KanbanActivity, List, TeamMember } from "./types";
import { activityKindLabel } from "./utils";
import {
  absorbBoardEvolution,
  evolutionDateIso,
  mergeEvolutionPoints,
  parseEvolutionPoints,
} from "./board-evolution-parse.mjs";

export type BoardEvolutionPoint = {
  /** YYYY-MM-DD */
  date: string;
  pct: number;
};

export type EvolutionLine = {
  boardId: string;
  title: string;
  points: BoardEvolutionPoint[];
};

export { absorbBoardEvolution, mergeEvolutionPoints, parseEvolutionPoints };

export function pointsForBoard(
  board: Pick<Board, "executiveSummary" | "objectives" | "description" | "evolution">,
  reference = new Date(),
): BoardEvolutionPoint[] {
  const text = [board.executiveSummary, board.objectives, board.description]
    .filter(Boolean)
    .join("\n");
  return mergeEvolutionPoints(
    board.evolution,
    parseEvolutionPoints(text, reference),
  ) as BoardEvolutionPoint[];
}

/** Uma linha por board: o aberto e, se houver, cada projeto abaixo dele. */
export function buildEvolutionLines(
  boardId: string,
  boards: Record<string, Board>,
  reference = new Date(),
): EvolutionLine[] {
  const board = boards[boardId];
  if (!board) return [];
  const projects = getDescendantBoards(boardId, boards).filter(
    (child) => child.level === "project",
  );
  const targets = projects.length > 0 ? [board, ...projects] : [board];
  return targets.map((item) => ({
    boardId: item.id,
    title: item.title,
    points: pointsForBoard(item, reference),
  }));
}

export type EvolutionDayComment = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  boardId: string;
  boardTitle: string;
  cardTitle: string;
  author: string;
  body: string;
  kind: "comment" | "note" | "update" | "summary";
};

function datedIso(day: string, month: string, year: number): string | null {
  const d = Number(day);
  const m = Number(month);
  if (!Number.isInteger(d) || !Number.isInteger(m) || m < 1 || m > 12 || d < 1 || d > 31) {
    return null;
  }
  const dt = new Date(Date.UTC(year, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function textParagraphs(text: string): string[] {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Datas dd/mm ou dd/mm/aaaa citadas no texto. */
export function datesInText(text: string, reference = new Date()): string[] {
  const found = new Set<string>();
  const pattern = /(?<!\d)(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?!\d|\/)/g;
  for (const match of String(text || "").matchAll(pattern)) {
    const date = match[3]
      ? datedIso(match[1], match[2], Number(match[3]))
      : evolutionDateIso(match[1], match[2], reference);
    if (date) found.add(date);
  }
  return [...found];
}

function mentionsDate(text: string, iso: string, reference: Date): boolean {
  return datesInText(text, reference).includes(iso);
}

/** Data do resumo, no começo do texto: "Farol — 28/09" ou "Andamento (28/08): 25%". */
export function summaryUpdateDate(text: string, reference = new Date()): string | null {
  const head = String(text || "").slice(0, 180);
  const full = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(head);
  if (full) return datedIso(full[1], full[2], Number(full[3]));
  const short = /(\d{1,2})\/(\d{1,2})/.exec(head);
  if (!short) return null;
  return evolutionDateIso(short[1], short[2], reference);
}

/** Boards que entram na evolução: o aberto e cada projeto abaixo. */
export function evolutionBoardIds(
  boardId: string,
  boards: Record<string, Board>,
): string[] {
  return buildEvolutionLines(boardId, boards).map((line) => line.boardId);
}

/** Comentário automático de origem, sem mudança do card. */
function isSourceCitation(body: string) {
  return /^fonte\s*:/i.test(body) && /trello\.com/i.test(body);
}

const CARD_CHANGE_LABEL: Partial<Record<KanbanActivity["kind"], string>> = {
  card_create: "Criou o card",
  card_update: "Atualizou o card",
  card_move: "Moveu o card",
  card_delete: "Excluiu o card",
  card_archive: "Arquivou o card",
};

/** Comentários, observações e mudanças de card do dia. */
export function collectEvolutionDayComments(input: {
  boardId: string;
  boards: Record<string, Board>;
  lists: Record<string, List>;
  cards: Record<string, Card>;
  members: Record<string, Pick<TeamMember, "name">>;
  activities?: Record<string, KanbanActivity>;
  reference?: Date;
}): EvolutionDayComment[] {
  const ids = new Set(evolutionBoardIds(input.boardId, input.boards));
  const reference = input.reference ?? new Date();
  const items: EvolutionDayComment[] = [];

  for (const id of ids) {
    const board = input.boards[id];
    if (!board) continue;
    const summary = String(board.executiveSummary || "").trim();
    const summaryParts = textParagraphs(summary);
    const otherParts = [
      ...textParagraphs(board.objectives || ""),
      ...textParagraphs(board.description || ""),
    ];
    const chunks = [...summaryParts, ...otherParts];
    const header = summary ? summaryUpdateDate(summary, reference) : null;
    const dates = new Set<string>();
    if (header) dates.add(header);
    for (const point of pointsForBoard(board, reference)) dates.add(point.date);
    for (const chunk of chunks) {
      for (const date of datesInText(chunk, reference)) dates.add(date);
    }
    const seen = new Set<string>();
    for (const date of dates) {
      const bodies: string[] = [];
      if (header === date && summary) {
        bodies.push(summary);
      } else {
        for (const chunk of summaryParts) {
          if (mentionsDate(chunk, date, reference)) bodies.push(chunk);
        }
      }
      for (const chunk of otherParts) {
        if (mentionsDate(chunk, date, reference)) bodies.push(chunk);
      }
      bodies.forEach((body, index) => {
        const key = `${date}\0${body}`;
        if (seen.has(key)) return;
        seen.add(key);
        items.push({
          id: `summary:${id}:${date}:${index}`,
          date,
          boardId: id,
          boardTitle: board.title || "Board",
          cardTitle: "",
          author: "Texto",
          body,
          kind: "summary",
        });
      });
    }
  }

  for (const card of Object.values(input.cards)) {
    const list = input.lists[card.listId];
    if (!list || !ids.has(list.boardId)) continue;
    const boardTitle = input.boards[list.boardId]?.title || "Board";

    for (const comment of card.comments || []) {
      const body = String(comment.body || "").trim();
      if (!body || isSourceCitation(body) || !comment.createdAt) continue;
      const created = new Date(comment.createdAt);
      if (Number.isNaN(created.getTime())) continue;
      items.push({
        id: `comment:${comment.id}`,
        date: calendarDayKey(created),
        boardId: list.boardId,
        boardTitle,
        cardTitle: card.title,
        author: input.members[comment.authorId || ""]?.name || "Alguém",
        body,
        kind: "comment",
      });
    }

    for (const note of card.dailyNotes || []) {
      const body = String(note.body || "").trim();
      if (!body || !/^\d{4}-\d{2}-\d{2}$/.test(note.date || "")) continue;
      items.push({
        id: `note:${note.id}`,
        date: note.date,
        boardId: list.boardId,
        boardTitle,
        cardTitle: card.title,
        author: input.members[note.authorId || ""]?.name || "Alguém",
        body,
        kind: "note",
      });
    }
  }

  for (const activity of Object.values(input.activities || {})) {
    if (!ids.has(activity.boardId) || activity.kind === "card_comment") continue;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(activity.date || "")
      ? activity.date
      : activity.createdAt
        ? calendarDayKey(new Date(activity.createdAt))
        : "";
    if (!date) continue;
    const note = String(activity.note || "").trim();
    if (!note && !CARD_CHANGE_LABEL[activity.kind]) continue;
    const cardTitle = activity.cardId
      ? input.cards[activity.cardId]?.title || ""
      : "";
    items.push({
      id: `activity:${activity.id}`,
      date,
      boardId: activity.boardId,
      boardTitle: input.boards[activity.boardId]?.title || "Board",
      cardTitle,
      author: input.members[activity.memberId]?.name || "Alguém",
      body: note || CARD_CHANGE_LABEL[activity.kind] || activityKindLabel[activity.kind],
      kind: "update",
    });
  }

  const kindOrder = { summary: 0, note: 1, comment: 2, update: 3 };
  return items.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      kindOrder[a.kind] - kindOrder[b.kind] ||
      a.boardTitle.localeCompare(b.boardTitle, "pt-BR") ||
      a.cardTitle.localeCompare(b.cardTitle, "pt-BR") ||
      a.id.localeCompare(b.id),
  );
}

export function formatEvolutionDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return `${match[3]}/${match[2]}`;
}

export function formatEvolutionPct(pct: number): string {
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1).replace(".", ",");
}
