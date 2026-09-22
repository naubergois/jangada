import type { Requirement } from "@/lib/types";

export type RequirementPromptBundle = {
  specPrompt: string;
  testPrompt: string;
  codePrompt: string;
  mcpPayload: string;
  a2aObjective: string;
  promptsGeneratedAt: string;
};

export type RequirementPromptInput = Pick<
  Requirement,
  "code" | "title" | "description" | "priority" | "status"
> & {
  boardTitle?: string;
  productName?: string;
};

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function featureName(input: RequirementPromptInput) {
  return input.title.trim() || input.code;
}

function scopeBlock(input: RequirementPromptInput) {
  const desc = input.description.trim();
  return desc || `Implementar o requisito ${input.code}: ${input.title}`;
}

/** Prompt for spec-based / SDD implementation (Cursor, Kiro, agents). */
export function buildSpecPrompt(input: RequirementPromptInput): string {
  const feature = featureName(input);
  const product = input.productName || input.boardTitle || "Jangada";
  return `# Spec-based development — ${input.code}

## Product
${product}

## Requirement
- Code: ${input.code}
- Title: ${feature}
- Priority: ${input.priority}
- Status: ${input.status}

## Scope
${scopeBlock(input)}

## Your job (spec-driven)
1. Write a concise technical spec (problem, goals, non-goals, constraints).
2. Define public interfaces / data shapes before coding.
3. Break work into ordered implementation steps.
4. Implement only what the spec covers; no speculative features.
5. After each step, verify against the acceptance criteria below.

## Acceptance criteria (draft from requirement)
- Given the user/system context of "${feature}", when the feature is used as described in the scope, then the expected outcome is achieved without regressions.
- Edge cases and invalid inputs are handled explicitly.
- Behavior is covered by the companion test prompt for ${input.code}.

## Output format
Return:
1. SPEC.md sections (Overview, Interfaces, Steps, Risks)
2. File/module plan
3. Implementation checklist
`;
}

/** Prompt for automated + manual tests (unit/integration/E2E/Gherkin). */
export function buildTestPrompt(input: RequirementPromptInput): string {
  const feature = featureName(input);
  return `# Test plan — ${input.code}: ${feature}

## Context
${scopeBlock(input)}

## Generate
1. Gherkin scenarios (Happy path + at least 2 edge cases + 1 failure path).
2. Unit test cases (inputs/outputs/assertions).
3. Integration/API checks if the requirement touches APIs or persistence.
4. E2E/UI checks if the requirement is user-facing.
5. A short regression checklist for manual QA.

## Gherkin skeleton
\`\`\`gherkin
Feature: ${input.code} — ${feature}
  As a stakeholder
  I want ${feature}
  So that the board delivers the described value

  Scenario: Happy path
    Given …
    When …
    Then …

  Scenario: Edge case
    Given …
    When …
    Then …

  Scenario: Failure / validation
    Given …
    When …
    Then …
\`\`\`

## Constraints
- Prefer deterministic tests; mock external services.
- Map each scenario back to ${input.code}.
- Priority of the requirement is ${input.priority} — cover critical paths first.
`;
}

/** Brief de geração/refatoração para o agente de código no IDE. Maya não commita. */
export function buildCodePrompt(input: RequirementPromptInput): string {
  const feature = featureName(input);
  const product = input.productName || input.boardTitle || "Jangada";
  return `# Implementação — ${input.code}: ${feature}

## Produto
${product}

## Escopo
${scopeBlock(input)}

## Seu trabalho (agente de código no IDE)
1. Leia a spec e o plano de teste deste requisito antes de escrever arquivo.
2. Liste os arquivos que vai criar ou alterar. Não invente API que o repo não tem.
3. Implemente o caminho feliz e os casos do Gherkin. Sem feature extra.
4. Refatore só o que o requisito toca: nome claro, função pequena, teste no mesmo PR.
5. Não commite segredo, .env nem dado de execução.

## Saída
- Plano de arquivos (criar / alterar / apagar)
- Assinaturas públicas
- Diff mental por arquivo
- Checklist de refatoração (o que não mexer)
- Como o job Git deve achar este card no repo (tokens no README ou no módulo)

O MCP grava o mesmo quadro. Quem gera o código é o agente do IDE, não a Maya.
`;
}

