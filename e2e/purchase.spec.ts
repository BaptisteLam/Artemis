import { expect, test } from '@playwright/test';

const API = 'http://localhost:8787';

test('parcours complet en Sandbox : inscription → agent → demande → passkey → carte → paiement', async ({ page, request, context }) => {
  // Authentificateur WebAuthn virtuel (Face ID simulé)
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });

  const email = `alice+${Date.now()}@exemple.fr`;
  await page.goto('/signup?lang=fr'); // parcours en français ; l'anglais est vérifié par les tests de composants
  await page.getByLabel('Email professionnel').fill(email);
  await page.getByRole('button', { name: 'Entrer (mode dev)' }).click();

  // Onboarding
  await expect(page.getByRole('heading', { name: 'Votre organisation' })).toBeVisible();
  await page.getByLabel("Nom de l'entreprise ou du studio").fill('Studio Test');
  await page.getByRole('button', { name: 'Continuer →' }).click();
  await page.getByLabel("Nom de l'agent").fill('notion.agent');
  await page.getByRole('button', { name: "Créer l'agent →" }).click();
  const token = (await page.locator('.token-box').textContent())!.trim();
  expect(token).toMatch(/^art_test_/);
  await page.getByRole('button', { name: "J'ai copié le jeton →" }).click();
  await page.getByRole('button', { name: 'Enregistrer une passkey' }).click();
  await expect(page.getByText('Passkey enregistrée.')).toBeVisible();
  await page.getByRole('button', { name: 'Ouvrir le tableau de bord →' }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();

  // L'agent demande une carte (API REST)
  const auth = { Authorization: `Bearer ${token}` };
  const created = await request.post(`${API}/v1/card-requests`, { headers: auth, data: { amount: 4900, merchant: 'Notion', purpose: 'abonnement équipe' } });
  expect(created.status()).toBe(201);
  const { request_id, status } = await created.json();
  expect(status).toBe('pending_approval');

  // L'humain valide avec sa passkey
  await page.goto('/requests');
  await page.getByRole('link', { name: /Notion/ }).first().click();
  await page.getByRole('button', { name: 'Approuver avec ma passkey' }).click();
  await expect(page.getByText('Mandat signé par passkey')).toBeVisible();

  // L'agent récupère un lien éphémère (le numéro ne passe pas par Artemis), l'ouvre une seule fois
  const reveal = await request.post(`${API}/v1/card-requests/${request_id}/reveal`, { headers: auth });
  expect(reveal.status()).toBe(200);
  const link = await reveal.json();
  expect(link.delivery).toBe('issuer_link');
  expect(JSON.stringify(link)).not.toMatch(/\d{16}/);
  const agentPage = await context.newPage();
  await agentPage.goto(link.checkout_url);
  await agentPage.getByRole('button', { name: /Afficher la carte/ }).click();
  await expect(agentPage.getByTestId('card-number')).toHaveText(/^\d{4} \d{4} \d{4} \d{4}$/);
  await agentPage.reload();
  await expect(agentPage.getByText(/déjà utilisé ou expiré/)).toBeVisible();
  await agentPage.close();
  expect((await request.post(`${API}/v1/card-requests/${request_id}/reveal`, { headers: auth })).status()).toBe(409);

  // Paiement simulé puis rapprochement
  await page.reload();
  await page.getByRole('button', { name: 'Simuler un paiement' }).click();
  await expect(page.getByText('Rapprochée')).toBeVisible();
  await expect(page.getByText('Payée')).toBeVisible();
});
