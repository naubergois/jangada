import { describe, expect, it } from "vitest";
import type { BoardSnapshot } from "./board-snapshot";
import type { Board, Team, TeamMember } from "./types";
import {
  emailIsOnBoardTeam,
  filterBoardsForEmail,
  filterBoardsForMember,
  filterTeamsForMember,
  memberCanSeeBoard,
  preferredMemberIdForEmail,
  snapshotVisibleToEmail,
  snapshotVisibleViaSharedTeam,
  teamIdsHeldByEmail,
} from "./board-access";

function member(partial: Partial<TeamMember> & Pick<TeamMember, "id" | "email">): TeamMember {
  return {
    name: partial.name || partial.id,
    role: "member",
    color: "teal",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function team(partial: Partial<Team> & Pick<Team, "id" | "memberIds">): Team {
  return {
    name: partial.name || partial.id,
    description: "",
    color: "sky",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function board(partial: Partial<Board> & Pick<Board, "id">): Board {
  return {
    title: partial.title || partial.id,
    description: "",
    listIds: [],
    memberIds: partial.memberIds || [],
    teamId: partial.teamId ?? null,
    level: "project",
    parentBoardId: null,
    backgroundId: "ceara",
    designId: "classic",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function snap(partial: Partial<BoardSnapshot> & { board: Board }): BoardSnapshot {
  return {
    lists: {},
    cards: {},
    members: {},
    teams: {},
    meetings: {},
    managers: {},
    standups: {},
    activities: {},
    requirements: {},
    calendarEvents: {},
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

const farol = team({ id: "team-farol", memberIds: ["ana"] });
const jangada = team({ id: "team-jangada", memberIds: ["bia"] });

describe("memberCanSeeBoard", () => {
  const teams = { "team-farol": farol, "team-jangada": jangada };

  it("shows only boards of the member's team", () => {
    const farolBoard = board({ id: "farol", teamId: "team-farol", memberIds: ["ana"] });
    const jangadaBoard = board({ id: "jangada", teamId: "team-jangada", memberIds: ["bia"] });
    expect(memberCanSeeBoard(farolBoard, "ana", teams)).toBe(true);
    expect(memberCanSeeBoard(jangadaBoard, "ana", teams)).toBe(false);
    expect(filterBoardsForMember([farolBoard, jangadaBoard], "ana", teams).map((b) => b.id)).toEqual(
      ["farol"],
    );
  });

  it("lets admin see every board", () => {
    const farolBoard = board({ id: "farol", teamId: "team-farol" });
    expect(memberCanSeeBoard(farolBoard, "bia", teams, { isAdmin: true })).toBe(true);
  });

  it("uses board members when the board has no team", () => {
    const personal = board({ id: "mine", teamId: null, memberIds: ["ana"] });
    expect(memberCanSeeBoard(personal, "ana", teams)).toBe(true);
    expect(memberCanSeeBoard(personal, "bia", teams)).toBe(false);
  });
});

describe("preferredMemberIdForEmail", () => {
  it("picks the member already on the team, not the login id", () => {
    const members = {
      login: member({ id: "3602de499a49b2f83f5e2d87", email: "charles.marques@cge.ce.gov.br" }),
      board: member({ id: "T6znFkjZPu6qRDGt3xmtC", email: "charles.marques@cge.ce.gov.br" }),
    };
    const boards = {
      asesi: board({
        id: "asesi",
        teamId: "asesi-team",
        memberIds: ["T6znFkjZPu6qRDGt3xmtC"],
      }),
    };
    const teams = {
      "asesi-team": team({ id: "asesi-team", memberIds: ["T6znFkjZPu6qRDGt3xmtC"] }),
    };
    expect(preferredMemberIdForEmail("charles.marques@cge.ce.gov.br", members, boards, teams)).toBe(
      "T6znFkjZPu6qRDGt3xmtC",
    );
  });

  it("still finds the board member when the login id is stored first", () => {
    const charles = "charles.marques@cge.ce.gov.br";
    const members = {
      login: member({ id: "3602de499a49b2f83f5e2d87", email: charles }),
      board: member({ id: "T6znFkjZPu6qRDGt3xmtC", email: charles }),
    };
    const asesi = board({
      id: "asesi",
      teamId: "asesi-team",
      memberIds: ["T6znFkjZPu6qRDGt3xmtC"],
    });
    const teams = {
      "asesi-team": team({ id: "asesi-team", memberIds: ["T6znFkjZPu6qRDGt3xmtC"] }),
    };
    expect(
      filterBoardsForMember([asesi], "3602de499a49b2f83f5e2d87", teams).map((b) => b.id),
    ).toEqual([]);
    expect(filterBoardsForEmail([asesi], charles, members, teams).map((b) => b.id)).toEqual([
      "asesi",
    ]);
  });
});

describe("filterTeamsForMember", () => {
  it("hides teams the person does not belong to", () => {
    expect(filterTeamsForMember([farol, jangada], "ana").map((t) => t.id)).toEqual(["team-farol"]);
    expect(filterTeamsForMember([farol, jangada], "ana", { isAdmin: true })).toHaveLength(2);
  });
});

describe("snapshotVisibleToEmail", () => {
  const snapshot = snap({
    board: board({ id: "farol", teamId: "team-farol", memberIds: ["ana"] }),
    teams: { "team-farol": farol },
    members: {
      ana: member({ id: "ana", email: "ana@cge.ce.gov.br", name: "Ana" }),
      bia: member({ id: "bia", email: "bia@cge.ce.gov.br", name: "Bia" }),
    },
  });

  it("allows the team member and rejects others", () => {
    expect(snapshotVisibleToEmail(snapshot, "ana@cge.ce.gov.br")).toBe(true);
    expect(snapshotVisibleToEmail(snapshot, "bia@cge.ce.gov.br")).toBe(false);
    expect(emailIsOnBoardTeam(snapshot, "ANA@cge.ce.gov.br")).toBe(true);
  });

  it("does not show another team's board unless the person is a member of that board", () => {
    const other = snap({
      board: board({ id: "jangada", teamId: "team-jangada", memberIds: ["bia"] }),
      teams: { "team-jangada": jangada },
      members: {
        ana: member({ id: "ana", email: "ana@cge.ce.gov.br" }),
        bia: member({ id: "bia", email: "bia@cge.ce.gov.br" }),
      },
    });
    expect(snapshotVisibleToEmail(other, "ana@cge.ce.gov.br")).toBe(false);
    expect(snapshotVisibleToEmail(other, "bia@cge.ce.gov.br")).toBe(true);
  });

  it("keeps a direct board invite even when the person is not on the team", () => {
    const invited = snap({
      board: board({ id: "jangada", teamId: "team-jangada", memberIds: ["bia", "ana"] }),
      teams: { "team-jangada": jangada },
      members: {
        ana: member({ id: "ana", email: "ana@cge.ce.gov.br" }),
        bia: member({ id: "bia", email: "bia@cge.ce.gov.br" }),
      },
    });
    expect(snapshotVisibleToEmail(invited, "ana@cge.ce.gov.br")).toBe(true);
  });

  it("does not grant board access to an external card assignee", () => {
    const withExternal = snap({
      board: board({
        id: "farol",
        teamId: "team-farol",
        memberIds: ["ana"],
        externalMemberIds: ["fornecedor"],
      }),
      teams: { "team-farol": farol },
      members: {
        ana: member({ id: "ana", email: "ana@cge.ce.gov.br", name: "Ana" }),
        fornecedor: member({
          id: "fornecedor",
          email: "contato@fornecedor.com",
          name: "Fornecedor",
          kind: "external",
        }),
      },
    });
    expect(snapshotVisibleToEmail(withExternal, "contato@fornecedor.com")).toBe(false);
    expect(memberCanSeeBoard(withExternal.board, "fornecedor", withExternal.teams)).toBe(
      false,
    );
  });
});

describe("teamIdsHeldByEmail", () => {
  it("reuses a team membership from one board onto the others with the same teamId", () => {
    const mandacaru = snap({
      board: board({ id: "mandacaru", teamId: "asesi-team", memberIds: ["charles"] }),
      teams: {
        "asesi-team": team({ id: "asesi-team", memberIds: ["charles"] }),
      },
      members: {
        charles: member({
          id: "charles",
          email: "charles.marques@cge.ce.gov.br",
          name: "Charles",
        }),
      },
    });
    const farol = snap({
      board: board({ id: "farol", teamId: "asesi-team", memberIds: ["ana"] }),
      teams: { "asesi-team": team({ id: "asesi-team", memberIds: ["ana"] }) },
      members: {
        ana: member({ id: "ana", email: "ana@cge.ce.gov.br", name: "Ana" }),
      },
    });
    const held = teamIdsHeldByEmail([mandacaru, farol], "charles.marques@cge.ce.gov.br");
    expect([...held]).toEqual(["asesi-team"]);
    expect(snapshotVisibleViaSharedTeam(farol, "charles.marques@cge.ce.gov.br", held)).toBe(
      true,
    );
    expect(snapshotVisibleToEmail(farol, "charles.marques@cge.ce.gov.br")).toBe(false);
  });

  it("ignores a leftover login id when the board still has the real member", () => {
    const charles = "charles.marques@cge.ce.gov.br";
    const mandacaru = snap({
      board: board({ id: "mandacaru", teamId: "asesi-team", memberIds: ["T6znFkjZPu6qRDGt3xmtC"] }),
      teams: {
        "asesi-team": team({ id: "asesi-team", memberIds: ["T6znFkjZPu6qRDGt3xmtC"] }),
      },
      members: {
        login: member({
          id: "3602de499a49b2f83f5e2d87",
          email: charles,
          name: "Charles login",
        }),
        board: member({
          id: "T6znFkjZPu6qRDGt3xmtC",
          email: charles,
          name: "Charles",
        }),
      },
    });
    const farol = snap({
      board: board({ id: "farol", teamId: "asesi-team", memberIds: ["ana"] }),
      teams: { "asesi-team": team({ id: "asesi-team", memberIds: ["ana"] }) },
      members: {
        ana: member({ id: "ana", email: "ana@cge.ce.gov.br", name: "Ana" }),
      },
    });
    const held = teamIdsHeldByEmail([mandacaru, farol], charles);
    expect([...held]).toEqual(["asesi-team"]);
    expect(snapshotVisibleToEmail(mandacaru, charles)).toBe(true);
    expect(snapshotVisibleViaSharedTeam(farol, charles, held)).toBe(true);
  });
});
