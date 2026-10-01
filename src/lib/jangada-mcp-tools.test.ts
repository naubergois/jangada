import { describe, expect, it } from "vitest";
import {
  applyAdicionarGit,
  applyAdicionarWhatsApp,
  applyAnexarArquivo,
  applyAtualizarResumo,
  applyAtualizarWhatsApp,
  applyCriarCard,
  applyCriarLista,
  applyMoverCard,
  applyRemoverAnexo,
  applyRemoverWhatsApp,
  compactBoard,
  findList,
  listTools,
  resolveAttachmentInput,
} from "../../scripts/jangada-mcp-tools.mjs";

function snapshot() {
  return {
    board: {
      id: "asesi",
      title: "ASESI",
      listIds: ["backlog", "doing"],
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    lists: {
      backlog: { id: "backlog", boardId: "asesi", title: "Backlog", cardIds: [] },
      doing: { id: "doing", boardId: "asesi", title: "Em andamento", cardIds: [] },
    },
    cards: {},
    requirements: {},
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("jangada MCP snapshot tools", () => {
  it("creates a card on a list found by title", () => {
    const { snapshot: next, cardId, listId } = applyCriarCard(snapshot(), {
      title: "Mapear fontes",
      list_title: "Backlog",
      priority: "high",
    });
    expect(listId).toBe("backlog");
    expect(next.cards[cardId].title).toBe("Mapear fontes");
    expect(next.lists.backlog.cardIds).toContain(cardId);
    expect(compactBoard(next).lists[0].cards[0].title).toBe("Mapear fontes");
  });

  it("creates a list and moves a card onto it", () => {
    const withList = applyCriarLista(snapshot(), { title: "Bloqueios" });
    const withCard = applyCriarCard(withList.snapshot, { title: "VPN", list_title: "Backlog" });
    const moved = applyMoverCard(withCard.snapshot, {
      card_id: withCard.cardId,
      list_id: withList.listId,
    });
    expect(moved.snapshot.cards[withCard.cardId].listId).toBe(withList.listId);
    expect(moved.snapshot.lists.backlog.cardIds).not.toContain(withCard.cardId);
    expect(findList(moved.snapshot, withList.listId)?.cardIds).toContain(withCard.cardId);
  });

  it("links a git repo to the board without duplicating the same URL", () => {
    const first = applyAdicionarGit(snapshot(), {
      url: "http://git.cge.local/g_asesi/jangada.git",
    });
    const again = applyAdicionarGit(first.snapshot, {
      url: "http://git.cge.local/g_asesi/jangada.git",
    });
    expect(first.repoId).toBeTruthy();
    expect(again.repoId).toBe(first.repoId);
    expect(first.snapshot.board.gitRepos).toHaveLength(1);
    expect(compactBoard(first.snapshot).board.gitRepos[0].url).toContain("jangada.git");
  });

  it("stores and returns an executive summary on the board", () => {
    const { snapshot: next, executiveSummary } = applyAtualizarResumo(snapshot(), {
      resumo: "  Situação estável.\r\nPrioridade: piloto.  ",
    });
    expect(executiveSummary).toBe("Situação estável.\nPrioridade: piloto.");
    expect(compactBoard(next).board.executiveSummary).toBe(
      "Situação estável.\nPrioridade: piloto.",
    );
  });

  it("keeps dated progress when a later summary replaces the text", () => {
    const first = applyAtualizarResumo(snapshot(), {
      resumo: "Andamento operacional ASESI (21/08): 40%.",
    });
    const second = applyAtualizarResumo(first.snapshot, {
      resumo: "Andamento operacional ASESI (28/08): 48%.",
    });
    expect(second.snapshot.board.evolution).toEqual([
      { date: expect.stringMatching(/^\d{4}-08-21$/), pct: 40 },
      { date: expect.stringMatching(/^\d{4}-08-28$/), pct: 48 },
    ]);
  });

  it("adds, edits and removes WhatsApp group metadata on a board", () => {
    const added = applyAdicionarWhatsApp(snapshot(), {
      name: "Grupo WhatsApp ASESI",
      jid: "120363430202949653@g.us",
      notes: "Fonte da carteira",
    });
    expect(added.group.jid).toBe("120363430202949653@g.us");
    expect(compactBoard(added.snapshot).board.whatsappGroups).toHaveLength(1);

    const again = applyAdicionarWhatsApp(added.snapshot, {
      jid: "Grupo WhatsApp ASESI (120363430202949653@g.us)",
      invite_url: "https://chat.whatsapp.com/AbCdEfGhIjKlMnOp",
    });
    expect(again.groupId).toBe(added.groupId);
    expect(again.snapshot.board.whatsappGroups).toHaveLength(1);
    expect(again.group.inviteUrl).toContain("chat.whatsapp.com");

    const edited = applyAtualizarWhatsApp(again.snapshot, {
      group_id: added.groupId,
      name: "ASESI",
      notes: "Atualizado",
    });
    expect(edited.group.name).toBe("ASESI");
    expect(edited.group.notes).toBe("Atualizado");
    expect(edited.group.jid).toBe("120363430202949653@g.us");

    const removed = applyRemoverWhatsApp(edited.snapshot, { group_id: added.groupId });
    expect(removed.snapshot.board.whatsappGroups).toEqual([]);
  });

  it("attaches and removes files on a card, including via URL", () => {
    const created = applyCriarCard(snapshot(), { title: "Mapa", list_title: "Backlog" });
    const withFile = applyAnexarArquivo(created.snapshot, {
      card_id: created.cardId,
      attachment: {
        id: "att1",
        name: "mapa.pdf",
        mimeType: "application/pdf",
        size: 12,
        kind: "file",
        url: "/api/boards/asesi/cards/x/attachments/att1",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(withFile.snapshot.cards[created.cardId].attachments).toHaveLength(1);
    expect(compactBoard(withFile.snapshot).lists[0].cards[0].attachments[0].name).toBe("mapa.pdf");

    const withLink = applyAnexarArquivo(withFile.snapshot, {
      card_id: created.cardId,
      attachment: {
        id: "att2",
        name: "norma",
        mimeType: "text/uri-list",
        size: 0,
        kind: "link",
        url: "https://example.com/norma.pdf",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(withLink.snapshot.cards[created.cardId].attachments).toHaveLength(2);

    const removed = applyRemoverAnexo(withLink.snapshot, {
      card_id: created.cardId,
      attachment_id: "att1",
    });
    expect(removed.snapshot.cards[created.cardId].attachments).toHaveLength(1);
    expect(removed.snapshot.cards[created.cardId].attachments[0].id).toBe("att2");
  });

  it("resolves MCP attachment input from base64 and rejects executables", () => {
    const decoded = resolveAttachmentInput(
      { content_base64: Buffer.from("hello").toString("base64"), filename: "notas.txt" },
      process.cwd(),
    );
    expect(decoded.kind).toBe("file");
    expect(decoded.name).toBe("notas.txt");
    expect(decoded.bytes?.toString()).toBe("hello");

    const link = resolveAttachmentInput(
      { url: "https://cge.ce.gov.br/doc.pdf", filename: "doc.pdf" },
      process.cwd(),
    );
    expect(link.kind).toBe("link");
    expect(link.url).toContain("cge.ce.gov.br");

    expect(() =>
      resolveAttachmentInput({ content_base64: "QQ==", filename: "setup.exe" }, process.cwd()),
    ).toThrow(/não permitido/);
  });

  it("exposes attachment tools", () => {
    const names = listTools().map((tool) => tool.name);
    expect(names).toContain("jangada_anexar_arquivo");
    expect(names).toContain("jangada_remover_anexo");
  });
});
