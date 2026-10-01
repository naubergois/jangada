/**
 * Percentual datado do resumo de um board.
 * Cada atualização do resumo acumula um ponto; a linha de evolução não depende
 * do texto antigo continuar escrito.
 */

const MAX_POINTS = 120;

function pad(n) {
  return String(n).padStart(2, "0");
}

function parsePct(raw) {
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 10) / 10;
}

/** dd/mm no ano de referência. Data inválida ou mais de um dia à frente volta um ano. */
export function evolutionDateIso(day, month, reference) {
  const d = Number(day);
  const m = Number(month);
  if (!Number.isInteger(d) || !Number.isInteger(m) || m < 1 || m > 12 || d < 1 || d > 31) {
    return null;
  }
  const ref = reference instanceof Date ? reference : new Date(reference);
  const refUtc = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
  let year = ref.getFullYear();
  let dt = new Date(Date.UTC(year, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (dt.getTime() > refUtc + 86_400_000) {
    year -= 1;
    dt = new Date(Date.UTC(year, m - 1, d));
    if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  }
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * Extrai pontos { date: YYYY-MM-DD, pct } de textos como
 * "Andamento (28/08): 48%", "21/08: 40%" e "57,6% (09/09)".
 */
export function parseEvolutionPoints(text, reference = new Date()) {
  const source = String(text || "");
  if (!source.trim()) return [];
  /** @type {Map<string, number>} */
  const found = new Map();

  const backward =
    /(\d+(?:[.,]\d+)?)\s*%\s*\((?:posi[cç][aã]o\s+)?(\d{1,2})\/(\d{1,2})\)/gi;
  for (const match of source.matchAll(backward)) {
    const pct = parsePct(match[1]);
    const date = evolutionDateIso(match[2], match[3], reference);
    if (pct == null || !date) continue;
    found.set(date, pct);
  }

  const forward =
    /(\d{1,2})\/(\d{1,2})(?:\s*,\s*[^:%\n]{0,40})?\)?\s*:\s*([^%\n]{0,80}?)(\d+(?:[.,]\d+)?)\s*%/g;
  for (const match of source.matchAll(forward)) {
    if (/\d{1,2}\/\d{1,2}/.test(match[3] || "")) continue;
    const pct = parsePct(match[4]);
    const date = evolutionDateIso(match[1], match[2], reference);
    if (pct == null || !date) continue;
    found.set(date, pct);
  }

  return [...found.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, pct]) => ({ date, pct }));
}

export function mergeEvolutionPoints(existing, incoming) {
  /** @type {Map<string, number>} */
  const map = new Map();
  for (const point of existing || []) {
    if (!point || typeof point.date !== "string") continue;
    const pct = parsePct(point.pct);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(point.date) || pct == null) continue;
    map.set(point.date, pct);
  }
  for (const point of incoming || []) {
    if (!point || typeof point.date !== "string") continue;
    const pct = parsePct(point.pct);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(point.date) || pct == null) continue;
    map.set(point.date, pct);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-MAX_POINTS)
    .map(([date, pct]) => ({ date, pct }));
}

/** Junta o histórico já guardado com os percentuais datados do resumo novo. */
export function absorbBoardEvolution(previous, summaryText, reference = new Date()) {
  return mergeEvolutionPoints(previous, parseEvolutionPoints(summaryText, reference));
}
