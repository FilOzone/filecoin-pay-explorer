import { isAddress, isHex } from "viem";
import { entryPoint08Address } from "viem/account-abstraction";
import {
  CIRCLE_PAYMASTER_ADDRESS,
  CIRCLE_PAYMASTER_CHAIN_ID,
} from "@/components/UserConsole/FundsSection/data/circle-paymaster";

const PIMLICO_BASE_URL = `https://api.pimlico.io/v2/${CIRCLE_PAYMASTER_CHAIN_ID}/rpc`;
// A user operation carrying a Squid route and a 7702 authorization is a few kilobytes of hex.
const MAX_REQUEST_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 15_000;
const NO_STORE = { "cache-control": "no-store" };

type RequestId = number | string | null;

// Codes from the JSON-RPC 2.0 spec.
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isUserOperationHash = (value: unknown) => typeof value === "string" && isHex(value) && value.length === 66;

// Only Circle-paid operations pass, so the key cannot bundle arbitrary operations for anyone who finds the route.
function hasUserOperationParams(params: unknown[]): boolean {
  const [userOperation, entryPoint] = params;
  return (
    params.length === 2 &&
    isObject(userOperation) &&
    typeof userOperation.sender === "string" &&
    isAddress(userOperation.sender) &&
    typeof userOperation.paymaster === "string" &&
    userOperation.paymaster.toLowerCase() === CIRCLE_PAYMASTER_ADDRESS.toLowerCase() &&
    typeof entryPoint === "string" &&
    entryPoint.toLowerCase() === entryPoint08Address.toLowerCase()
  );
}

/** The calls a USDC-gas deposit makes, each with the params it is allowed to send. */
const ALLOWED_METHODS: Record<string, (params: unknown[]) => boolean> = {
  eth_estimateUserOperationGas: hasUserOperationParams,
  eth_sendUserOperation: hasUserOperationParams,
  eth_getUserOperationReceipt: (params) => params.length === 1 && isUserOperationHash(params[0]),
  pimlico_getUserOperationGasPrice: (params) => params.length === 0,
};

function rpcError(id: RequestId, code: number, message: string, status: number) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { headers: NO_STORE, status });
}

function serviceError(message: string, status: number) {
  return Response.json({ error: message }, { headers: NO_STORE, status });
}

/**
 * Forwards the user-operation calls of a USDC-gas deposit to Pimlico's Base bundler, keeping its key on the
 * server. Only single calls for EntryPoint v0.8 and Circle's paymaster pass; the upstream is pinned to Base.
 */
export async function POST(request: Request) {
  const apiKey = process.env.PIMLICO_API_KEY?.trim();
  if (!apiKey) return serviceError("The bundler is not configured: PIMLICO_API_KEY is missing", 503);

  if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) {
    return serviceError("Request is too large", 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) return serviceError("Request is too large", 413);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return rpcError(null, INVALID_REQUEST, "Request is not valid JSON", 400);
  }
  if (!isObject(body)) return rpcError(null, INVALID_REQUEST, "Send one JSON-RPC call per request", 400);
  const id: RequestId = typeof body.id === "number" || typeof body.id === "string" ? body.id : null;
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string" || !Array.isArray(body.params)) {
    return rpcError(id, INVALID_REQUEST, "Request is not a JSON-RPC 2.0 call", 400);
  }
  const accepts = Object.hasOwn(ALLOWED_METHODS, body.method) ? ALLOWED_METHODS[body.method] : undefined;
  if (!accepts) return rpcError(id, METHOD_NOT_FOUND, `Method ${body.method} is not available`, 400);
  if (!accepts(body.params)) return rpcError(id, INVALID_PARAMS, `Invalid params for ${body.method}`, 400);

  let upstream: Response;
  try {
    upstream = await fetch(`${PIMLICO_BASE_URL}?apikey=${encodeURIComponent(apiKey)}`, {
      body: JSON.stringify({ jsonrpc: "2.0", id, method: body.method, params: body.params }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    console.error("Bundler request failed", { method: body.method, reason: timedOut ? "timeout" : "network" });
    return timedOut
      ? serviceError("The bundler did not respond in time", 504)
      : serviceError("The bundler is unavailable", 502);
  }

  let reply: unknown;
  try {
    reply = await upstream.json();
  } catch {
    reply = undefined;
  }
  // Only the JSON-RPC envelope goes back: AA revert reasons are useful to the client, anything else is dropped.
  let payload: object | undefined;
  if (isObject(reply) && "result" in reply) {
    payload = { jsonrpc: "2.0", id, result: reply.result };
  } else if (isObject(reply) && isObject(reply.error)) {
    const { code, data, message } = reply.error;
    payload = {
      jsonrpc: "2.0",
      id,
      error: {
        code: typeof code === "number" ? code : -32603,
        message: typeof message === "string" ? message : "Bundler error",
        ...(data === undefined ? {} : { data }),
      },
    };
  }
  if (payload) {
    return new Response(JSON.stringify(payload).replaceAll(apiKey, "[redacted]"), {
      headers: { ...NO_STORE, "content-type": "application/json" },
      status: upstream.status,
    });
  }
  console.error("Bundler returned an unreadable response", { method: body.method, status: upstream.status });
  return serviceError("The bundler is unavailable", upstream.ok ? 502 : upstream.status);
}
