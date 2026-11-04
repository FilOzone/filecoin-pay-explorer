// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

type MuteRequest = { dataSetId: string; mutedUntil: number };
const observed = vi.hoisted(() => ({ mutationFn: undefined as ((mute: MuteRequest) => Promise<void>) | undefined }));

vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: { mutationFn: (mute: MuteRequest) => Promise<void> }) => {
    observed.mutationFn = options.mutationFn;
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("wagmi", () => ({
  useConnection: () => ({ address: "0x1111111111111111111111111111111111111111", chainId: 314 }),
  useSignMessage: () => ({ signMessageAsync: async () => "0xsignature" }),
}));

vi.stubEnv("NEXT_PUBLIC_NOTIFICATIONS_API_URL", "https://notifications.test");
const { useMuteDataSet } = await import("./useMuteDataSet");

const muteWithResponse = (status: number, body: unknown) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
  useMuteDataSet("0x1111111111111111111111111111111111111111");
  return observed.mutationFn?.({ dataSetId: "1", mutedUntil: Math.floor(Date.now() / 1000) + 86_400 });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMuteDataSet", () => {
  // The API answers validation failures with 422 and a raw zod message.
  it("explains a rejected date instead of showing the validation error", async () => {
    await expect(
      muteWithResponse(422, { error: '[{"code":"custom","message":"mutedUntil must be in the future"}]' }),
    ).rejects.toThrow("Check that your device clock is correct");
  });
});
