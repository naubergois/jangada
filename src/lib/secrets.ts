/**
 * AWS Secrets Manager integration.
 *
 * Busca um secret (JSON) e injeta os campos em process.env.
 * Chamado uma vez no instrumentation.ts (register), antes de qualquer request.
 *
 * Variáveis de controle (env):
 *   AWS_SECRET_NAME  — nome ou ARN do secret no Secrets Manager (obrigatório para ativar)
 *   AWS_REGION       — região AWS (default: sa-east-1)
 *
 * O secret deve ser um JSON cujas chaves correspondem às env vars do app.
 * Exemplo de valor no Secrets Manager:
 * {
 *   "PG_HOST": "192.168.3.26",
 *   "PG_PORT": "5432",
 *   "PG_DATABASE": "h_asesi",
 *   "PG_USER": "asesi_jangada",
 *   "PG_PASSWORD": "minha-senha",
 *   "PG_SCHEMA": "trelloai",
 *   "PG_SSL": "0",
 *   "AUTH_SECRET": "...",
 *   "DEEPSEEK_API_KEY": "...",
 *   "ADMIN_EMAIL": "admin@cge.ce.gov.br",
 *   "ADMIN_PASSWORD": "...",
 *   "ADMIN_USERNAME": "admin"
 * }
 *
 * Campos que já estiverem definidos em process.env NÃO serão sobrescritos,
 * permitindo override local via .env.local em desenvolvimento.
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

let loaded = false;

/**
 * Busca o secret e popula process.env (apenas campos que ainda não existem).
 * É idempotente — chamadas subsequentes são no-op.
 */
export async function loadSecrets(): Promise<void> {
  if (loaded) return;

  const secretName = process.env.AWS_SECRET_NAME?.trim();
  if (!secretName) {
    // Sem AWS_SECRET_NAME, a feature fica desabilitada — usa env vars normais.
    loaded = true;
    return;
  }

  const region = process.env.AWS_REGION?.trim() || "sa-east-1";

  try {
    const client = new SecretsManagerClient({ region });
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretName }),
    );

    const secretString = response.SecretString;
    if (!secretString) {
      throw new Error(
        `Secret "${secretName}" não contém SecretString (binary secrets não são suportados).`,
      );
    }

    let secrets: Record<string, string>;
    try {
      secrets = JSON.parse(secretString) as Record<string, string>;
    } catch {
      throw new Error(
        `Secret "${secretName}" não é um JSON válido. Esperado: objeto com chaves = nomes de env vars.`,
      );
    }

    // Injeta no process.env sem sobrescrever valores já definidos.
    for (const [key, value] of Object.entries(secrets)) {
      if (typeof value === "string" && !process.env[key]) {
        process.env[key] = value;
      }
    }

    loaded = true;
    console.log(
      `[secrets] Loaded ${Object.keys(secrets).length} keys from AWS Secrets Manager (${secretName}).`,
    );
  } catch (err) {
    // Homolog: cofre/rede instável não pode derrubar o processo — senão o
    // Swarm esgota max_attempts e o Traefik some a rota (404).
    loaded = true;
    console.error(
      `[secrets] Cofre indisponível (${secretName}). Servidor sobe com as env do container.`,
      err instanceof Error ? err.message : err,
    );
  }
}
