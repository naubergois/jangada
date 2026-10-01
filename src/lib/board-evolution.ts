import { getDescendantBoards } from "./board-hierarchy";
import { calendarDayKey } from "./calendar-report";
import type { Board, Card, List, TeamMember } from "./types";
import {
  absorbBoardEvolution,
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
  kind: "comment" | "note";
};

/** Boards que entram na evolução: o aberto e cada projeto abaixo. */
export function evolutionBoardIds(
  boardId: string,
  boards: Record<string, Board>,
): string[] {
  return buildEvolutionLines(boardId, boards).map((line) => line.boardId);
}

/** Comentários e observações do dia, nos boards da linha do tempo. */
export function collectEvolutionDayComments(input: {
  boardId: string;
  boards: Record<string, Board>;
  lists: Record<string, List>;
  cards: Record<string, Card>;
  members: Record<string, Pick<TeamMember, "name">>;
}): EvolutionDayComment[] {
  const ids = new Set(evolutionBoardIds(input.boardId, input.boards));
  const items: EvolutionDayComment[] = [];

  for (const card of Object.values(input.cards)) {
    const list = input.lists[card.listId];
    if (!list || !ids.has(list.boardId)) continue;
    const boardTitle = input.boards[list.boardId]?.title || "Board";

    for (const comment of card.comments || []) {
      const body = String(comment.body || "").trim();
      if (!body || !comment.createdAt) continue;
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

  return items.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
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
