/**
 * Tools MCP do Jangada — mutações puras no snapshot + persistência PG/arquivo.
 * Usado pelo stdio (Cursor e Kiro) para alimentar o mesmo kanban.
 */

import fs from "node:fs";
import path from "node:path";
import { absorbBoardEvolution } from "../src/lib/board-evolution-parse.mjs";
import crypto from "node:crypto";
import pg from "pg";

export const ASESI_BOARD_ID = "asesi";

function nowIso() {
  return new Date().toISOString();
}

function nid() {
  return crypto.randomBytes(8).toString("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizePriority(value) {
  if (value === "low" || value === "medium" || value === "high") return value;
  return "medium";
}

export function compactBoard(snapshot) {
  const lists = (snapshot.board?.listIds || [])
    .map((id) => snapshot.lists?.[id])
    .filter(Boolean)
    .map((list) => ({
      id: list.id,
      title: list.title,
      cards: (list.cardIds || [])
        .map((cid) => snapshot.cards?.[cid])
        .filter(Boolean)
        .map((card) => ({
          id: card.id,
          title: card.title,
          priority: card.priority,
          startDate: card.startDate || null,
          dueDate: card.dueDate,
          assigneeId: card.assigneeId,
          attachments: (card.attachments || []).map((item) => ({
            id: item.id,
            name: item.name,
            mimeType: item.mimeType,
            size: item.size,
            kind: item.kind || "file",
            url: item.url || null,
          })),
        })),
    }));
  const requirements = Object.values(snapshot.requirements || {}).map((req) => ({
    id: req.id,
    code: req.code,
    title: req.title,
    status: req.status,
    priority: req.priority,
  }));
  return {
    board: {
      id: snapshot.board?.id,
      title: snapshot.board?.title,
      description: snapshot.board?.description,
      executiveSummary: snapshot.board?.executiveSummary || "",
      updatedAt: snapshot.updatedAt,
      gitRepos: (snapshot.board?.gitRepos || []).map((repo) => ({
        id: repo.id,
        url: repo.url,
      })),
      whatsappGroups: (snapshot.board?.whatsappGroups || []).map((group) => ({
        id: group.id,
        name: group.name,
        inviteUrl: group.inviteUrl || null,
        jid: group.jid || null,
        notes: group.notes || "",
      })),
    },
    lists,
    requirements,
  };
}

export function findList(snapshot, listId, listTitle) {
  if (listId && snapshot.lists?.[listId]) return snapshot.lists[listId];
  if (listTitle) {
    const wanted = String(listTitle).trim().toLowerCase();
    return Object.values(snapshot.lists || {}).find(
      (list) => list.boardId === snapshot.board.id && String(list.title).toLowerCase() === wanted,
    );
  }
  const firstId = snapshot.board?.listIds?.[0];
  return firstId ? snapshot.lists?.[firstId] : null;
}

export function applyCriarLista(snapshot, { title }) {
  const name = String(title || "").trim();
  if (name.length < 2) throw new Error("Informe um título de lista com pelo menos 2 caracteres.");
  const next = clone(snapshot);
  const id = nid();
  next.lists = next.lists || {};
  next.lists[id] = { id, boardId: next.board.id, title: name, cardIds: [] };
  next.board.listIds = [...(next.board.listIds || []), id];
  next.board.updatedAt = nowIso();
  next.updatedAt = nowIso();
  return { snapshot: next, listId: id };
}

export function applyCriarCard(snapshot, args) {
  const title = String(args.title || "").trim();
  if (title.length < 2) throw new Error("Informe um título de card com pelo menos 2 caracteres.");
  const next = clone(snapshot);
  const list = findList(next, args.list_id || args.listId, args.list_title || args.listTitle);
  if (!list) throw new Error("Lista não encontrada. Use list_id ou list_title.");
  const id = nid();
  const ts = nowIso();
  next.cards = next.cards || {};
  next.cards[id] = {
    id,
    listId: list.id,
    title,
    description: String(args.description || ""),
    labels: Array.isArray(args.labels) ? args.labels : [],
    coverColor: args.cover_color || args.coverColor || null,
    startDate: args.start_date || args.startDate || null,
    dueDate: args.due_date || args.dueDate || null,
    dailyNotes: Array.isArray(args.daily_notes) ? args.daily_notes : [],
    priority: args.priority ? normalizePriority(args.priority) : "medium",
    assigneeId: args.assignee_id || args.assigneeId || null,
    requirementId: args.requirement_id || args.requirementId || null,
    acceptanceCriteria: String(args.acceptance_criteria || args.acceptanceCriteria || ""),
    checklist: Array.isArray(args.checklist) ? args.checklist : [],
    comments: [],
    attachments: [],
    archived: false,
    createdAt: ts,
    updatedAt: ts,
  };
  list.cardIds = [...(list.cardIds || []), id];
  next.lists[list.id] = list;
  next.board.updatedAt = ts;
  next.updatedAt = ts;
  return { snapshot: next, cardId: id, listId: list.id };
}

export function applyCriarCards(snapshot, cards) {
  let next = snapshot;
  const created = [];
  for (const card of cards || []) {
    const result = applyCriarCard(next, card);
    next = result.snapshot;
    created.push({ cardId: result.cardId, listId: result.listId, title: card.title });
  }
  return { snapshot: next, created };
}

export function applyAtualizarCard(snapshot, args) {
  const cardId = args.card_id || args.cardId;
  const next = clone(snapshot);
  const card = next.cards?.[cardId];
  if (!card) throw new Error("Card não encontrado.");
  if (args.title != null) card.title = String(args.title);
  if (args.description != null) card.description = String(args.description);
  if (args.priority != null) card.priority = normalizePriority(args.priority);
  if (args.due_date !== undefined || args.dueDate !== undefined) {
    card.dueDate = args.due_date ?? args.dueDate ?? null;
  }
  if (args.start_date !== undefined || args.startDate !== undefined) {
    card.startDate = args.start_date ?? args.startDate ?? null;
  }
  if (args.assignee_id !== undefined || args.assigneeId !== undefined) {
    card.assigneeId = args.assignee_id ?? args.assigneeId ?? null;
  }
  if (args.acceptance_criteria != null || args.acceptanceCriteria != null) {
    card.acceptanceCriteria = String(args.acceptance_criteria ?? args.acceptanceCriteria ?? "");
  }
  if (args.cover_color !== undefined || args.coverColor !== undefined) {
    card.coverColor = args.cover_color ?? args.coverColor ?? null;
  }
  if (args.labels != null) card.labels = Array.isArray(args.labels) ? args.labels : [];
  card.updatedAt = nowIso();
  next.board.updatedAt = card.updatedAt;
  next.updatedAt = card.updatedAt;
  return { snapshot: next, card };
}

export function applyAnexarArquivo(snapshot, args) {
  const cardId = args.card_id || args.cardId;
  const next = clone(snapshot);
  const card = next.cards?.[cardId];
  if (!card) throw new Error("Card não encontrado.");
  const attachment = args.attachment;
  if (!attachment?.id || !attachment?.name) throw new Error("Anexo inválido.");
  card.attachments = Array.isArray(card.attachments) ? card.attachments : [];
  if (!card.attachments.some((item) => item.id === attachment.id)) {
    card.attachments.push(attachment);
  }
  const ts = nowIso();
  card.updatedAt = ts;
  next.board.updatedAt = ts;
  next.updatedAt = ts;
  return { snapshot: next, cardId, attachment };
}

export function applyRemoverAnexo(snapshot, args) {
  const cardId = args.card_id || args.cardId;
  const attachmentId = args.attachment_id || args.attachmentId;
  const next = clone(snapshot);
  const card = next.cards?.[cardId];
  if (!card) throw new Error("Card não encontrado.");
  const current = Array.isArray(card.attachments) ? card.attachments : [];
  const attachment = current.find((item) => item.id === attachmentId);
  if (!attachment) throw new Error("Anexo não encontrado.");
  card.attachments = current.filter((item) => item.id !== attachmentId);
  const ts = nowIso();
  card.updatedAt = ts;
  next.board.updatedAt = ts;
  next.updatedAt = ts;
  return { snapshot: next, cardId, attachment };
}

export function applyMoverCard(snapshot, args) {
  const cardId = args.card_id || args.cardId;
  const next = clone(snapshot);
  const card = next.cards?.[cardId];
  if (!card) throw new Error("Card não encontrado.");
  const target = findList(next, args.list_id || args.listId, args.list_title || args.listTitle);
  if (!target) throw new Error("Lista de destino não encontrada.");
  const from = next.lists[card.listId];
  if (from) from.cardIds = (from.cardIds || []).filter((id) => id !== cardId);
  if (!target.cardIds.includes(cardId)) target.cardIds = [...(target.cardIds || []), cardId];
  card.listId = target.id;
  card.updatedAt = nowIso();
  next.board.updatedAt = card.updatedAt;
  next.updatedAt = card.updatedAt;
  return { snapshot: next, cardId, listId: target.id };
}

export function applyCriarRequisito(snapshot, args) {
  const title = String(args.title || "").trim();
  const code = String(args.code || "").trim();
  if (title.length < 2) throw new Error("Informe um título de requisito.");
  if (!code) throw new Error("Informe o código do requisito (ex.: ASESI-R10).");
  const next = clone(snapshot);
  next.requirements = next.requirements || {};
  const id = nid();
  const ts = nowIso();
  const req = {
    id,
    boardId: next.board.id,
    code,
    title,
    description: String(args.description || ""),
    status: args.status || "draft",
    priority: normalizePriority(args.priority),
    ownerId: args.owner_id || args.ownerId || null,
    dueDate: args.due_date || args.dueDate || null,
    mcpPayload: JSON.stringify(
      {
        requirement: { code, title, description: args.description || "", source: "mcp" },
        mcp_tools: [{ tool: "jangada_criar_card", arguments: { board_id: next.board.id, title } }],
      },
      null,
      2,
    ),
    createdAt: ts,
    updatedAt: ts,
  };
  next.requirements[id] = req;
  next.board.updatedAt = ts;
  next.updatedAt = ts;
  return { snapshot: next, requirementId: id, requirement: req };
}

export function applyAdicionarGit(snapshot, args) {
  const url = String(args.url || "").trim();
  if (!url) throw new Error("Informe a URL do Git.");
  const next = clone(snapshot);
  next.board.gitRepos = Array.isArray(next.board.gitRepos) ? next.board.gitRepos : [];
  if (next.board.gitRepos.some((r) => r.url === url)) {
    return { snapshot: next, repoId: next.board.gitRepos.find((r) => r.url === url).id };
  }
  const id = nid();
  next.board.gitRepos.push({ id, url, addedAt: nowIso() });
  next.board.updatedAt = nowIso();
  next.updatedAt = nowIso();
  return { snapshot: next, repoId: id };
}

function sanitizeWaInvite(raw) {
  let value = String(raw || "").trim();
  if (!value) return null;
  if (/^chat\.whatsapp\.com\//i.test(value)) value = `https://${value}`;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol.toLowerCase())) return null;
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "chat.whatsapp.com") return null;
    const segments = parsed.pathname.split("/").filter(Boolean);
    const code = segments[0] === "invite" ? segments[1] : segments[0];
    if (!code || !/^[A-Za-z0-9_-]{10,80}$/.test(code)) return null;
    return `https://chat.whatsapp.com/${code}`;
  } catch {
    return null;
  }
}

