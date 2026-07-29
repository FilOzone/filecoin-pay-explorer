import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { iterateSubscriptions } from "../../alert-scheduler/queries";
import { createDb } from "../../shared/db/client";
import { clearSubscriptions, seedSubscriptions } from "./helpers";

const db = createDb(env.DB);

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const page of gen) out.push(page);
  return out;
}

describe("iterateSubscriptions", () => {
  beforeEach(() => clearSubscriptions(db));

  it("yields nothing for an empty table", async () => {
    const pages = await collect(iterateSubscriptions(db, 10));
    expect(pages).toEqual([]);
  });

  it("yields a single partial page when rows < pageSize", async () => {
    await seedSubscriptions(db, 3);
    const pages = await collect(iterateSubscriptions(db, 10));
    expect(pages.map((p) => p.length)).toEqual([3]);
  });

  it("terminates without duplicating the last page when rows == pageSize", async () => {
    await seedSubscriptions(db, 4);
    const ids = (await collect(iterateSubscriptions(db, 4))).flat().map((r) => r.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });

  it("walks multiple pages in id order with no gaps or duplicates", async () => {
    const wallets = await seedSubscriptions(db, 5);
    const pages = await collect(iterateSubscriptions(db, 2));
    expect(pages.map((p) => p.length)).toEqual([2, 2, 1]);
    // Ids are insertion-ordered, so the flattened read equals the seed order.
    expect(pages.flat().map((r) => r.walletAddress)).toEqual(wallets);
  });
});
