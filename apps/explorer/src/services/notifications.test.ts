// @vitest-environment jsdom
import { parseSiweMessage } from "viem/siwe";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("NEXT_PUBLIC_NOTIFICATIONS_API_URL", "https://notifications.test");
const { buildNotificationsSiwe, getNotificationsApi, postNotificationsApi } = await import("./notifications");

const ADDRESS = "0x1111111111111111111111111111111111111111";

const respond = (status: number, body: unknown) => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildNotificationsSiwe", () => {
  // api/auth.ts verifies these fields; a change here has to ship with the API.
  it("signs for this origin with the given chain and statement", () => {
    const message = parseSiweMessage(
      buildNotificationsSiwe(ADDRESS, 314, "Unsubscribe from Filecoin Pay notifications"),
    );

    expect(message).toMatchObject({
      domain: window.location.host,
      address: ADDRESS,
      statement: "Unsubscribe from Filecoin Pay notifications",
      uri: window.location.origin,
      version: "1",
      chainId: 314,
    });
    expect(message.nonce).toMatch(/^[a-zA-Z0-9]{8,}$/);
    expect(message.issuedAt).toBeInstanceOf(Date);
  });
});

describe("postNotificationsApi", () => {
  it("posts the body as JSON to the path", async () => {
    const fetchMock = respond(200, { ok: true });

    await postNotificationsApi("/unsubscribe", { message: "m" }, "Failed");

    expect(fetchMock).toHaveBeenCalledWith("https://notifications.test/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "m" }),
    });
  });

  it.each([
    [429, {}, "Too many requests. Please wait a moment and try again."],
    [400, { error: "Invalid email" }, "Invalid email"],
    [401, {}, "Signature verification failed. Please try again."],
    [500, { error: "Database down" }, "Database down"],
    [500, { message: "Upstream" }, "Upstream"],
    [500, {}, "Failed"],
  ])("maps a %i response to a message", async (status, body, expected) => {
    respond(status, body);

    await expect(postNotificationsApi("/register", {}, "Failed")).rejects.toThrow(expected);
  });

  it("uses the route's own message for a status it overrides", async () => {
    respond(422, { error: "[zod issues]" });

    await expect(postNotificationsApi("/mute-dataset", {}, "Failed", { 422: "Check your clock" })).rejects.toThrow(
      "Check your clock",
    );
  });
});

describe("getNotificationsApi", () => {
  const isSubscribed = (value: unknown): value is { subscribed: boolean } =>
    typeof (value as { subscribed?: unknown })?.subscribed === "boolean";

  it("reads the lowercased wallet's record", async () => {
    const fetchMock = respond(200, { subscribed: true });

    const result = await getNotificationsApi(
      "/status",
      "0xABCDEF0000000000000000000000000000000001",
      isSubscribed,
      "Failed",
      new AbortController().signal,
    );

    expect(result).toEqual({ subscribed: true });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://notifications.test/status?wallet=0xabcdef0000000000000000000000000000000001",
    );
  });

  it("rejects a failed or unrecognised response", async () => {
    respond(500, {});
    await expect(
      getNotificationsApi("/status", ADDRESS, isSubscribed, "Failed", new AbortController().signal),
    ).rejects.toThrow("Failed");

    respond(200, { unexpected: true });
    await expect(
      getNotificationsApi("/status", ADDRESS, isSubscribed, "Failed", new AbortController().signal),
    ).rejects.toThrow("Unexpected response from notifications API");
  });
});
