import { describe, expect, it } from "vitest";
import { calendarDayKey } from "./calendar-report";
import type { Board, Card, KanbanActivity, List } from "./types";
import {
  absorbBoardEvolution,
  buildEvolutionLines,
  collectEvolutionDayComments,
  parseEvolutionPoints,
} from "./board-evolution";

const REF = new Date(Date.UTC(2026, 9, 1));

function card(over: Partial<Card> & Pick<Card, "id" | "listId" | "title">): Card {
  return {
    description: "",
    labels: [],
    dueDate: null,
    priority: null,
    assigneeId: null,
    requirementId: null,
    acceptanceCriteria: "",
    checklist: [],
    comments: [],
    dailyNotes: [],
    archived: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

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

describe("collectEvolutionDayComments", () => {
  it("groups card comments and daily notes by the day they belong to", () => {
    const commentAt = new Date(2026, 7, 21, 10, 30, 0).toISOString();
    const lists: Record<string, List> = {
      lista: { id: "lista", boardId: "proj-farol", title: "Fazendo", cardIds: ["c1"] },
      outro: { id: "outro", boardId: "fora", title: "Fazendo", cardIds: ["c2"] },
    };
    const cards = {
      c1: card({
        id: "c1",
        listId: "lista",
        title: "Validar Farol",
        comments: [
          { id: "k1", authorId: "ana", body: "  Validado na COAUD.  ", createdAt: commentAt },
          { id: "vazio", authorId: "ana", body: "   ", createdAt: commentAt },
        ],
        dailyNotes: [
          {
            id: "n1",
            date: "2026-08-28",
            body: "Charles começou a correção.",
            authorId: "charles",
            createdAt: commentAt,
            updatedAt: commentAt,
          },
        ],
      }),
      c2: card({
        id: "c2",
        listId: "outro",
        title: "Fora do quadro",
        comments: [
          { id: "k2", authorId: "ana", body: "Não entra.", createdAt: commentAt },
        ],
      }),
    };
    const items = collectEvolutionDayComments({
      boardId: "asesi",
      boards: {
        asesi: board({
          id: "asesi",
          title: "ASESI",
          level: "team",
          parentBoardId: "cge",
        }),
        "proj-farol": board({ id: "proj-farol", title: "Farol" }),
      },
      lists,
      cards,
      members: {
        ana: { name: "Ana" },
        charles: { name: "Charles" },
      },
    });
    expect(items).toEqual([
      {
        id: "note:n1",
        date: "2026-08-28",
        boardId: "proj-farol",
        boardTitle: "Farol",
        cardTitle: "Validar Farol",
        author: "Charles",
        body: "Charles começou a correção.",
        kind: "note",
      },
      {
        id: "comment:k1",
        date: calendarDayKey(new Date(commentAt)),
        boardId: "proj-farol",
        boardTitle: "Farol",
        cardTitle: "Validar Farol",
        author: "Ana",
        body: "Validado na COAUD.",
        kind: "comment",
      },
    ]);
  });

  it("includes a board update from that day and skips a duplicate comment activity", () => {
    const lists: Record<string, List> = {
      lista: { id: "lista", boardId: "proj-farol", title: "Fazendo", cardIds: ["c1"] },
    };
    const activities: Record<string, KanbanActivity> = {
      a1: {
        id: "a1",
        boardId: "proj-farol",
        memberId: "charles",
        date: "2026-08-28",
        kind: "card_update",
        cardId: "c1",
        note: "Liberou versão parcial.",
        createdAt: "2026-08-28T11:00:00.000Z",
      },
      a2: {
        id: "a2",
        boardId: "proj-farol",
        memberId: "ana",
        date: "2026-08-28",
        kind: "card_comment",
        cardId: "c1",
        note: "Já está no comentário.",
        createdAt: "2026-08-28T11:00:00.000Z",
      },
    };
    const items = collectEvolutionDayComments({
      boardId: "proj-farol",
      boards: {
        "proj-farol": board({ id: "proj-farol", title: "Farol" }),
      },
      lists,
      cards: {
        c1: card({ id: "c1", listId: "lista", title: "Validar Farol" }),
      },
      members: { charles: { name: "Charles" } },
      activities,
    });
    expect(items.map((item) => item.id)).toEqual(["activity:a1"]);
    expect(items[0].body).toBe("Liberou versão parcial.");
    expect(items[0].kind).toBe("update");
  });

  it("shows the board summary and a card move even when the move has no note", () => {
    const items = collectEvolutionDayComments({
      boardId: "proj-farol",
      boards: {
        "proj-farol": board({
          id: "proj-farol",
          title: "Farol",
          executiveSummary: "Farol — 28/09 (áudios)\n\nAna validou o diagnóstico.",
        }),
      },
      lists: {},
      cards: {},
      members: {},
      activities: {
        a1: {
          id: "a1",
          boardId: "proj-farol",
          memberId: "ana",
          date: "2026-09-28",
          kind: "card_move",
          note: "",
          createdAt: "2026-09-28T12:00:00.000Z",
        },
      },
      reference: new Date(2026, 9, 1),
    });
    expect(items.map((item) => item.kind)).toEqual(["summary", "update"]);
    expect(items[1]).toMatchObject({
      date: "2026-09-28",
      cardTitle: "",
      body: "Moveu o card",
      kind: "update",
    });
  });

  it("hides a Trello source comment and keeps the card change", () => {
    const lists: Record<string, List> = {
      lista: { id: "lista", boardId: "proj-farol", title: "Fazendo", cardIds: ["c1"] },
    };
    const items = collectEvolutionDayComments({
      boardId: "proj-farol",
      boards: {
        "proj-farol": board({ id: "proj-farol", title: "Farol" }),
      },
      lists,
      cards: {
        c1: card({
          id: "c1",
          listId: "lista",
          title: "Validar Farol",
          comments: [
            {
              id: "fonte",
              authorId: "ana",
              body: "Fonte: Farol. Trello: https://trello.com/b/Rl7Cb3rj/asesi.",
              createdAt: "2026-08-26T02:16:55.267Z",
            },
          ],
        }),
      },
      members: { ana: { name: "Ana" } },
      activities: {
        mov: {
          id: "mov",
          boardId: "proj-farol",
          memberId: "ana",
          date: "2026-08-26",
          kind: "card_move",
          cardId: "c1",
          createdAt: "2026-08-26T15:00:00.000Z",
        },
      },
    });
    expect(items.map((item) => item.id)).toEqual(["activity:mov"]);
    expect(items[0].cardTitle).toBe("Validar Farol");
  });

  it("shows the board text on each evolution day it mentions", () => {
    const items = collectEvolutionDayComments({
      boardId: "proj-farol",
      boards: {
        "proj-farol": board({
          id: "proj-farol",
          title: "Farol",
          executiveSummary: "Farol — 28/09 (áudios)\n\nAna validou o diagnóstico.",
          description: "Andamento operacional (28/08): 30%. Farol — validação COAUD.",
        }),
      },
      lists: {},
      cards: {},
      members: {},
      reference: new Date(2026, 9, 1),
    });
    const byDate = Object.fromEntries(items.map((item) => [item.date, item.body]));
    expect(byDate["2026-09-28"]).toContain("Ana validou o diagnóstico.");
    expect(byDate["2026-08-28"]).toContain("validação COAUD");
  });
});
