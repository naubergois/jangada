import { describe, expect, it } from "vitest";
import type { Board } from "./types";
import {
  boardCountsTowardMetaAverage,
  extractGoalAttainment,
  formatGoalPct,
  parseProjectGoalPct,
  parseTeamGoalPct,
} from "./goal-attainment";

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

describe("parse goal percent from ASESI texts", () => {
  it("reads the team average of the 9 SIGE metas", () => {
    expect(
      parseTeamGoalPct({
        executiveSummary:
          "Andamento operacional ASESI (28/08, noite): média das 9 metas 40,9% (21/08: 32%).",
        description: "",
        objectives: "",
      }),
    ).toBe(40.9);
  });

  it("reads the operational percent of a project board", () => {
    expect(
      parseProjectGoalPct({
        executiveSummary: "Andamento operacional ASESI (28/08): 48%  ·  21/08: 40%",
        description: "",
        objectives: "Percentual operacional ASESI (28/08): 48%. Produto SIGE: 03 monitoramentos.",
      }),
    ).toBe(48);
  });

  it("keeps internal tools out of the SIGE average", () => {
    expect(
      boardCountsTowardMetaAverage({
        executiveSummary:
          "Andamento operacional ASESI (28/08): 75%\nFerramenta interna da ASESI — não entra na média das 9 metas SIGE.",
        description: "",
        objectives: "",
      }),
    ).toBe(false);
  });
});

describe("extractGoalAttainment", () => {
  const asesi = board({
    id: "asesi",
    title: "ASESI",
    level: "team",
    parentBoardId: "cge",
    executiveSummary:
      "Andamento operacional ASESI (28/08, noite): média das 9 metas 41% (21/08: 32%). Não extraído do SIGE.",
  });

  const farol = board({
    id: "proj-farol",
    title: "Farol",
    executiveSummary: "Andamento operacional ASESI (28/08): 30%  ·  21/08: 30%",
  });
  const mandacaru = board({
    id: "proj-mandacaru",
    title: "Mandacaru",
    executiveSummary: "Andamento operacional ASESI (28/08): 48%  ·  21/08: 40%",
  });
  const jangada = board({
    id: "proj-jangada",
    title: "Jangada",
    executiveSummary:
      "Andamento operacional ASESI (28/08): 75%\nFerramenta interna da ASESI — não entra na média das 9 metas SIGE.",
  });

  it("shows the ASESI cover percent from the team summary and lists SIGE metas", () => {
    const attainment = extractGoalAttainment("asesi", {
      asesi,
      "proj-farol": farol,
      "proj-mandacaru": mandacaru,
      "proj-jangada": jangada,
    });
    expect(attainment?.pct).toBe(41);
    expect(attainment?.source).toBe("summary");
    expect(attainment?.counted).toBe(2);
    expect(attainment?.asOf).toBe("28/08");
    expect(attainment?.previousPct).toBe(32);
    expect(attainment?.items.map((i) => i.title)).toEqual([
      "Farol",
      "Jangada",
      "Mandacaru",
    ]);
  });

  it("averages child SIGE metas when the team summary has no média", () => {
    const attainment = extractGoalAttainment("asesi", {
      asesi: { ...asesi, executiveSummary: "Carteira do time." },
      "proj-farol": farol,
      "proj-mandacaru": mandacaru,
      "proj-jangada": jangada,
    });
    expect(attainment?.pct).toBe(39);
    expect(attainment?.source).toBe("children");
    expect(attainment?.counted).toBe(2);
  });

  it("returns null when there is no percent to show", () => {
    expect(
      extractGoalAttainment("asesi", {
        asesi: { ...asesi, executiveSummary: "Carteira do time." },
      }),
    ).toBeNull();
  });
});

describe("formatGoalPct", () => {
  it("uses comma for one decimal", () => {
    expect(formatGoalPct(40.9)).toBe("40,9");
    expect(formatGoalPct(41)).toBe("41");
  });
});
