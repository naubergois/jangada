"use client";

import { useMemo, useRef, useState } from "react";
import { MessageCircle, TrendingUp } from "lucide-react";
import {
  buildEvolutionLines,
  collectEvolutionDayComments,
  formatEvolutionDate,
  formatEvolutionPct,
  type EvolutionDayComment,
  type EvolutionLine,
} from "@/lib/board-evolution";
import { useBoardStore } from "@/lib/store";
import type { Board } from "@/lib/types";

const COLORS = [
  "#7dd3fc",
  "#86efac",
  "#fcd34d",
  "#f9a8d4",
  "#c4b5fd",
  "#fdba74",
  "#67e8f9",
  "#fca5a5",
  "#bef264",
  "#a5b4fc",
  "#fde68a",
  "#99f6e4",
];

const PAD = { l: 36, r: 12, t: 16, b: 28 };
const VIEW_W = 640;
const VIEW_H = 280;

function deltaLabel(points: EvolutionLine["points"]) {
  if (points.length < 2) return null;
  const delta = Math.round((points[points.length - 1].pct - points[0].pct) * 10) / 10;
  const sign = delta > 0 ? "+" : "";
  const shown = Number.isInteger(delta) ? String(delta) : delta.toFixed(1).replace(".", ",");
  return `${sign}${shown} pp`;
}

