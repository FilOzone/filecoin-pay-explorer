/** What survives a mount: consumed params go, kept ones stay. */
import assert from "node:assert/strict";
import { act, create } from "react-test-renderer";
import { afterEach, describe, it, vi } from "vitest";
import { dropSearchParams, useConsumedSearchParams } from "./useConsumedSearchParams";

const original = globalThis.window;

afterEach(() => {
  if (original === undefined) Reflect.deleteProperty(globalThis, "window");
  else globalThis.window = original;
});

/** A window whose location and history behave like a browser's for search params. */
function fakeWindow(search: string) {
  const replaceState = vi.fn((_s: unknown, _t: string, url: string) => {
    const [pathname, query = ""] = url.split("?");
    win.location.pathname = pathname;
    win.location.search = query ? `?${query}` : "";
  });
  const win = { location: { pathname: "/console/session-keys", search, hash: "" }, history: { replaceState } };
  globalThis.window = win as unknown as Window & typeof globalThis;
  return win;
}

/** Mount the hook once and hand back what it read. */
function mount(keys: string[], keep?: string[]) {
  const read: { params: URLSearchParams | null } = { params: null };
  const Probe = () => {
    read.params = useConsumedSearchParams(keys, keep);
    return null;
  };
  act(() => {
    create(<Probe />);
  });
  return read.params;
}

describe("useConsumedSearchParams", () => {
  it("reads the named params and strips them", () => {
    const win = fakeWindow("?authorize=0xabc&scopes=createDataSet&network=mainnet");

    const seen = mount(["authorize", "scopes", "network"]);

    assert.equal(seen?.get("authorize"), "0xabc");
    assert.equal(win.location.search, "");
  });

  it("leaves a kept param in the URL, and the network it needs with it", () => {
    const win = fakeWindow("?revoke=0xabc&network=calibration");

    const seen = mount(["authorize", "scopes", "network"], ["revoke"]);

    assert.equal(seen?.get("revoke"), "0xabc");
    assert.equal(win.location.search, "?revoke=0xabc&network=calibration");
  });

  it("reads a kept param even when no consumed one is present, so a bad link can still be reported", () => {
    const win = fakeWindow("?revoke=0xabc");

    const seen = mount(["authorize", "scopes", "network"], ["revoke"]);

    assert.equal(seen?.get("revoke"), "0xabc");
    assert.equal(win.location.search, "?revoke=0xabc");
  });

  it("reads nothing when the query names none of them", () => {
    const win = fakeWindow("?unrelated=1");

    const seen = mount(["authorize", "scopes", "network"], ["revoke"]);

    assert.equal(seen, null);
    assert.equal(win.location.search, "?unrelated=1");
  });
});

describe("dropSearchParams", () => {
  it("removes only the named params", () => {
    const win = fakeWindow("?revoke=0xabc&network=calibration&keep=me");

    dropSearchParams(["revoke", "network"]);

    assert.equal(win.location.search, "?keep=me");
  });

  it("leaves the URL alone when none of them are there", () => {
    const win = fakeWindow("?keep=me");

    dropSearchParams(["revoke", "network"]);

    assert.equal(win.history.replaceState.mock.calls.length, 0);
  });

  it("drops the query entirely when nothing is left", () => {
    const win = fakeWindow("?revoke=0xabc&network=mainnet");

    dropSearchParams(["revoke", "network"]);

    assert.equal(win.location.search, "");
  });
});
