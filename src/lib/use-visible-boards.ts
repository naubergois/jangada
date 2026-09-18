"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { useBoardStore } from "@/lib/store";
import {
  filterBoardsForEmail,
  filterBoardsForMember,
  filterTeamsForEmail,
  filterTeamsForMember,
  preferredMemberIdForEmail,
} from "@/lib/board-access";

function byUpdatedDesc<T extends { updatedAt: string }>(a: T, b: T) {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function byName<T extends { name: string }>(a: T, b: T) {
  return a.name.localeCompare(b.name);
}

export function useVisibleBoards() {
  const boards = useBoardStore((s) => s.boards);
  const teams = useBoardStore((s) => s.teams);
  const members = useBoardStore((s) => s.members);
  const currentUserId = useBoardStore((s) => s.currentUserId);
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const email = session?.user?.email || "";
  const memberId = preferredMemberIdForEmail(email, members, boards, teams) || currentUserId;

  const boardList = useMemo(() => {
    const all = Object.values(boards);
    if (isAdmin) return all.sort(byUpdatedDesc);
    const byId = filterBoardsForMember(all, memberId, teams);
    if (byId.length > 0) return byId.sort(byUpdatedDesc);
    return filterBoardsForEmail(all, email, members, teams).sort(byUpdatedDesc);
  }, [boards, memberId, teams, isAdmin, email, members]);

  const teamList = useMemo(() => {
    const all = Object.values(teams);
    if (isAdmin) return all.sort(byName);
    const byId = filterTeamsForMember(all, memberId);
    if (byId.length > 0) return byId.sort(byName);
    return filterTeamsForEmail(all, email, members).sort(byName);
  }, [teams, memberId, isAdmin, email, members]);

  const visibleIds = useMemo(() => new Set(boardList.map((b) => b.id)), [boardList]);

  return { boardList, teamList, isAdmin, currentUserId, visibleIds };
}
