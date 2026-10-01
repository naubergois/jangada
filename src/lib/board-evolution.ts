import { getDescendantBoards } from "./board-hierarchy";
import type { Board } from "./types";
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

export function formatEvolutionDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return `${match[3]}/${match[2]}`;
}

export function formatEvolutionPct(pct: number): string {
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1).replace(".", ",");
}
