import { expect, test } from '@playwright/test';

test('depois do primeiro acesso, o jogo abre sem internet (Service Worker só na pasta da release)', async ({
  page,
  context,
}) => {
  await page.goto('./');
  await page.getByTestId('btn-jogar').waitFor();

  // O SW controla só a pasta desta release (/hml/ ou /releases/<sha>/), nunca a raiz.
  const escopo = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(escopo).pathname).toBe(new URL('./', page.url()).pathname);

  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  // Nada fora da pasta (raiz, rollout.json) vai para o cache.
  const guardados = await page.evaluate(async (pasta) => {
    const urls: string[] = [];
    for (const nome of await caches.keys()) {
      if (!nome.startsWith(`sinal-aberto|${pasta}|`)) continue;
      for (const pedido of await (await caches.open(nome)).keys()) urls.push(pedido.url);
    }
    return urls;
  }, escopo);
  expect(guardados.length).toBeGreaterThan(0);
  expect(guardados.every((url) => url.startsWith(escopo))).toBe(true);
  expect(guardados.some((url) => url.endsWith('rollout.json'))).toBe(false);

  await context.setOffline(true);
  try {
    await page.reload();
    await page.getByTestId('btn-jogar').click();
    await page.getByTestId('btn-fase-1').click();
    await page.getByTestId('btn-comecar').click();
    await page.getByTestId('bloco-abrir-norte').click();
    await expect(page.getByTestId('linha-1')).toContainText('abrirSinal("Norte")'); // a linha também tem o botão ✕ de apagar
  } finally {
    await context.setOffline(false);
  }
});
