import { setTimeout as delay } from 'node:timers/promises';

const registry = 'https://registry.npmjs.org';

async function checkVersion(target, requestTimeoutMs, registryUrl) {
  const url = `${registryUrl}/${encodeURIComponent(target.name)}/${encodeURIComponent(target.version)}`;
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const retryable =
        response.status === 404 ||
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500;
      return { state: retryable ? 'pending' : 'error', reason: `registry HTTP ${response.status}` };
    }
    const metadata = await response.json();
    if (metadata?.name !== target.name || metadata?.version !== target.version) {
      return { state: 'error', reason: 'registry returned mismatched package metadata' };
    }
    return { state: 'confirmed' };
  } catch (error) {
    if (error instanceof SyntaxError)
      return { state: 'error', reason: 'registry returned invalid JSON' };
    return { state: 'pending', reason: `registry request failed: ${error.message}` };
  }
}

/** Share one deadline across the release; retry only versions not yet confirmed. */
export async function waitForRegistryVersions(
  targets,
  {
    timeoutMs = 600_000,
    intervalMs = 10_000,
    requestTimeoutMs = 15_000,
    registryUrl = registry,
    log = console.log,
  } = {},
) {
  for (const [name, value] of Object.entries({ timeoutMs, intervalMs, requestTimeoutMs })) {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error(`${name} must be a positive safe integer`);
  }
  const deadline = performance.now() + timeoutMs;
  const confirmed = [];
  const errors = [];
  let pending = targets.map((target) => ({ target, reason: 'not checked' }));
  while (pending.length > 0) {
    const remaining = Math.floor(deadline - performance.now());
    if (remaining <= 0) break;
    const results = await Promise.all(
      pending.map(async ({ target }) => ({
        target,
        ...(await checkVersion(target, Math.min(requestTimeoutMs, remaining), registryUrl)),
      })),
    );
    pending = [];
    for (const result of results) {
      if (result.state === 'confirmed') {
        confirmed.push(result.target);
        log(`npm version confirmed: ${result.target.name}@${result.target.version}`);
      } else if (result.state === 'error') {
        errors.push(result);
      } else {
        pending.push(result);
      }
    }
    if (errors.length > 0 || pending.length === 0) break;
    const waitMs = Math.min(intervalMs, Math.floor(deadline - performance.now()));
    if (waitMs <= 0) break;
    log(
      `Waiting for npm visibility (${Math.ceil((deadline - performance.now()) / 1000)}s remaining): ${pending.map(({ target, reason }) => `${target.name}@${target.version} (${reason})`).join(', ')}`,
    );
    await delay(waitMs);
  }
  return { confirmed, pending, errors };
}
