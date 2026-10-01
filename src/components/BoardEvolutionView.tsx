"use client";

import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import {
  buildEvolutionLines,
  formatEvolutionDate,
  formatEvolutionPct,
  type EvolutionLine,
} from "@/lib/board-evolution";
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
}: {
  lines: EvolutionLine[];
  activeId: string | null;
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
      role="img"
      aria-label="Linha de evolução do andamento de cada board"
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
            {line.points.map((point) => (
              <circle
                key={`${line.boardId}-${point.date}`}
                cx={xOf(point.date)}
                cy={yOf(point.pct)}
                r="4"
                fill={color}
                stroke="rgba(0,0,0,0.35)"
              >
                <title>
                  {`${line.title} · ${formatEvolutionDate(point.date)} · ${formatEvolutionPct(point.pct)}%`}
                </title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export function BoardEvolutionView({
  boardId,
  boards,
}: {
  boardId: string;
  boards: Record<string, Board>;
}) {
  const lines = useMemo(
    () => buildEvolutionLines(boardId, boards),
    [boardId, boards],
  );
  const drawn = lines.filter((line) => line.points.length > 0);
  const missing = lines.filter((line) => line.points.length === 0);
  const [activeId, setActiveId] = useState<string | null>(null);

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
            Linha de andamento de cada board, a partir do percentual datado no resumo.
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
            <EvolutionChart lines={drawn} activeId={activeId} />
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
                    onClick={() => setActiveId(on ? null : line.boardId)}
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