function sanitizeWaJid(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const matched = value.match(/(\d{10,32})@g\.us/i);
  if (matched) return `${matched[1]}@g.us`;
  const digits = value.match(/^(\d{10,32})$/);
  if (digits) return `${digits[1]}@g.us`;
  return null;
}

function normalizeWaInput(args) {
  const inviteUrl = sanitizeWaInvite(args.invite_url ?? args.inviteUrl ?? args.url);
  const jid = sanitizeWaJid(args.jid);
  const notes = String(args.notes || args.notas || "").replace(/\r\n/g, "\n").trim().slice(0, 2000);
  let name = String(args.name || args.nome || "").trim().slice(0, 120);
  if (!name && inviteUrl) {
    try {
      name = `Grupo WhatsApp (${new URL(inviteUrl).pathname.replace(/^\//, "").slice(0, 8)}…)`;
    } catch {
      name = "Grupo WhatsApp";
    }
  }
  if (!name && jid) name = `Grupo WhatsApp (${jid.replace(/@g\.us$/i, "")})`;
  if (!name) return null;
  return { name, inviteUrl, jid, notes };
}

function findWaDuplicate(groups, candidate, exceptId) {
  return groups.find((group) => {
    if (exceptId && group.id === exceptId) return false;
    if (candidate.inviteUrl && group.inviteUrl === candidate.inviteUrl) return true;
    if (candidate.jid && group.jid === candidate.jid) return true;
    return false;
  });
}

