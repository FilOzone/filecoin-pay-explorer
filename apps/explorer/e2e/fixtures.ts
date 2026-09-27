import { test as base, expect } from "@playwright/test";
import { installFakeChain } from "./fake-chain";

export { expect };

/**
 * Mock mode never leaves the machine: the fake chain answers RPC, Plausible gets an empty script, and any other
 * request off localhost is blocked and fails the test. Real mode (E2E_MODE=real) talks to the network as is.
 */
export const test = base.extend<{ noNetwork: undefined }>({
  noNetwork: [
    async ({ context, page }, use) => {
      if (process.env.E2E_MODE === "real") return use(undefined);
      const blocked: string[] = [];
      await context.route(
        (url) => url.hostname !== "localhost",
        (route) => {
          const request = route.request();
          if (new URL(request.url()).hostname === "plausible.io") {
            return route.fulfill({ contentType: "text/javascript", body: "" });
          }
          blocked.push(`${request.method()} ${request.url()} ${request.postData()?.slice(0, 120) ?? ""}`.trim());
          return route.abort("blockedbyclient");
        },
      );
      await installFakeChain(page);
      await use(undefined);
      // Balance polls can still be mid-answer when the test ends.
      await page.unrouteAll({ behavior: "ignoreErrors" });
      expect(blocked, "requests that would have left the machine").toEqual([]);
    },
    { auto: true },
  ],
});
