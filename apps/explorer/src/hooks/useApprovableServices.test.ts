import { describe, expect, it, vi } from "vitest";
import { getApprovableServiceCandidates, getApprovedOperatorClients } from "./useApprovableServices";

const TARGET_OPERATOR = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const OTHER_OPERATOR = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

function approval(id: string, client: string, operator: string) {
  return { id, client: { id: client }, operator: { address: operator } };
}

describe("approvable service discovery", () => {
  it("paginates every approval before applying the distinct-payer threshold", async () => {
    const firstPage = [
      approval("0x0001", "0xclient1", TARGET_OPERATOR),
      approval("0x0002", "0xclient2", TARGET_OPERATOR),
      ...Array.from({ length: 998 }, (_, index) =>
        approval(`0x${(index + 3).toString(16).padStart(4, "0")}`, "0xnoise", OTHER_OPERATOR),
      ),
    ];
    const finalPage = [approval("0xffff", "0xclient3", TARGET_OPERATOR)];
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ operatorApprovals: firstPage })
      .mockResolvedValueOnce({ operatorApprovals: finalPage });

    const approvals = await getApprovedOperatorClients(fetchPage);

    expect(fetchPage.mock.calls).toEqual([["0x"], [firstPage.at(-1)?.id]]);
    expect(approvals).toEqual([...firstPage, ...finalPage]);
    expect(getApprovableServiceCandidates(approvals, "calibration")).toEqual([
      { address: TARGET_OPERATOR.toLowerCase(), payerCount: 3 },
    ]);
  });
});
