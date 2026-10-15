/** Which link params the page leaves in the URL, and which it drops. */
import { act, create } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { TopUpActivityProvider } from "@/components/UserConsole/providers/TopUpActivityContext";
import SessionKeysPage from "./page";

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useConnection: () => ({ address: undefined, chainId: 314159 }),
}));
vi.mock("@/components/UserConsole/SessionKeysSection", () => ({ default: () => null }));

afterEach(() => vi.unstubAllGlobals());

it.each([
  ["a bad address", "?revoke=nope&network=calibration"],
  ["no network", "?revoke=0x00000000000000000000000000000000000000bb"],
])("drops a revoke link with %s", async (_case, search) => {
  const replaceState = vi.fn();
  vi.stubGlobal("window", {
    location: { pathname: "/console/session-keys", search, hash: "" },
    history: { replaceState },
  });

  await act(async () => {
    create(
      <TopUpActivityProvider>
        <SessionKeysPage />
      </TopUpActivityProvider>,
    );
  });

  expect(replaceState).toHaveBeenCalledWith(null, "", "/console/session-keys");
});

it.each([
  [
    "a usable revoke link for the section to act on",
    "?revoke=0x00000000000000000000000000000000000000bb&network=calibration",
  ],
  // A network or account switch can remount the page; the link must still be there.
  [
    "an authorize link in the URL",
    "?authorize=0x00000000000000000000000000000000000000bb&scopes=createDataSet&network=calibration",
  ],
])("leaves %s", async (_case, search) => {
  const replaceState = vi.fn();
  vi.stubGlobal("window", {
    location: { pathname: "/console/session-keys", search, hash: "" },
    history: { replaceState },
  });

  await act(async () => {
    create(
      <TopUpActivityProvider>
        <SessionKeysPage />
      </TopUpActivityProvider>,
    );
  });

  expect(replaceState).not.toHaveBeenCalled();
});
