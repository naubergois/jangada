import type { BoardSnapshot } from "@/lib/board-snapshot";
import type { Board, Team, TeamMember } from "@/lib/types";

function normalizeEmail(email: string | null | undefined) {
  return (email || "").trim().toLowerCase();
}

export function findMemberByEmail(
  members: Record<string, TeamMember> | undefined,
  email: string,
): TeamMember | undefined {
  return membersForEmail(members, email)[0];
}

export function membersForEmail(
  members: Record<string, TeamMember> | undefined,
  email: string,
): TeamMember[] {
  const key = normalizeEmail(email);
  if (!key) return [];
  return Object.values(members || {}).filter(
    (m) => normalizeEmail(m.email) === key,
  );
}

export function memberIdsForEmail(
  members: Record<string, TeamMember> | undefined,
  email: string,
): string[] {
  return membersForEmail(members, email).map((m) => m.id);
}

/**
 * Login gera users.id; o board guarda outro id para o mesmo e-mail.
 * Prefere o membro que já está no time/quadro — senão a home some tudo.
 */
export function preferredMemberIdForEmail(
  email: string,
  members: Record<string, TeamMember> | undefined,
  boards?: Record<string, Board> | Board[],
  teams?: Record<string, Team>,
): string | null {
  const key = normalizeEmail(email);
  if (!key) return null;
  const matches = Object.values(members || {}).filter(
    (m) => normalizeEmail(m.email) === key,
  );
  if (matches.length === 0) return null;
  const boardList = Array.isArray(boards) ? boards : Object.values(boards || {});
  const teamList = Object.values(teams || {});
  const onBoard = matches.find(
    (m) =>
      boardList.some((board) => (board.memberIds || []).includes(m.id)) ||
      teamList.some((team) => team.memberIds.includes(m.id)),
  );
  return (onBoard ?? matches[0]).id;
}

/** Team members see every board of that team; direct board members see that board. */
export function memberCanSeeBoard(
  board: Board,
  memberId: string | null | undefined,
  teams: Record<string, Team>,
  opts?: { isAdmin?: boolean },
): boolean {
  if (opts?.isAdmin) return true;
  if (!memberId) return false;
  if (board.teamId) {
    const team = teams[board.teamId];
    if (team?.memberIds.includes(memberId)) return true;
  }
  return (board.memberIds || []).includes(memberId);
}

export function filterBoardsForMember<T extends Board>(
  boards: T[],
  memberId: string | null | undefined,
  teams: Record<string, Team>,
  opts?: { isAdmin?: boolean },
): T[] {
  if (opts?.isAdmin) return boards;
  return boards.filter((board) => memberCanSeeBoard(board, memberId, teams));
}

export function filterBoardsForEmail<T extends Board>(
  boards: T[],
  email: string,
  members: Record<string, TeamMember> | undefined,
  teams: Record<string, Team>,
  opts?: { isAdmin?: boolean },
): T[] {
  if (opts?.isAdmin) return boards;
  const ids = memberIdsForEmail(members, email);
  if (ids.length === 0) return [];
  return boards.filter((board) =>
    ids.some((id) => memberCanSeeBoard(board, id, teams)),
  );
}

export function filterTeamsForMember<T extends Team>(
  teams: T[],
  memberId: string | null | undefined,
  opts?: { isAdmin?: boolean },
): T[] {
  if (opts?.isAdmin) return teams;
  if (!memberId) return [];
  return teams.filter((team) => team.memberIds.includes(memberId));
}

export function filterTeamsForEmail<T extends Team>(
  teams: T[],
  email: string,
  members: Record<string, TeamMember> | undefined,
  opts?: { isAdmin?: boolean },
): T[] {
  if (opts?.isAdmin) return teams;
  const ids = new Set(memberIdsForEmail(members, email));
  if (ids.size === 0) return [];
  return teams.filter((team) => team.memberIds.some((id) => ids.has(id)));
}

export function emailIsOnBoardTeam(snapshot: BoardSnapshot, email: string): boolean {
  const key = normalizeEmail(email);
  if (!key || !snapshot.board.teamId) return false;
  const team = snapshot.teams?.[snapshot.board.teamId];
  if (!team) return false;
  for (const memberId of team.memberIds) {
    const member = snapshot.members?.[memberId];
    if (member && normalizeEmail(member.email) === key) return true;
  }
  const byEmail = findMemberByEmail(snapshot.members, key);
  return Boolean(byEmail && team.memberIds.includes(byEmail.id));
}

export function emailIsBoardMember(snapshot: BoardSnapshot, email: string): boolean {
  const ids = new Set(memberIdsForEmail(snapshot.members, email));
  if (ids.size === 0) return false;
  return (snapshot.board.memberIds || []).some((id) => ids.has(id));
}

/**
 * Team members see every board linked to that team.
 * Direct board members (invite) see that board even if they are not on the team.
 */
export function snapshotVisibleToEmail(snapshot: BoardSnapshot, email: string): boolean {
  return emailIsOnBoardTeam(snapshot, email) || emailIsBoardMember(snapshot, email);
}

/**
 * Team copies live inside each board snapshot. If the person is on Equipe ASESI
 * in Mandacaru, they should still see Farol/ASESI — same teamId, other snapshot.
 */
export function teamIdsHeldByEmail(
  snapshots: BoardSnapshot[],
  email: string,
): Set<string> {
  const ids = new Set<string>();
  for (const snapshot of snapshots) {
    const matchIds = new Set(memberIdsForEmail(snapshot.members, email));
    if (matchIds.size === 0) continue;
    if (
      snapshot.board.teamId &&
      (snapshot.board.memberIds || []).some((id) => matchIds.has(id))
    ) {
      ids.add(snapshot.board.teamId);
    }
    for (const team of Object.values(snapshot.teams || {})) {
      if (team.memberIds.some((id) => matchIds.has(id))) ids.add(team.id);
    }
  }
  return ids;
}

export function snapshotVisibleViaSharedTeam(
  snapshot: BoardSnapshot,
  email: string,
  teamIdsHeld: Set<string>,
): boolean {
  if (snapshotVisibleToEmail(snapshot, email)) return true;
  return Boolean(snapshot.board.teamId && teamIdsHeld.has(snapshot.board.teamId));
}