export function applyAdicionarWhatsApp(snapshot, args) {
  const normalized = normalizeWaInput(args || {});
  if (!normalized) {
    throw new Error("Informe o nome, o link de convite (chat.whatsapp.com) ou o JID do grupo.");
  }
  const next = clone(snapshot);
  next.board.whatsappGroups = Array.isArray(next.board.whatsappGroups)
    ? next.board.whatsappGroups
    : [];
  const existing = findWaDuplicate(next.board.whatsappGroups, normalized);
  const ts = nowIso();
  if (existing) {
    if (args.name || args.nome) existing.name = normalized.name;
    if (normalized.inviteUrl) existing.inviteUrl = normalized.inviteUrl;
    if (normalized.jid) existing.jid = normalized.jid;
    if (normalized.notes) existing.notes = normalized.notes;
    existing.updatedAt = ts;
    next.board.updatedAt = ts;
    next.updatedAt = ts;
    return { snapshot: next, groupId: existing.id, group: existing };
  }
  const group = {
    id: nid(),
    name: normalized.name,
    inviteUrl: normalized.inviteUrl,
    jid: normalized.jid,
    notes: normalized.notes || undefined,
    addedAt: ts,
    updatedAt: ts,
  };
  next.board.whatsappGroups.push(group);
  next.board.updatedAt = ts;
  next.updatedAt = ts;
  return { snapshot: next, groupId: group.id, group };
}

