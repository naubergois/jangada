import { describe, expect, it } from "vitest";
import {
  buildCodePrompt,
  buildRequirementPrompts,
  requirementNeedsPrompts,
} from "./requirement-prompts";

const input = {
  code: "REQ-01",
  title: "Login do gestor",
  description: "Entrar com usuário e senha institucionais.",
  priority: "high" as const,
  status: "approved" as const,
  boardTitle: "Fábrica Serpro",
};

describe("requirement prompts", () => {
  it("builds a code brief that does not claim Maya commits", () => {
    const brief = buildCodePrompt(input);
    expect(brief).toContain("REQ-01");
    expect(brief).toContain("agente de código");
    expect(brief.toLowerCase()).toContain("não commite");
    expect(brief).toContain("Maya");
  });

  it("includes codePrompt in the bundle", () => {
    const bundle = buildRequirementPrompts(input);
    expect(bundle.codePrompt).toContain("Implementação");
    expect(bundle.mcpPayload).toContain("code_prompt_id");
    expect(requirementNeedsPrompts({ specPrompt: "x" })).toBe(true);
    expect(requirementNeedsPrompts(bundle)).toBe(false);
  });
});
