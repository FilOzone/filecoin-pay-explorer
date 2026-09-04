import { describe, expect, it } from "vitest";
import { getMockService, getMockServiceRails, getMockServices } from "./console-services";

const PAYER = "0x1111111111111111111111111111111111111111";
const WARM_STORAGE = "0x02925630df557f957f70e112ba06e50965417ca0";

describe("console service fixtures", () => {
  it("includes a service with rails and an authorization-only service", () => {
    const [withRails, authorizationOnly] = getMockServices(PAYER);

    expect(withRails.totalRails).toBe(12n);
    expect(authorizationOnly.totalRails).toBe(0n);
    expect(authorizationOnly.totalActiveApprovals).toBe(1n);
  });

  it("keys each service by payer and operator, as the subgraph does", () => {
    const [service] = getMockServices(PAYER);

    expect(service.id).toBe(`${PAYER}${WARM_STORAGE.slice(2)}`);
  });

  it("fills two pages of rails so pagination is exercised", () => {
    expect(getMockServiceRails(WARM_STORAGE, PAYER, 1)).toHaveLength(10);
    expect(getMockServiceRails(WARM_STORAGE, PAYER, 2)).toHaveLength(2);
    expect(getMockServiceRails(WARM_STORAGE, PAYER, 3)).toHaveLength(0);
  });

  it("returns no rails for the authorization-only service", () => {
    const [, authorizationOnly] = getMockServices(PAYER);

    expect(getMockServiceRails(authorizationOnly.operator.address, PAYER, 1)).toEqual([]);
  });

  it("makes the connected account the payer on every rail", () => {
    const rails = getMockServiceRails(WARM_STORAGE, PAYER, 1);

    expect(rails.every((rail) => rail.payer.address === PAYER)).toBe(true);
    expect(rails.every((rail) => rail.payee.address !== PAYER)).toBe(true);
  });

  it("resolves an unrelated operator to null", () => {
    expect(getMockService(PAYER, "0x9999999999999999999999999999999999999999")).toBeNull();
  });
});
