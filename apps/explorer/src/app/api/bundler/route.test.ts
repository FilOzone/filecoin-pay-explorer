import { entryPoint07Address, entryPoint08Address } from "viem/account-abstraction";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const userOperation = { sender: "0x1111111111111111111111111111111111111111", nonce: "0x0", callData: "0x" };
const userOperationHash = `0x${"ab".repeat(32)}`;

function call(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/bundler", {
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json", ...headers },
      method: "POST",
    }),
  );
}

const rpc = (method: string, params: unknown[]) => ({ jsonrpc: "2.0", id: 7, method, params });

function upstreamReturning(body: unknown, status = 200) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("PIMLICO_API_KEY", "test-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/bundler", () => {
  it("forwards an allowed call to Pimlico's Base bundler with the server key", async () => {
    const fetchMock = upstreamReturning({ jsonrpc: "2.0", id: 7, result: userOperationHash });

    const response = await call(rpc("eth_sendUserOperation", [userOperation, entryPoint08Address]));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.pimlico.io/v2/8453/rpc?apikey=test-key",
      expect.objectContaining({
        body: JSON.stringify(rpc("eth_sendUserOperation", [userOperation, entryPoint08Address])),
        method: "POST",
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ jsonrpc: "2.0", id: 7, result: userOperationHash });
  });

  it.each([
    ["eth_estimateUserOperationGas", [userOperation, entryPoint08Address]],
    ["eth_getUserOperationReceipt", [userOperationHash]],
    ["eth_getUserOperationByHash", [userOperationHash]],
    ["pimlico_getUserOperationGasPrice", []],
  ])("allows %s", async (method, params) => {
    const fetchMock = upstreamReturning({ jsonrpc: "2.0", id: 7, result: null });

    const response = await call(rpc(method, params));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("names the missing key without calling Pimlico", async () => {
    vi.stubEnv("PIMLICO_API_KEY", "");
    const fetchMock = upstreamReturning({});

    const response = await call(rpc("pimlico_getUserOperationGasPrice", []));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "The bundler is not configured: PIMLICO_API_KEY is missing",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a JSON-RPC batch", [rpc("pimlico_getUserOperationGasPrice", [])], -32600],
    ["invalid JSON", "{", -32600],
    ["a call without params", { jsonrpc: "2.0", id: 7, method: "pimlico_getUserOperationGasPrice" }, -32600],
    ["a method outside the allow-list", rpc("eth_sendRawTransaction", ["0x"]), -32601],
    ["an inherited property name", rpc("toString", []), -32601],
    ["another EntryPoint", rpc("eth_sendUserOperation", [userOperation, entryPoint07Address]), -32602],
    [
      "a user operation without a sender",
      rpc("eth_sendUserOperation", [{ nonce: "0x0" }, entryPoint08Address]),
      -32602,
    ],
    [
      "a state override",
      rpc("eth_estimateUserOperationGas", [userOperation, entryPoint08Address, { "0x1": {} }]),
      -32602,
    ],
    ["a malformed operation hash", rpc("eth_getUserOperationReceipt", ["0x1234"]), -32602],
    ["params for the gas price", rpc("pimlico_getUserOperationGasPrice", ["fast"]), -32602],
  ])("rejects %s before calling Pimlico", async (_label, body, code) => {
    const fetchMock = upstreamReturning({});

    const response = await call(body);

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ jsonrpc: "2.0", error: { code } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized body, whether or not it declares its length", async () => {
    const fetchMock = upstreamReturning({});
    const oversized = rpc("eth_sendUserOperation", [
      { ...userOperation, callData: `0x${"00".repeat(40_000)}` },
      entryPoint08Address,
    ]);

    expect((await call(oversized)).status).toBe(413);
    expect((await call(rpc("pimlico_getUserOperationGasPrice", []), { "content-length": "70000" })).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes a bundler error through with its revert reason and status", async () => {
    upstreamReturning(
      {
        jsonrpc: "2.0",
        id: 7,
        error: { code: -32500, message: "AA33 reverted", data: { reason: "paymaster" } },
        debug: "internal",
      },
      400,
    );

    const response = await call(rpc("eth_sendUserOperation", [userOperation, entryPoint08Address]));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      id: 7,
      error: { code: -32500, message: "AA33 reverted", data: { reason: "paymaster" } },
    });
  });

  it("never returns the key, even when the bundler echoes it", async () => {
    upstreamReturning({ jsonrpc: "2.0", id: 7, error: { code: -32001, message: "invalid apikey test-key" } }, 401);

    const response = await call(rpc("pimlico_getUserOperationGasPrice", []));

    expect(await response.text()).not.toContain("test-key");
  });

  it.each([
    ["a rate-limited upstream keeps its status", "Too Many Requests", 429, 429],
    ["a successful but unreadable reply is a bad gateway", "<html>", 200, 502],
  ])("%s", async (_label, body, upstreamStatus, status) => {
    upstreamReturning(body, upstreamStatus);

    const response = await call(rpc("pimlico_getUserOperationGasPrice", []));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: "The bundler is unavailable" });
  });

  it.each([
    ["a timeout", new DOMException("The operation timed out", "TimeoutError"), 504],
    ["a network failure", new TypeError("fetch failed"), 502],
  ])("answers %s with a safe error", async (_label, failure, status) => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(failure));

    const response = await call(rpc("pimlico_getUserOperationGasPrice", []));

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain("test-key");
  });
});
