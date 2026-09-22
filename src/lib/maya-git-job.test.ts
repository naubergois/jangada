import { describe, expect, it } from "vitest";
import {
  authenticatedCloneUrl,
  isCloneableGitUrl,
  redactGitText,
  shouldRefreshClone,
} from "./git-clone";
import { analyzeClonedSource } from "./source-risks";
import {
  cloneBoardPieces,
  ensureMayaRisksList,
  isMayaRisksList,
  syncMayaRiskCards,
} from "./maya-risk-column";
import { MAYA_RISKS_LIST_KEY } from "./constants";
import type { Board, Card, List } from "./types";

describe("weekly git clone helpers", () => {
  it("allows gitlab CGE and blocks metadata hosts", () => {
    expect(isCloneableGitUrl("http://git.cge.local/g_asesi/jangada.git")).toBe(true);
    expect(isCloneableGitUrl("https://github.com/org/repo.git")).toBe(true);
    expect(isCloneableGitUrl("http://169.254.169.254/latest")).toBe(false);
    expect(isCloneableGitUrl("javascript:alert(1)")).toBe(false);
  });

  it("injects oauth2 token without logging it", () => {
    const url = authenticatedCloneUrl("http://git.cge.local/g_asesi/jangada.git", "secret-token");
    expect(url).toContain("oauth2:secret-token@");
    expect(redactGitText(url)).not.toContain("secret-token");
  });

  it("refreshes clone after a week", () => {
    const now = Date.parse("2026-08-25T12:00:00.000Z");
    expect(shouldRefreshClone(null, now)).toBe(true);
    expect(shouldRefreshClone("2026-08-24T12:00:00.000Z", now)).toBe(false);
    expect(shouldRefreshClone("2026-08-17T11:00:00.000Z", now)).toBe(true);
  });
});

describe("cloned source risks", () => {
  it("flags committed .env and secret-like text", () => {
    const risks = analyzeClonedSource({
      url: "http://git.cge.local/g_asesi/app.git",
      files: [".env", "src/a.ts", "README.md"],
      haystack: "const token = 'supersecretvalue'; AKIAIOSFODNN7EXAMPLE leftover",
    });
    expect(risks.some((r) => r.id.startsWith("src-env"))).toBe(true);
    expect(risks.some((r) => r.id.startsWith("src-secret"))).toBe(true);
  });

  it("flags missing tests and CI", () => {
    const risks = analyzeClonedSource({
      url: "http://git.cge.local/g_asesi/app.git",
      files: [
        "src/a.ts",
        "src/b.ts",
        "src/c.ts",
        "src/d.ts",
        "src/e.ts",
        "src/f.ts",
        "src/g.ts",
        "src/h.ts",
        "package.json",
      ],
      haystack: "todo implement later todo todo todo todo todo todo todo todo todo todo todo",
    });
    expect(risks.some((r) => r.id.startsWith("src-tests"))).toBe(true);
    expect(risks.some((r) => r.id.startsWith("src-ci"))).toBe(true);
  });
});

describe("Maya risks column", () => {
  it("creates the system list and upserts risk cards", () => {
    const board: Board = {
      id: "b1",
      title: "ASESI",
      description: "",
      listIds: ["backlog"],
      memberIds: [],
      teamId: null,
      level: "project",
      parentBoardId: null,
      backgroundId: "ceara",
      designId: "classic",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const lists: Record<string, List> = {
      backlog: { id: "backlog", boardId: "b1", title: "Backlog", cardIds: [] },
    };
    const cards: Record<string, Card> = {};
    const pieces = cloneBoardPieces(board, lists, cards);
    ensureMayaRisksList(pieces);
    expect(pieces.board.listIds).toHaveLength(2);
    const listId = pieces.board.listIds[1];
    expect(isMayaRisksList(pieces.lists[listId])).toBe(true);
    expect(pieces.lists[listId].systemKey).toBe(MAYA_RISKS_LIST_KEY);

    syncMayaRiskCards(pieces, {
      analyzedAt: "2026-08-25T00:00:00.000Z",
      risks: [
        {
          id: "overdue-c1",
          title: "Atraso: Deploy",
          severity: "high",
          reason: "Prazo vencido",
          source: "board",
        },
      ],
      git: [],
    });
    const mayaCards = Object.values(pieces.cards).filter((c) => c.origin === "maya");
    expect(mayaCards).toHaveLength(1);
    expect(mayaCards[0].originKey).toBe("overdue-c1");
    expect(mayaCards[0].coverColor).toBe("red");

    syncMayaRiskCards(pieces, {
      analyzedAt: "2026-08-25T01:00:00.000Z",
      risks: [
        {
          id: "overdue-c1",
          title: "Atraso: Deploy homolog",
          severity: "high",
          reason: "Ainda atrasado",
          source: "board",
        },
      ],
      git: [],
    });
    expect(Object.values(pieces.cards).filter((c) => c.origin === "maya")).toHaveLength(1);
    expect(Object.values(pieces.cards)[0].title).toBe("Atraso: Deploy homolog");
  });
});
