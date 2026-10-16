import type { Page } from "@playwright/test";

/**
 * Answers every subgraph query as for an account the index has never seen. The setup page measures a
 * `deposit` link from the balance it first reads, so it offers nothing while the subgraph fails.
 * CI points the subgraph at placeholder.invalid, which the page's connect-src CSP refuses before any
 * route can answer: a spec that calls this sets `test.use({ bypassCSP: true })`. Real mode reads the
 * real subgraph instead.
 */
export async function answerEmptySubgraph(page: Page) {
  if (process.env.E2E_MODE === "real") return;
  await page.route(
    // CI points the subgraph at placeholder.invalid; a local .env points it at Goldsky.
    (url) => url.hostname === "api.goldsky.com" || url.hostname === "placeholder.invalid",
    (route) => route.fulfill({ json: { data: { accounts: [], userTokens: [], operatorApprovals: [] } } }),
  );
}
