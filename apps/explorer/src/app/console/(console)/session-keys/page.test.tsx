/** The page drops a revoke link nothing can act on, so a reload does not report it again. */
import { act, create } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
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
    create(<SessionKeysPage />);
  });

  expect(replaceState).toHaveBeenCalledWith(null, "", "/console/session-keys");
});

it("leaves a usable revoke link for the section to act on", async () => {
  const replaceState = vi.fn();
  vi.stubGlobal("window", {
    location: {
      pathname: "/console/session-keys",
      search: "?revoke=0x00000000000000000000000000000000000000bb&network=calibration",
      hash: "",
    },
    history: { replaceState },
  });

  await act(async () => {
    create(<SessionKeysPage />);
  });

  expect(replaceState).not.toHaveBeenCalled();
});
