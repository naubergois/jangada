"use client";

import { Target } from "lucide-react";
import {
  formatGoalPct,
  goalAttainmentTone,
  type GoalAttainment,
} from "@/lib/goal-attainment";

const TONE_BAR: Record<"ok" | "warn" | "danger", string> = {
  ok: "bg-lime-400",
  warn: "bg-amber-400",
  danger: "bg-rose-400",
};

const TONE_TEXT: Record<"ok" | "warn" | "danger", string> = {
  ok: "text-lime-300",
  warn: "text-amber-300",
  danger: "text-rose-300",
};

function deltaLabel(current: number, previous?: number, label?: string) {
  if (previous == null) return null;
  const delta = Math.round((current - previous) * 10) / 10;
  const sign = delta > 0 ? "+" : "";
  const shown = Number.isInteger(delta) ? String(delta) : delta.toFixed(1).replace(".", ",");
  return `${sign}${shown} pp${label ? ` vs ${label}` : ""}`;
}

export function GoalAttainmentPanel({
  attainment,
  variant = "cover",
}: {
  attainment: GoalAttainment;
  variant?: "cover" | "compact";
}) {
  const tone = goalAttainmentTone(attainment.pct);
  const metas = attainment.items.filter((item) => item.countsTowardAverage);
  const delta = deltaLabel(
    attainment.pct,
    attainment.previousPct,
    attainment.previousLabel,
  );
  const countedLabel =
    attainment.counted === 1
      ? "1 meta SIGE"
      : `${attainment.counted || metas.length} metas SIGE`;

  if (variant === "compact") {
    return (
      <div
        className="flex items-center gap-2"
        title="Percentual de atingimento das metas SIGE"
      >
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-black/35">
          <div
            className={`h-full ${TONE_BAR[tone]}`}
            style={{ width: `${Math.min(100, Math.max(0, attainment.pct))}%` }}
          />
        </div>
        <span className={`shrink-0 text-[10px] font-semibold tabular-nums ${TONE_TEXT[tone]}`}>
          {formatGoalPct(attainment.pct)}% metas
        </span>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-white/15 bg-black/25 px-3 py-2.5"
      aria-label={`Atingimento das metas: ${formatGoalPct(attainment.pct)} por cento`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 hidden rounded-xl border border-white/15 bg-white/10 p-2 text-[var(--accent)] sm:inline-flex">
          <Target className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
            Atingimento das metas
          </p>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className={`font-[family-name:var(--font-display)] text-3xl tabular-nums leading-none ${TONE_TEXT[tone]}`}>
              {formatGoalPct(attainment.pct)}%
            </p>
            <p className="text-xs text-white/65">
              {countedLabel}
              {attainment.asOf ? ` · ${attainment.asOf}` : ""}
              {delta ? ` · ${delta}` : ""}
            </p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/40">
            <div
              className={`h-full ${TONE_BAR[tone]}`}
              style={{ width: `${Math.min(100, Math.max(0, attainment.pct))}%` }}
            />
          </div>
          {metas.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {metas.map((item) => (
                <span
                  key={item.boardId}
                  className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/85"
                  title={item.title}
                >
                  {item.title} {formatGoalPct(item.pct)}%
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