export function applyAtualizarWhatsApp(snapshot, args) {
  const groupId = args.group_id || args.groupId;
  const next = clone(snapshot);
  next.board.whatsappGroups = Array.isArray(next.board.whatsappGroups)
    ? next.board.whatsappGroups
    : [];
  const group = next.board.whatsappGroups.find((g) => g.id === groupId);
  if (!group) throw new Error("Grupo WhatsApp não encontrado.");
  const merged = normalizeWaInput({
    name: args.name ?? args.nome ?? group.name,
    invite_url: args.invite_url ?? args.inviteUrl ?? group.inviteUrl,
    jid: args.jid ?? group.jid,
    notes: args.notes ?? args.notas ?? group.notes,
  });
  if (!merged) throw new Error("Metadados do grupo inválidos.");
  const clash = findWaDuplicate(next.board.whatsappGroups, merged, group.id);
  if (clash) throw new Error("Já existe outro grupo com o mesmo convite ou JID.");
  const ts = nowIso();
  group.name = merged.name;
  group.inviteUrl = merged.inviteUrl;
  group.jid = merged.jid;
  group.notes = merged.notes || undefined;
  group.updatedAt = ts;
  next.board.updatedAt = ts;
  next.updatedAt = ts;
  return { snapshot: next, groupId: group.id, group };
}

export function applyRemoverWhatsApp(snapshot, args) {
  const groupId = args.group_id || args.groupId;
  const next = clone(snapshot);
  const groups = Array.isArray(next.board.whatsappGroups) ? next.board.whatsappGroups : [];
  if (!groups.some((g) => g.id === groupId)) throw new Error("Grupo WhatsApp não encontrado.");
  next.board.whatsappGroups = groups.filter((g) => g.id !== groupId);
  const ts = nowIso();
  next.board.updatedAt = ts;
  next.updatedAt = ts;
  return { snapshot: next, groupId };
}

export function applyAtualizarResumo(snapshot, args) {
  const text = String(args.resumo ?? args.executive_summary ?? args.executiveSummary ?? "");
  const next = clone(snapshot);
  const summary = text.replace(/\r\n/g, "\n").trim().slice(0, 8000);
  const evolution = absorbBoardEvolution(next.board.evolution, summary);
  next.board.executiveSummary = summary;
  if (evolution.length) next.board.evolution = evolution;
  const ts = nowIso();
  next.board.updatedAt = ts;
  next.updatedAt = ts;
  return { snapshot: next, executiveSummary: next.board.executiveSummary };
}

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const BLOCKED_ATTACHMENT_EXT = new Set(["exe", "bat", "cmd", "com", "scr", "pif", "msi", "dll"]);
const MIME_BY_EXT = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function attachmentExt(name) {
  const base = String(name || "").split(/[\\/]/).pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

function sanitizeAttachmentName(name) {
  const base = String(name || "")
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\u0000-\u001f<>:"|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const cleaned = (base || "arquivo").slice(0, 180);
  return cleaned === "." || cleaned === ".." ? "arquivo" : cleaned;
}

function guessAttachmentMime(name, fallback = "application/octet-stream") {
  return MIME_BY_EXT[attachmentExt(name)] || fallback || "application/octet-stream";
}

function sanitizeAttachmentUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol.toLowerCase())) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function resolveAttachmentInput(args, root) {
  const url = sanitizeAttachmentUrl(args.url);
  const filePath = args.file_path || args.filePath;
  const b64 = args.content_base64 || args.contentBase64;
  const filenameHint = args.filename || args.name;

  if (url && !filePath && !b64) {
    const name = sanitizeAttachmentName(filenameHint || decodeURIComponent(url.split("/").pop() || "link"));
    return {
      kind: "link",
      name,
      mimeType: args.mime_type || args.mimeType || guessAttachmentMime(name, "text/uri-list"),
      size: 0,
      url,
      bytes: null,
    };
  }

  let bytes;
  let name;
  if (filePath) {
    const raw = String(filePath).trim();
    const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(root || process.cwd(), raw);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error(`Arquivo não encontrado: ${raw}`);
    }
    const size = fs.statSync(resolved).size;
    if (size > MAX_ATTACHMENT_BYTES) throw new Error("Arquivo maior que 15 MB.");
    bytes = fs.readFileSync(resolved);
    name = sanitizeAttachmentName(filenameHint || path.basename(resolved));
  } else if (b64) {
    const raw = String(b64).replace(/^data:[^;]+;base64,/, "");
    bytes = Buffer.from(raw, "base64");
    if (!bytes.length) throw new Error("content_base64 vazio.");
    if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error("Arquivo maior que 15 MB.");
    name = sanitizeAttachmentName(filenameHint || "arquivo");
  } else {
    throw new Error("Informe file_path, content_base64 ou url.");
  }

  if (BLOCKED_ATTACHMENT_EXT.has(attachmentExt(name))) {
    throw new Error(`Tipo de arquivo não permitido: ${attachmentExt(name)}`);
  }
  return {
    kind: "file",
    name,
    mimeType: args.mime_type || args.mimeType || guessAttachmentMime(name),
    size: bytes.length,
    url: null,
    bytes,
  };
}