function EvolutionChart({
  lines,
  activeId,
  activeDate,
  onSelectPoint,
}: {
  lines: EvolutionLine[];
  activeId: string | null;
  activeDate: string | null;
  onSelectPoint: (boardId: string, date: string) => void;
}) {
  const dates = useMemo(() => {
    const set = new Set<string>();
    for (const line of lines) {
      for (const point of line.points) set.add(point.date);
    }
    return [...set].sort();
  }, [lines]);

  const innerW = VIEW_W - PAD.l - PAD.r;
  const innerH = VIEW_H - PAD.t - PAD.b;
  const min = dates.length ? Date.parse(`${dates[0]}T00:00:00Z`) : 0;
  const max = dates.length ? Date.parse(`${dates[dates.length - 1]}T00:00:00Z`) : 0;
  const span = Math.max(1, max - min);

  const xOf = (date: string) => {
    if (dates.length <= 1) return PAD.l + innerW / 2;
    const t = Date.parse(`${date}T00:00:00Z`);
    return PAD.l + ((t - min) / span) * innerW;
  };
  const yOf = (pct: number) => PAD.t + (1 - pct / 100) * innerH;

  const axisDates =
    dates.length <= 4
      ? dates
      : [dates[0], dates[Math.floor(dates.length / 2)], dates[dates.length - 1]];

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="h-auto w-full"
      role="group"
      aria-label="Linha de evolução do andamento de cada board. Clique na bola para ver as atualizações daquele dia."
    >
      {[0, 25, 50, 75, 100].map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.l}
            x2={VIEW_W - PAD.r}
            y1={yOf(tick)}
            y2={yOf(tick)}
            stroke="rgba(255,255,255,0.12)"
          />
          <text
            x={PAD.l - 6}
            y={yOf(tick) + 3}
            textAnchor="end"
            fill="rgba(255,255,255,0.55)"
            fontSize="10"
          >
            {tick}
          </text>
        </g>
      ))}
      {axisDates.map((date) => (
        <text
          key={date}
          x={xOf(date)}
          y={VIEW_H - 8}
          textAnchor="middle"
          fill="rgba(255,255,255,0.55)"
          fontSize="10"
        >
          {formatEvolutionDate(date)}
        </text>
      ))}
      {lines.map((line, index) => {
        const color = COLORS[index % COLORS.length];
        const dim = activeId != null && activeId !== line.boardId;
        const coords = line.points.map(
          (point) => `${xOf(point.date)},${yOf(point.pct)}`,
        );
        return (
          <g key={line.boardId} opacity={dim ? 0.18 : 1}>
            {coords.length > 1 ? (
              <polyline
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={coords.join(" ")}
              />
            ) : null}
            {line.points.map((point) => {
              const selected = activeId === line.boardId && activeDate === point.date;
              const label = `${line.title} · ${formatEvolutionDate(point.date)} · ${formatEvolutionPct(point.pct)}%. Ver atualizações deste dia.`;
              return (
                <g
                  key={`${line.boardId}-${point.date}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => onSelectPoint(line.boardId, point.date)}
                >
                  <circle
                    cx={xOf(point.date)}
                    cy={yOf(point.pct)}
                    r="12"
                    fill="transparent"
                  />
                  <circle
                    cx={xOf(point.date)}
                    cy={yOf(point.pct)}
                    r={selected ? 6 : 4}
                    fill={color}
                    stroke={selected ? "#ffffff" : "rgba(0,0,0,0.35)"}
                    strokeWidth={selected ? 2 : 1}
                  >
                    <title>{label}</title>
                  </circle>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function groupCommentsByDay(items: EvolutionDayComment[]) {
  const groups: { date: string; items: EvolutionDayComment[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (!last || last.date !== item.date) {
      groups.push({ date: item.date, items: [item] });
    } else {
      last.items.push(item);
    }
  }
  return groups;
}

export function BoardEvolutionView({
  boardId,
  boards,
}: {
  boardId: string;
  boards: Record<string, Board>;
}) {
  const lists = useBoardStore((s) => s.lists);
  const cards = useBoardStore((s) => s.cards);
  const members = useBoardStore((s) => s.members);
  const activities = useBoardStore((s) => s.activities);
  const lines = useMemo(
    () => buildEvolutionLines(boardId, boards),
    [boardId, boards],
  );
  const comments = useMemo(
    () =>
      collectEvolutionDayComments({
        boardId,
        boards,
        lists,
        cards,
        members,
        activities,
      }),
    [boardId, boards, lists, cards, members, activities],
  );
  const drawn = lines.filter((line) => line.points.length > 0);
  const missing = lines.filter((line) => line.points.length === 0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const updatesRef = useRef<HTMLDivElement | null>(null);
  const visibleComments = comments.filter((item) => {
    if (activeId && item.boardId !== activeId) return false;
    return true;
  });
  const selectedPoint =
    activeId && activeDate
      ? lines
          .find((line) => line.boardId === activeId)
          ?.points.find((point) => point.date === activeDate) || null
      : null;
  const commentDays = groupCommentsByDay(visibleComments);

  return (
    <section className="rounded-2xl border border-white/15 bg-black/25 p-3 sm:p-4">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 rounded-xl border border-white/15 bg-white/10 p-2 text-[var(--accent)]">
          <TrendingUp className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg text-white">
            Evolução
          </h2>
          <p className="text-xs text-white/65">
            Clique na bola para ver as atualizações daquele dia.
          </p>
        </div>
      </div>

      {drawn.length === 0 ? (
        <p className="mt-4 text-sm text-white/70">
          Ainda não há percentual com data neste board. Quando o resumo tiver algo como
          “28/08: 48%”, a linha aparece aqui.
        </p>
      ) : (
        <>
          <div className="mt-3">
            <EvolutionChart
              lines={drawn}
              activeId={activeId}
              activeDate={activeDate}
              onSelectPoint={(nextBoardId, date) => {
                const same = activeId === nextBoardId && activeDate === date;
                setActiveId(same ? null : nextBoardId);
                setActiveDate(same ? null : date);
                if (!same) {
                  updatesRef.current?.scrollIntoView({ block: "nearest" });
                }
              }}
            />
          </div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {drawn.map((line, index) => {
              const last = line.points[line.points.length - 1];
              const delta = deltaLabel(line.points);
              const on = activeId === line.boardId;
              return (
                <li key={line.boardId}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(on ? null : line.boardId);
                      setActiveDate(null);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                      on
                        ? "border-white/50 bg-white/15 text-white"
                        : "border-white/15 text-white/80 hover:text-white"
                    }`}
                    aria-pressed={on}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: COLORS[index % COLORS.length] }}
                    />
                    <span className="font-medium">{line.title}</span>
                    <span className="tabular-nums text-white/70">
                      {formatEvolutionPct(last.pct)}%
                      {delta ? ` · ${delta}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div ref={updatesRef} className="mt-4 border-t border-white/10 pt-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-[var(--accent)]" />
          <h3 className="text-sm font-medium text-white">
            Atualizações por dia
            {activeId ? ` · ${boards[activeId]?.title || ""}` : ""}
          </h3>
          {activeId || activeDate ? (
            <button
              type="button"
              onClick={() => {
                setActiveDate(null);
                setActiveId(null);
              }}
              className="text-xs text-white/60 underline-offset-2 hover:text-white hover:underline"
            >
              Ver todos os boards
            </button>
          ) : null}
        </div>
        {selectedPoint ? (
          <p className="mt-2 text-sm text-white">
            Andamento neste dia:{" "}
            <span className="font-semibold">{formatEvolutionPct(selectedPoint.pct)}%</span>
          </p>
        ) : null}
        {commentDays.length === 0 ? (
          <p className="mt-2 text-sm text-white/60">
            {selectedPoint
              ? "Sem atualização escrita neste board."
              : "Nenhuma atualização nestes boards."}
          </p>
        ) : (
          <ol className="mt-3 space-y-4">
            {commentDays.map((group) => {
              const on = activeDate === group.date;
              return (
                <li key={group.date}>
                  <button
                    type="button"
                    onClick={() => setActiveDate(on ? null : group.date)}
                    className={`text-xs font-semibold uppercase tracking-wide ${
                      on ? "text-white" : "text-white/55 hover:text-white"
                    }`}
                    aria-pressed={on}
                  >
                    {formatEvolutionDate(group.date)}
                    <span className="ml-2 font-normal normal-case tracking-normal text-white/45">
                      {group.items.length === 1
                        ? "1 atualização"
                        : `${group.items.length} atualizações`}
                    </span>
                  </button>
                  <ul className="mt-1.5 space-y-1.5">
                    {group.items.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                      >
                        <p className="text-[11px] text-white/55">
                          <span className="text-white/80">{item.author}</span>
                          {" · "}
                          {item.boardTitle}
                          {item.cardTitle ? ` · ${item.cardTitle}` : ""}
                          {item.kind === "summary"
                            ? " · resumo"
                            : item.kind === "note"
                              ? " · observação"
                              : item.kind === "update"
                                ? " · atualização"
                                : " · comentário"}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-white/90">
                          {item.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {drawn.length > 0 ? (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-xs text-white/80">
              <caption className="sr-only">Pontos de andamento por board</caption>
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-white/45">
                  <th className="py-1 pr-3 font-medium">Board</th>
                  {drawn
                    .flatMap((line) => line.points.map((point) => point.date))
                    .filter((date, index, all) => all.indexOf(date) === index)
                    .sort()
                    .map((date) => (
                      <th key={date} className="px-2 py-1 font-medium tabular-nums">
                        {formatEvolutionDate(date)}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {drawn.map((line) => {
                  const columns = drawn
                    .flatMap((item) => item.points.map((point) => point.date))
                    .filter((date, index, all) => all.indexOf(date) === index)
                    .sort();
                  const byDate = new Map(line.points.map((point) => [point.date, point.pct]));
                  return (
                    <tr key={line.boardId} className="border-t border-white/10">
                      <th className="py-1.5 pr-3 font-medium text-white">{line.title}</th>
                      {columns.map((date) => {
                        const pct = byDate.get(date);
                        return (
                          <td key={date} className="px-2 py-1.5 tabular-nums">
                            {pct == null ? "—" : `${formatEvolutionPct(pct)}%`}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {missing.length > 0 && drawn.length > 0 ? (
        <p className="mt-3 text-xs text-white/55">
          Sem percentual datado: {missing.map((line) => line.title).join(", ")}.
        </p>
      ) : null}
    </section>
  );
}
