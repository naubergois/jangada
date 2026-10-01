import { describe, expect, it } from "vitest";
import type { Board } from "./types";
import {
  absorbBoardEvolution,
  buildEvolutionLines,
  parseEvolutionPoints,
} from "./board-evolution";

const REF = new Date(Date.UTC(2026, 9, 1));

function board(over: Partial<Board> & Pick<Board, "id" | "title">): Board {
  return {
    description: "",
    listIds: [],
    memberIds: [],
    teamId: null,
    level: "project",
    parentBoardId: "asesi",
    backgroundId: "trello",
    designId: "classic",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

describe("parseEvolutionPoints", () => {
  it("reads the date before the percent and the earlier comparison", () => {
    expect(
      parseEvolutionPoints(
        "Andamento operacional ASESI (28/08): 48%  ·  21/08: 40%",
        REF,
      ),
    ).toEqual([
      { date: "2026-08-21", pct: 40 },
      { date: "2026-08-28", pct: 48 },
    ]);
  });

  it("reads a percent written before the date in parentheses", () => {
    expect(parseEvolutionPoints("Média 57,6% (09/09). Sem número novo.", REF)).toEqual([
      { date: "2026-09-09", pct: 57.6 },
    ]);
  });

  it("does not attach the team average to the previous date inside the same sentence", () => {
    expect(
      parseEvolutionPoints(
        "Andamento operacional ASESI (28/08, noite): média das 9 metas 40,9% (21/08: 32%).",
        REF,
      ),
    ).toEqual([
      { date: "2026-08-21", pct: 32 },
      { date: "2026-08-28", pct: 40.9 },
    ]);
  });

  it("keeps a november date in the previous year when it is still ahead of the reference", () => {
    expect(parseEvolutionPoints("15/11: 20%", REF)).toEqual([
      { date: "2025-11-15", pct: 20 },
    ]);
  });

  it("ignores a ratio that is not a percent", () => {
    expect(parseEvolutionPoints("Servidores 15/16 (22/09).", REF)).toEqual([]);
  });
});

describe("absorbBoardEvolution", () => {
  it("keeps an older point when the new summary only mentions today", () => {
    const kept = absorbBoardEvolution(
      [{ date: "2026-08-21", pct: 40 }],
      "Farol — 29/09\n\nAndamento operacional ASESI (29/09): 38%.",
      REF,
    );
    expect(kept).toEqual([
      { date: "2026-08-21", pct: 40 },
      { date: "2026-09-29", pct: 38 },
    ]);
  });
});

describe("buildEvolutionLines", () => {
  it("draws the open board and each project under it", () => {
    const lines = buildEvolutionLines(
      "asesi",
      {
        asesi: board({
          id: "asesi",
          title: "ASESI",
          level: "team",
          parentBoardId: "cge",
          executiveSummary: "Média 41% (28/08). (21/08: 32%).",
        }),
        "proj-farol": board({
          id: "proj-farol",
          title: "Farol",
          executiveSummary: "Andamento operacional ASESI (28/08): 30%  ·  21/08: 30%",
        }),
        "proj-portal": board({
          id: "proj-portal",
          title: "Portal",
          executiveSummary: "Sem retorno da validação.",
        }),
      },
      REF,
    );
    expect(lines.map((line) => line.title)).toEqual(["ASESI", "Farol", "Portal"]);
    expect(lines[0].points.map((point) => point.pct)).toEqual([32, 41]);
    expect(lines[1].points).toHaveLength(2);
    expect(lines[2].points).toEqual([]);
  });
});