const BLOBS_DDL = `
  CREATE TABLE IF NOT EXISTS card_attachment_blobs (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS card_attachment_blobs_card_idx
    ON card_attachment_blobs (board_id, card_id);
`;

function diskBlobPath(root, boardId, cardId, attachmentId) {
  const data = process.env.USERS_DATA_DIR || path.join(root, "data");
  return path.join(data, "uploads", boardId, cardId, attachmentId);
}

export function listTools() {
  const boardId = { type: "string", description: "Id do board (default: asesi)" };
  const listId = { type: "string", description: "Id da lista" };
  const listTitle = { type: "string", description: "Título da lista (alternativa a list_id)" };
  return [
    {
      name: "jangada_ping",
      description: "Testa persistência do Jangada (Postgres ASESI ou arquivo local).",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "jangada_listar_boards",
      description: "Lista boards do Jangada (id, título, atualização).",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "jangada_ver_board",
      description: "Lê um board. Por padrão devolve visão compacta (listas e cards).",
      inputSchema: {
        type: "object",
        properties: {
          board_id: boardId,
          completo: { type: "boolean", description: "Se true, devolve o snapshot inteiro" },
        },
      },
    },
    {
      name: "jangada_criar_lista",
      description: "Cria uma lista no board para Cursor ou Kiro alimentarem o kanban.",
      inputSchema: {
        type: "object",
        properties: { board_id: boardId, title: { type: "string" } },
        required: ["title"],
      },
    },
    {
      name: "jangada_criar_card",
      description: "Cria um card no board (backlog por padrão). Use para alimentar o Jangada a partir do Cursor ou do Kiro.",
      inputSchema: {
        type: "object",
        properties: {
          board_id: boardId,
          list_id: listId,
          list_title: listTitle,
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          due_date: { type: "string", description: "Fim / prazo YYYY-MM-DD" },
          start_date: { type: "string", description: "Início YYYY-MM-DD" },
          assignee_id: { type: "string" },
          requirement_id: { type: "string" },
          cover_color: {
            type: "string",
            description: "Cor do card (green, yellow, blue, #hex…)",
          },
        },
        required: ["title"],
      },
    },
    {
      name: "jangada_criar_cards",
      description: "Cria vários cards de uma vez no mesmo board.",
      inputSchema: {
        type: "object",
        properties: {
          board_id: boardId,
          cards: {
            type: "array",
            items: {
              type: "object",
              properties: {
                list_id: listId,
                list_title: listTitle,
                title: { type: "string" },
                description: { type: "string" },
                priority: { type: "string" },
                due_date: { type: "string" },
                start_date: { type: "string" },
              },
              required: ["title"],
            },
          },
        },
        required: ["cards"],
      },
    },
    {
      name: "jangada_atualizar_card",
      description: "Atualiza título, descrição, prioridade, início, prazo ou responsável de um card.",
      inputSchema: {
        type: "object",
        properties: {
          board_id: boardId,
          card_id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          due_date: { type: "string" },
          start_date: { type: "string" },
          assignee_id: { type: "string" },
          cover_color: { type: "string" },
        },
        required: ["card_id"],
      },
    },
    {
      name: "jangada_mover_card",
      description: "Move um card para outra lista (por id ou título).",
      inputSchema: {
        type: "object",
        properties: {
          board_id: boardId,
          card_id: { type: "string" },
          list_id: listId,
          list_title: listTitle,
        },
        required: ["card_id"],
      },
    },
    {
      name: "jangada_criar_requisito",
      description: "Cria um requisito no board, com payload MCP para handoff Cursor/Kiro.",
      inputSchema: {
        type: "object",
        properties: {
          board_id: boardId,
          code: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          status: { type: "string" },
        },
        required: ["code", "title"],
      },
    },
    {
      name: "jangada_adicionar_git",
      description: "Liga um repositório Git ao board para a Maya analisar o que já está implementado.",
      inputSchema: {
        type: "object",
        properties: {
          board_id: boardId,
          url: { type: "string", description: "URL HTTPS do Git ou caminho local" },
        },
        required: ["url"],
      },
    },
    {
      name: "jangada_adicionar_whatsapp",
      description:
        "Vincula um grupo WhatsApp ao board (nome, link de convite chat.whatsapp.com e/ou JID 1203…@g.us).",
      inputSchema: {
        type: "object",
        properties: {
          board_id: boardId,
          name: { type: "string", description: "Nome do grupo" },
          invite_url: { type: "string", description: "Link https://chat.whatsapp.com/…" },
          jid: { type: "string", description: "JID do grupo, ex.: 120363430202949653@g.us" },
          notes: { type: "string", description: "Notas / metadados livres" },
        },
      },
    },
    {
      name: "jangada_atualizar_whatsapp",
      description: "Edita metadados de um grupo WhatsApp já vinculado ao board.",
      inputSchema: {
        type: "object",
        properties: {
          board_id: boardId,
          group_id: { type: "string" },
          name: { type: "string" },
          invite_url: { type: "string" },
          jid: { type: "string" },
          notes: { type: "string" },
        },
        required: ["group_id"],
      },
    },
    {
      name: "jangada_remover_whatsapp",
      description: "Remove o vínculo de um grupo WhatsApp com o board.",
      inputSchema: {
        type: "object",
        properties: {
          board_id: boardId,
          group_id: { type: "string" },
        },
        required: ["group_id"],
      },
    },
    {
      name: "jangada_atualizar_resumo",
      description:
        "Guarda o resumo executivo do board (texto livre para a liderança: situação, prioridades e riscos).",
      inputSchema: {
        type: "object",
        properties: {
          board_id: boardId,
          resumo: {
            type: "string",
            description: "Texto do resumo executivo (máx. 8000 caracteres). Vazio apaga o resumo.",
          },
        },
        required: ["resumo"],
      },
    },
    {
      name: "jangada_anexar_arquivo",
      description:
        "Anexa um arquivo a um card. Prefira file_path (caminho local). Alternativas: content_base64+filename (máx. 15 MB) ou url (só o link, sem copiar).",
      inputSchema: {
        type: "object",
        properties: {
          board_id: boardId,
          card_id: { type: "string", description: "Id do card" },
          file_path: { type: "string", description: "Caminho local do arquivo" },
          filename: { type: "string", description: "Nome visível do anexo" },
          mime_type: { type: "string" },
          content_base64: {
            type: "string",
            description: "Conteúdo em base64. Prefira file_path para arquivos grandes.",
          },
          url: { type: "string", description: "Link https para anexar sem copiar o arquivo" },
        },
        required: ["card_id"],
      },
    },
    {
      name: "jangada_remover_anexo",
      description: "Remove um anexo de um card.",
      inputSchema: {
        type: "object",
        properties: {
          board_id: boardId,
          card_id: { type: "string" },
          attachment_id: { type: "string" },
        },
        required: ["card_id", "attachment_id"],
      },
    },
  ];
}

