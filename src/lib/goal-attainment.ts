import { getDescendantBoards } from "./board-hierarchy";
import type { Board } from "./types";

export type GoalAttainmentItem = {
  boardId: string;
  title: string;
  pct: number;
  countsTowardAverage: boolean;
};

export type GoalAttainment = {
  pct: number;
  source: "summary" | "children" | "self";
  counted: number;
  asOf?: string;
  previousPct?: number;
  previousLabel?: string;
  items: GoalAttainmentItem[];
};

const EXCLUDED_RE = /n[aã]o entra na m[eé]dia(?: das 9 metas)?/i;
const TEAM_AVG_RE =
  /m[eé]dia(?: das 9 metas)?[^\d%]{0,28}(\d+(?:[.,]\d+)?)\s*%/i;
const AS_OF_RE = /andamento operacional(?: asesi)?\s*\((\d{1,2}\/\d{1,2})/i;
const PREV_RE = /(\d{1,2}\/\d{1,2})\s*:\s*(\d+(?:[.,]\d+)?)\s*%/i;
const OPERATIONAL_RES = [
  /andamento operacional(?: asesi)?(?:\s*\([^)]+\))?\s*:?\s*(\d+(?:[.,]\d+)?)\s*%/i,
  /percentual operacional(?: asesi)?(?:\s*\([^)]+\))?\s*:?\s*(\d+(?:[.,]\d+)?)\s*%/i,
  /atingimento(?: das metas)?[^\d%]{0,24}(\d+(?:[.,]\d+)?)\s*%/i,
];

function boardText(board: Pick<Board, "executiveSummary" | "description" | "objectives">) {
  return [board.executiveSummary, board.objectives, board.description]
    .filter(Boolean)
    .join("\n");
}

function parseNumber(raw: string): number {
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : NaN;
}

function clampPct(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

function matchPct(text: string, re: RegExp): number | null {
  const m = text.match(re);
  return m ? clampPct(parseNumber(m[1])) : null;
}

export function boardCountsTowardMetaAverage(
  board: Pick<Board, "executiveSummary" | "description" | "objectives">,
): boolean {
  return !EXCLUDED_RE.test(boardText(board));
}

export function parseTeamGoalPct(
  board: Pick<Board, "executiveSummary" | "description" | "objectives">,
): number | null {
  return matchPct(boardText(board), TEAM_AVG_RE);
}

export function parseProjectGoalPct(
  board: Pick<Board, "executiveSummary" | "description" | "objectives">,
): number | null {
  const text = boardText(board);
  for (const re of OPERATIONAL_RES) {
    const pct = matchPct(text, re);
    if (pct != null) return pct;
  }
  return null;
}

export function parseGoalAsOf(
  board: Pick<Board, "executiveSummary" | "description" | "objectives">,
): string | undefined {
  const m = boardText(board).match(AS_OF_RE);
  return m?.[1];
}

export function parsePreviousGoalPct(
  board: Pick<Board, "executiveSummary" | "description" | "objectives">,
): { pct: number; label: string } | null {
  const m = boardText(board).match(PREV_RE);
  if (!m) return null;
  const pct = clampPct(parseNumber(m[2]));
  if (pct == null) return null;
  return { pct, label: m[1] };
}

export function formatGoalPct(pct: number): string {
  return Number.isInteger(pct)
    ? String(pct)
    : pct.toFixed(1).replace(".", ",");
}

export function goalAttainmentTone(
  pct: number,
): "ok" | "warn" | "danger" {
  if (pct >= 70) return "ok";
  if (pct >= 40) return "warn";
  return "danger";
}

function average(values: number[]): number {
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

export function extractGoalAttainment(
  boardId: string,
  boards: Record<string, Board>,
): GoalAttainment | null {
  const board = boards[boardId];
  if (!board) return null;

  const projects = getDescendantBoards(boardId, boards).filter(
    (child) => child.level === "project",
  );
  const items: GoalAttainmentItem[] = [];
  for (const child of projects) {
    const pct = parseProjectGoalPct(child);
    if (pct == null) continue;
    items.push({
      boardId: child.id,
      title: child.title,
      pct,
      countsTowardAverage: boardCountsTowardMetaAverage(child),
    });
  }

  const countedItems = items.filter((item) => item.countsTowardAverage);
  const childAvg =
    countedItems.length > 0
      ? average(countedItems.map((item) => item.pct))
      : null;

  const teamPct = parseTeamGoalPct(board);
  const selfPct = parseProjectGoalPct(board);
  const previous = parsePreviousGoalPct(board);
  const asOf = parseGoalAsOf(board) ?? projects.map(parseGoalAsOf).find(Boolean);

  let pct: number | null = null;
  let source: GoalAttainment["source"] = "self";
  if (teamPct != null) {
    pct = teamPct;
    source = "summary";
  } else if (childAvg != null) {
    pct = childAvg;
    source = "children";
  } else if (selfPct != null) {
    pct = selfPct;
    source = "self";
  }

  if (pct == null) return null;

  return {
    pct,
    source,
    counted: countedItems.length,
    asOf,
    previousPct: previous?.pct,
    previousLabel: previous?.label,
    items,
  };
}
