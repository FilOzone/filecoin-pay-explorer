// @vitest-environment jsdom
/** Which `?authorize=` links the page leaves in the URL, and which it drops. */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TopUpActivityProvider } from "@/components/UserConsole/providers/TopUpActivityContext";
import SessionKeysPage from "./page";

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useConnection: () => ({ address: undefined, chainId: 314159 }),
}));
vi.mock("@/components/UserConsole/SessionKeysSection", () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

async function openAt(search: string) {
  window.history.replaceState(null, "", `/console/session-keys${search}`);
  await act(async () => {
    render(
      <TopUpActivityProvider>
        <SessionKeysPage />
      </TopUpActivityProvider>,
    );
  });
  return window.location.search;
}

it("leaves a usable authorize link in the URL, so a network or account switch that remounts the page keeps it", async () => {
  const search = "?authorize=0x00000000000000000000000000000000000000bb&scopes=createDataSet&network=calibration";

  expect(await openAt(search)).toBe(search);
});

it.each([
  ["a bad address", "?authorize=nope&scopes=createDataSet&network=calibration"],
  ["no network", "?authorize=0x00000000000000000000000000000000000000bb&scopes=createDataSet"],
  ["no scopes", "?authorize=0x00000000000000000000000000000000000000bb&network=calibration"],
])("drops an authorize link with %s, so a reload does not report it again", async (_case, search) => {
  expect(await openAt(search)).toBe("");
});