export function boardIdOf(args) {
  return String(args?.board_id || args?.boardId || ASESI_BOARD_ID).trim() || ASESI_BOARD_ID;
}

export async function callTool(name, args, store) {
  try {
    if (name === "jangada_ping") return store.ping();
    if (name === "jangada_listar_boards") return { boards: await store.listBoards() };

    const boardId = boardIdOf(args || {});
    if (name === "jangada_ver_board") {
      const snapshot = await store.getBoard(boardId);
      if (!snapshot) return { status: "erro", erro: `Board ${boardId} não encontrado` };
      return args?.completo ? { snapshot } : compactBoard(snapshot);
    }

    const snapshot = await store.getBoard(boardId);
    if (!snapshot) return { status: "erro", erro: `Board ${boardId} não encontrado` };

    let result;
    let blobToDelete = null;
    if (name === "jangada_criar_lista") result = applyCriarLista(snapshot, args);
    else if (name === "jangada_criar_card") result = applyCriarCard(snapshot, args);
    else if (name === "jangada_criar_cards") result = applyCriarCards(snapshot, args.cards);
    else if (name === "jangada_atualizar_card") result = applyAtualizarCard(snapshot, args);
    else if (name === "jangada_mover_card") result = applyMoverCard(snapshot, args);
    else if (name === "jangada_criar_requisito") result = applyCriarRequisito(snapshot, args);
    else if (name === "jangada_adicionar_git") result = applyAdicionarGit(snapshot, args);
    else if (name === "jangada_adicionar_whatsapp") result = applyAdicionarWhatsApp(snapshot, args);
    else if (name === "jangada_atualizar_whatsapp") result = applyAtualizarWhatsApp(snapshot, args);
    else if (name === "jangada_remover_whatsapp") result = applyRemoverWhatsApp(snapshot, args);
    else if (name === "jangada_atualizar_resumo") result = applyAtualizarResumo(snapshot, args);
    else if (name === "jangada_anexar_arquivo") {
      const cardId = args.card_id || args.cardId;
      if (!snapshot.cards?.[cardId]) throw new Error("Card não encontrado.");
      const input = resolveAttachmentInput(args, store.root);
      const id = nid();
      const attachment = {
        id,
        name: input.name,
        mimeType: input.mimeType,
        size: input.size,
        kind: input.kind,
        url:
          input.kind === "link"
            ? input.url
            : `/api/boards/${boardId}/cards/${cardId}/attachments/${id}`,
        createdAt: nowIso(),
      };
      if (input.kind === "file" && input.bytes) {
        await store.saveAttachmentBlob({
          id,
          boardId,
          cardId,
          name: input.name,
          mimeType: input.mimeType,
          bytes: input.bytes,
        });
      }
      result = applyAnexarArquivo(snapshot, { card_id: cardId, attachment });
    } else if (name === "jangada_remover_anexo") {
      result = applyRemoverAnexo(snapshot, args);
      if (result.attachment?.kind !== "link") blobToDelete = result.attachment;
    }
    else return { status: "erro", erro: `Tool desconhecida: ${name}` };

    await store.saveBoard(result.snapshot);
    await store.touchActor(boardId);
    if (blobToDelete) {
      await store.deleteAttachmentBlob({
        id: blobToDelete.id,
        boardId,
        cardId: result.cardId,
      });
    }
    const { snapshot: _ignored, ...rest } = result;
    return { status: "ok", board_id: boardId, ...rest, board: compactBoard(result.snapshot) };
  } catch (err) {
    return { status: "erro", erro: err instanceof Error ? err.message : String(err) };
  }
}

