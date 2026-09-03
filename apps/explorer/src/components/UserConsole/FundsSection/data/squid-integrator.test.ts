import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SQUID_INTEGRATOR_ID, readSquidIntegratorId } from "./squid-integrator";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readSquidIntegratorId", () => {
  it("prefers the environment override and falls back to the public testing ID", () => {
    vi.stubEnv("NEXT_PUBLIC_SQUID_INTEGRATOR_ID", "  custom-id  ");
    expect(readSquidIntegratorId()).toBe("custom-id");
    vi.stubEnv("NEXT_PUBLIC_SQUID_INTEGRATOR_ID", "   ");
    expect(readSquidIntegratorId()).toBe(DEFAULT_SQUID_INTEGRATOR_ID);
  });
});
