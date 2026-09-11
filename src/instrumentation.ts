/**
 * Next.js Instrumentation — executado uma vez na inicialização do servidor.
 *
 * Usa o hook register() para carregar secrets do AWS Secrets Manager
 * antes de qualquer request ser processado.
 *
 * Ref: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register(): Promise<void> {
  // Só executa no servidor (não no edge runtime)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { loadSecrets } = await import("@/lib/secrets");
    await loadSecrets();
  } catch (err) {
    console.error(
      "[secrets] falhou ao carregar o cofre; o servidor sobe com as env do container.",
      err instanceof Error ? err.message : err,
    );
  }

  try {
    const { startMayaGitScheduler } = await import("@/lib/maya-git-scheduler");
    startMayaGitScheduler();
  } catch (err) {
    console.error(
      "[maya-git] scheduler não iniciou",
      err instanceof Error ? err.message : err,
    );
  }
}