export function loadEnvFile(root, file) {
  const envPath = path.join(root, file);
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const eq = line.indexOf("=");
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

export function pgConfigured() {
  if (process.env.DATABASE_URL?.trim()) return true;
  return Boolean(
    process.env.PG_HOST?.trim() &&
      process.env.PG_DATABASE?.trim() &&
      process.env.PG_USER?.trim() &&
      process.env.PG_PASSWORD,
  );
}

export function createPgStore(root) {
  const schema = (process.env.PG_SCHEMA || "trelloai").toLowerCase();
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) {
    throw new Error(`PG_SCHEMA inválido: ${schema}`);
  }
  const sslRaw = (process.env.PG_SSL || process.env.PGSSLMODE || "").toLowerCase();
  const ssl = ["1", "true", "require", "on"].includes(sslRaw)
    ? { rejectUnauthorized: false }
    : false;
  const config = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl, connectionTimeoutMillis: 8000 }
    : {
        host: process.env.PG_HOST,
        port: Number(process.env.PG_PORT || 5432),
        database: process.env.PG_DATABASE,
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        ssl,
        connectionTimeoutMillis: 8000,
      };
  const pool = new pg.Pool(config);
  const actor = (
    process.env.MCP_ACTOR_EMAIL ||
    process.env.ADMIN_EMAIL ||
    "admin@cge.ce.gov.br"
  )
    .trim()
    .toLowerCase();

  async function withSchema(fn) {
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO ${schema}, public`);
      return await fn(client);
    } finally {
      client.release();
    }
  }

  return {
    kind: "postgres",
    actor,
    root,
    async ping() {
      return withSchema(async (client) => {
        const row = await client.query("SELECT current_database() AS db, current_schema() AS schema");
        return {
          ok: true,
          store: "postgres",
          database: row.rows[0]?.db,
          schema: row.rows[0]?.schema,
          actor,
          root,
        };
      });
    },
    async listBoards() {
      return withSchema(async (client) => {
        const res = await client.query(
          `SELECT board_id, snapshot->'board'->>'title' AS title, updated_at
           FROM board_snapshots ORDER BY updated_at DESC`,
        );
        return res.rows.map((row) => ({
          id: row.board_id,
          title: row.title,
          updatedAt: row.updated_at,
        }));
      });
    },
    async getBoard(boardId) {
      return withSchema(async (client) => {
        const res = await client.query("SELECT snapshot FROM board_snapshots WHERE board_id = $1", [
          boardId,
        ]);
        return res.rows[0]?.snapshot ?? null;
      });
    },
    async saveBoard(snapshot) {
      return withSchema(async (client) => {
        await client.query(
          `INSERT INTO board_snapshots (board_id, snapshot, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (board_id) DO UPDATE SET snapshot = $2::jsonb, updated_at = NOW()`,
          [snapshot.board.id, JSON.stringify(snapshot)],
        );
      });
    },
    async touchActor(boardId) {
      return withSchema(async (client) => {
        await client.query(
          `INSERT INTO board_memberships (email, board_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [actor, boardId],
        );
      });
    },
    async saveAttachmentBlob(opts) {
      return withSchema(async (client) => {
        await client.query(BLOBS_DDL);
        await client.query(
          `INSERT INTO card_attachment_blobs (id, board_id, card_id, name, mime_type, byte_size, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             board_id = EXCLUDED.board_id,
             card_id = EXCLUDED.card_id,
             name = EXCLUDED.name,
             mime_type = EXCLUDED.mime_type,
             byte_size = EXCLUDED.byte_size,
             data = EXCLUDED.data`,
          [opts.id, opts.boardId, opts.cardId, opts.name, opts.mimeType, opts.bytes.length, opts.bytes],
        );
      });
    },
    async deleteAttachmentBlob(opts) {
      return withSchema(async (client) => {
        await client.query(BLOBS_DDL);
        await client.query(
          "DELETE FROM card_attachment_blobs WHERE id = $1 AND board_id = $2 AND card_id = $3",
          [opts.id, opts.boardId, opts.cardId],
        );
      });
    },
    async close() {
      await pool.end();
    },
  };
}

