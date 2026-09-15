/**
 * The hook decides what survives a mount. A kept param has to, because the
 * owner may need to switch networks before the page can act on it, and a
 * remount mid-switch would otherwise lose the request for good.
 */
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
  // A holder, not a plain local: TypeScript cannot see the closure run and
  // would narrow a `let` to its initial value.
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
    // Both survive: a revoke link is useless without the network it names, and
    // switching networks can remount this page.
    assert.equal(win.location.search, "?revoke=0xabc&network=calibration");
  });

  it("reads a kept param even when no consumed one is present, so a bad link can still be reported", () => {
    // `?revoke=` with no network is malformed. Reading it lets the page say so
    // rather than render a page that looks like it ignored the click.
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
