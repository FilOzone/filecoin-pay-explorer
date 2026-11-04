/** A link's params are read on mount and stay in the URL until something acts on them. */
import assert from "node:assert/strict";
import { act, create } from "react-test-renderer";
import { afterEach, describe, it, vi } from "vitest";
import { dropSearchParams, useLinkSearchParams } from "./useLinkSearchParams";

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
function mount(keys: string[]) {
  const read: { params: URLSearchParams | null } = { params: null };
  const Probe = () => {
    read.params = useLinkSearchParams(keys);
    return null;
  };
  act(() => {
    create(<Probe />);
  });
  return read.params;
}

describe("useLinkSearchParams", () => {
  it("reads the whole query and leaves it in the URL, the network it needs included", () => {
    const win = fakeWindow("?revoke=0xabc&network=calibration");

    const seen = mount(["revoke"]);

    assert.equal(seen?.get("revoke"), "0xabc");
    assert.equal(seen?.get("network"), "calibration");
    assert.equal(win.location.search, "?revoke=0xabc&network=calibration");
    assert.equal(win.history.replaceState.mock.calls.length, 0);
  });

  it("reads nothing when the query names none of them", () => {
    const win = fakeWindow("?unrelated=1");

    const seen = mount(["revoke"]);

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