export function createFileStore(root) {
  const file = path.join(root, "data", "shared-boards.json");
  const actor = (
    process.env.MCP_ACTOR_EMAIL ||
    process.env.ADMIN_EMAIL ||
    "admin@cge.ce.gov.br"
  )
    .trim()
    .toLowerCase();

  function read() {
    if (!fs.existsSync(file)) return { boards: {}, memberships: {} };
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return { boards: {}, memberships: {} };
    }
  }

  function write(store) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(store, null, 2), "utf8");
  }

  return {
    kind: "file",
    actor,
    root,
    async ping() {
      return { ok: true, store: "file", file, actor, root };
    },
    async listBoards() {
      const store = read();
      return Object.values(store.boards || {}).map((snap) => ({
        id: snap.board?.id,
        title: snap.board?.title,
        updatedAt: snap.updatedAt,
      }));
    },
    async getBoard(boardId) {
      return read().boards?.[boardId] ?? null;
    },
    async saveBoard(snapshot) {
      const store = read();
      store.boards = store.boards || {};
      store.boards[snapshot.board.id] = snapshot;
      write(store);
    },
    async touchActor(boardId) {
      const store = read();
      store.memberships = store.memberships || {};
      const current = new Set(store.memberships[actor] || []);
      current.add(boardId);
      store.memberships[actor] = [...current];
      write(store);
    },
    async saveAttachmentBlob(opts) {
      const filePath = diskBlobPath(root, opts.boardId, opts.cardId, opts.id);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, opts.bytes);
    },
    async deleteAttachmentBlob(opts) {
      const filePath = diskBlobPath(root, opts.boardId, opts.cardId, opts.id);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    },
    async close() {},
  };
}
