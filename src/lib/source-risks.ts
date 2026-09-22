import type { BoardRisk } from "@/lib/types";

export function analyzeClonedSource(opts: {
  url: string;
  files: string[];
  haystack: string;
}): BoardRisk[] {
  const risks: BoardRisk[] = [];
  const files = opts.files.map((f) => f.replaceAll("\\", "/"));
  const lowerFiles = files.map((f) => f.toLowerCase());
  const hay = opts.haystack.toLowerCase();
  const repo = opts.url.replace(/\.git$/i, "");

  if (!lowerFiles.some((f) => /(^|\/)readme(\.|$)/i.test(f))) {
    risks.push({
      id: `src-readme-${hash(repo)}`,
      title: "Código sem README",
      severity: "low",
      source: "git",
      reason: `O clone de ${repo} não tem README na raiz.`,
    });
  }

  const hasTests = lowerFiles.some(
    (f) =>
      /(^|\/)(test|tests|__tests__|spec)\//.test(f) ||
      /\.(test|spec)\.[jt]sx?$/.test(f) ||
      /test_.*\.py$/.test(f),
  );
  if (files.length >= 8 && !hasTests) {
    risks.push({
      id: `src-tests-${hash(repo)}`,
      title: "Pouca ou nenhuma suíte de testes no Git",
      severity: "medium",
      source: "git",
      reason: `Não encontrei arquivos de teste no repositório ${repo}.`,
    });
  }

  const hasCi = lowerFiles.some(
    (f) =>
      f.includes(".gitlab-ci") ||
      f.includes(".github/workflows") ||
      f.endsWith("jenkinsfile") ||
      f.includes("azure-pipelines"),
  );
  if (!hasCi) {
    risks.push({
      id: `src-ci-${hash(repo)}`,
      title: "Repositório sem pipeline de CI",
      severity: "medium",
      source: "git",
      reason: `Não há .gitlab-ci.yml / GitHub Actions visível em ${repo}.`,
    });
  }

  const todoHits = hay.split(/todo|fixme|hack\b/i).length - 1;
  if (todoHits >= 12) {
    risks.push({
      id: `src-todo-${hash(repo)}`,
      title: `Muitos TODO/FIXME no código (${todoHits})`,
      severity: "low",
      source: "git",
      reason: "O clone tem vários marcadores de débito técnico.",
    });
  }

  const envCommitted = lowerFiles.some((f) =>
    /(^|\/)\.env($|\.(?!example|sample|template|dist)[\w.-]*$)/i.test(f),
  );
  if (envCommitted) {
    risks.push({
      id: `src-env-${hash(repo)}`,
      title: "Arquivo .env versionado no Git",
      severity: "high",
      source: "git",
      reason: `${repo} tem .env no clone — risco de segredo no repositório. .env.example não conta.`,
    });
  }

  const secretHits =
    (hay.match(/begin (rsa |openssh |ec )?private key/g) || []).length +
    (hay.match(/akia[0-9a-z]{16}/g) || []).length +
    (hay.match(/(api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}/g) || [])
      .length;
  if (secretHits >= 1) {
    risks.push({
      id: `src-secret-${hash(repo)}`,
      title: "Possível segredo no código",
      severity: "high",
      source: "git",
      reason: `O clone de ${repo} tem padrão de chave, senha ou token em texto. Heurística de shift-left — não é SAST.`,
    });
  }

  const evalHits =
    (hay.match(/\beval\s*\(/g) || []).length +
    (hay.match(/new function\s*\(/g) || []).length +
    (hay.match(/dangerouslysetinnerhtml/g) || []).length;
  if (evalHits >= 3) {
    risks.push({
      id: `src-eval-${hash(repo)}`,
      title: "Uso recorrente de eval / innerHTML dinâmico",
      severity: "medium",
      source: "git",
      reason: `${repo} concentra eval, new Function ou dangerouslySetInnerHTML. Vale revisão de injeção antes do merge.`,
    });
  }

  return risks.slice(0, 10);
}

function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16).slice(0, 8);
}
