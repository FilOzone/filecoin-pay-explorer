import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionKeyRecord } from "@/utils/sessionKeys";
import { type SessionKeyWithStatus, useSessionKeys } from "./useSessionKeys";

const ACCOUNT = "0xF39FD6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const SIGNER_A = "0x8ba1f109551bD432803012645Ac136ddd64DBA72" as const;
const SIGNER_B = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const STORAGE_KEY = `fp-session-keys:calibration:${ACCOUNT.toLowerCase()}`;

// One entry per record scope, in record order, the shape useReadContracts returns.
const chain = vi.hoisted(() => ({ reads: undefined as { status: "success"; result: bigint }[] | undefined }));

vi.mock("wagmi", () => ({
  useReadContracts: () => ({ data: chain.reads, refetch: vi.fn() }),
}));

type Hook = ReturnType<typeof useSessionKeys>;
const Probe = ({ onRender }: { onRender: (hook: Hook) => void }) => {
  onRender(useSessionKeys("calibration", ACCOUNT));
  return null;
};

function mount() {
  let latest: Hook | undefined;
  act(() => {
    create(<Probe onRender={(hook) => (latest = hook)} />);
  });
  return () => latest as Hook;
}

const record = (sessionKeyPublic: `0x${string}`, scopes: SessionKeyRecord["scopes"]): SessionKeyRecord => ({
  name: sessionKeyPublic.slice(0, 6),
  sessionKeyPublic,
  scopes,
  createdAt: 1,
});

const statuses = (keys: SessionKeyWithStatus[]) => keys.map((k) => [k.sessionKeyPublic, k.status]);

describe("useSessionKeys", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    chain.reads = undefined;
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
      // Looked up per call so fake timers installed later still take over.
      setInterval: (...args: Parameters<typeof setInterval>) => globalThis.setInterval(...args),
      clearInterval: (...args: Parameters<typeof clearInterval>) => globalThis.clearInterval(...args),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("joins stored records with their reads in record and scope order", () => {
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    storage.set(
      STORAGE_KEY,
      JSON.stringify([record(SIGNER_A, ["createDataSet", "addPieces"]), record(SIGNER_B, ["terminateService"])]),
    );
    chain.reads = [
      { status: "success", result: nowSec + 100n },
      { status: "success", result: 0n },
      { status: "success", result: nowSec - 100n },
    ];
    const hook = mount();
    expect(statuses(hook().keys)).toEqual([
      [SIGNER_A, "active"],
      [SIGNER_B, "expired"],
    ]);
    expect(hook().keys[0].scopeActive).toEqual({ createDataSet: true, addPieces: false });
  });

  it("is unknown before the first read resolves", () => {
    storage.set(STORAGE_KEY, JSON.stringify([record(SIGNER_A, ["addPieces"])]));
    const hook = mount();
    expect(statuses(hook().keys)).toEqual([[SIGNER_A, "unknown"]]);
  });

  it("lets a removeKey captured earlier run against the latest list", () => {
    const hook = mount();
    act(() => hook().addKey(record(SIGNER_A, ["addPieces"])));
    const removeA = hook().removeKey;
    act(() => hook().addKey(record(SIGNER_B, ["addPieces"])));
    act(() => removeA(SIGNER_A));
    expect(hook().keys.map((k) => k.sessionKeyPublic)).toEqual([SIGNER_B]);
    expect(JSON.parse(storage.get(STORAGE_KEY) ?? "[]")).toHaveLength(1);
  });

  it("unions scopes when a known signer is added again", () => {
    const hook = mount();
    act(() => hook().addKey(record(SIGNER_A, ["createDataSet", "addPieces"])));
    act(() => hook().addKey(record(SIGNER_A, ["terminateService"])));
    expect(hook().keys).toHaveLength(1);
    expect(hook().keys[0].scopes).toEqual(["createDataSet", "addPieces", "terminateService"]);
  });

  it("flips a key to expired when only the clock moves", () => {
    vi.useFakeTimers();
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    storage.set(STORAGE_KEY, JSON.stringify([record(SIGNER_A, ["addPieces"])]));
    chain.reads = [{ status: "success", result: nowSec + 10n }];
    const hook = mount();
    expect(statuses(hook().keys)).toEqual([[SIGNER_A, "active"]]);
    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(statuses(hook().keys)).toEqual([[SIGNER_A, "expired"]]);
  });
});