/** Structured MCP tool handoff (software planning + A2A-friendly hints). */
export function buildMcpPayload(input: RequirementPromptInput): string {
  const feature = featureName(input);
  const product = input.productName || input.boardTitle || "Jangada";
  const payload = {
    requirement: {
      code: input.code,
      title: feature,
      description: scopeBlock(input),
      priority: input.priority,
      status: input.status,
    },
    mcp_tools: [
      {
        tool: "software_planning_plan",
        arguments: {
          goal: `${input.code}: ${feature}`,
          product_name: product,
          profile: "kanban",
          epic: input.code,
          problem: scopeBlock(input),
          scope: `Spec-based implementation and tests for ${input.code}`,
          context: [
            `Requirement ${input.code}`,
            `Priority: ${input.priority}`,
            `Status: ${input.status}`,
            scopeBlock(input),
          ].join("\n"),
        },
      },
      {
        tool: "software_planning_prd_brief",
        arguments: {
          product_name: product,
          problem: scopeBlock(input),
          audience: "equipe do board",
          scope: feature,
        },
      },
      {
        tool: "software_planning_backlog_brief",
        arguments: {
          epic: input.code,
          goal: feature,
          context: scopeBlock(input),
        },
      },
      {
        tool: "agent_collab_run",
        arguments: {
          objective: buildA2aObjective(input),
          use_mcp_hints: true,
          rounds: 2,
          agents: [
            {
              name: "SpecLead",
              role: "Especialista em spec-based / SDD",
              model: "deepseek",
            },
            {
              name: "QALead",
              role: "Engenharia de testes (Gherkin + automação)",
              model: "openai",
            },
          ],
        },
      },
      {
        tool: "kanban_ide_handoff",
        arguments: {
          action: "handoff",
          ide: "cursor",
          dry_run: false,
          open_ide: true,
          task_id: input.code,
        },
      },
    ],
    artifacts: {
      spec_prompt_id: `spec:${slugify(input.code)}`,
      test_prompt_id: `test:${slugify(input.code)}`,
      code_prompt_id: `code:${slugify(input.code)}`,
    },
  };
  return JSON.stringify(payload, null, 2);
}

/** Compact A2A debate objective for multi-agent collaboration. */
export function buildA2aObjective(input: RequirementPromptInput): string {
  const feature = featureName(input);
  return [
    `A2A — requisito ${input.code}: ${feature}.`,
    `Prioridade ${input.priority}.`,
    `Produzir: (1) especificação spec-based executável, (2) plano de testes Gherkin + automação, (3) brief de geração/refatoração no IDE, (4) handoff MCP pronto.`,
    `Escopo: ${scopeBlock(input)}`,
    `Consenso final deve listar passos de implementação e casos de teste mapeados a ${input.code}.`,
  ].join(" ");
}

export function buildRequirementPrompts(
  input: RequirementPromptInput,
  generatedAt = new Date().toISOString(),
): RequirementPromptBundle {
  return {
    specPrompt: buildSpecPrompt(input),
    testPrompt: buildTestPrompt(input),
    codePrompt: buildCodePrompt(input),
    mcpPayload: buildMcpPayload(input),
    a2aObjective: buildA2aObjective(input),
    promptsGeneratedAt: generatedAt,
  };
}

export function requirementNeedsPrompts(req: Partial<Requirement> | null | undefined) {
  if (!req) return true;
  return !(
    req.specPrompt &&
    req.testPrompt &&
    req.codePrompt &&
    req.mcpPayload &&
    req.a2aObjective
  );
}

export function withRequirementPrompts(
  req: Requirement,
  boardTitle?: string,
): Requirement {
  if (!requirementNeedsPrompts(req)) return req;
  return {
    ...req,
    ...buildRequirementPrompts({
      code: req.code,
      title: req.title,
      description: req.description,
      priority: req.priority,
      status: req.status,
      boardTitle,
    }),
  };
}
