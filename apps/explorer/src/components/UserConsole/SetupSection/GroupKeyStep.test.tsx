// @vitest-environment jsdom
/** The group key step: when it can sign, what it warns, and the Grant it shows. */
import { publicKeyOf } from "@filoz/keysmith";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BaseError, UserRejectedRequestError } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keyAgreementMessage } from "@/utils/setupLink";
import { GROUP_KEY_WARNING, GroupKeyStep } from "./GroupKeyStep";

// Test keys only: Anvil #0 is the owner's wallet, Anvil #1 the session key.
const OWNER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const SESSION_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const SESSION = privateKeyToAccount(SESSION_KEY);
const PUBKEY = publicKeyOf(SESSION_KEY);
const PUBKEYSIG = await SESSION.signMessage({ message: keyAgreementMessage(PUBKEY) });
const EXPIRES = 4_102_444_800n;

const state = vi.hoisted(() => ({
  dataSets: [] as { dataSetId: bigint; live: boolean; metadata: Record<string, string> }[],
  /** Each wallet request, and each wait for Privy's dialog, in the order they happen. */
  events: [] as string[],
  /** The functions each multicall read, in order. */
  multicalls: [] as string[][],
  /** Reads left to fail before the scan works. */
  failReads: 0,
  walletReady: true,
}));

vi.mock("wagmi", async () => {
  const { getChain } = await import("@/constants/chains");
  return {
    usePublicClient: () => ({
      chain: getChain("calibration"),
      // Answers only what the scan should ask for. Anything else, such as a provider record, fails to decode.
      multicall: async ({ contracts }: { contracts: { functionName: string; args: [bigint] }[] }) => {
        state.multicalls.push(contracts.map(({ functionName }) => functionName));
        return contracts.map(({ functionName, args: [dataSetId] }) => {
          const dataSet = state.dataSets.find((candidate) => candidate.dataSetId === dataSetId);
          if (functionName === "dataSetLive") return dataSet?.live;
          if (functionName === "getAllDataSetMetadata") {
            return [Object.keys(dataSet?.metadata ?? {}), Object.values(dataSet?.metadata ?? {})];
          }
          throw new Error(`Cannot decode ${functionName}`);
        });
      },
    }),
    useWalletClient: () => ({
      data: !state.walletReady
        ? undefined
        : {
            signTypedData: async (args: { primaryType: string }) => {
              state.events.push(`sign ${args.primaryType}`);
              return "0xsig";
            },
          },
    }),
  };
});
// Two ids a page, so a few data sets span pages.
vi.mock("@filoz/synapse-core/warm-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@filoz/synapse-core/warm-storage")>()),
  getClientDataSetIds: async (_client: unknown, { cursor = 0n }: { cursor?: bigint }) => {
    if (state.failReads > 0) {
      state.failReads -= 1;
      throw new Error("rpc down");
    }
    const ids = state.dataSets.map(({ dataSetId }) => dataSetId);
    const end = Number(cursor) + 2;
    return { items: ids.slice(Number(cursor), end), ...(end < ids.length ? { nextCursor: BigInt(end) } : {}) };
  },
}));
vi.mock("@/utils/privy-modal", () => ({
  waitForPrivyModalToClose: async () => {
    state.events.push("wait");
    return true;
  },
}));

// jsdom's typed arrays are not the ones Node's WebCrypto accepts, so the Grant itself is made, and opened,
// in groupKeyGrant.test.ts; here the wallet requests it would make stand in for it.
const issue = vi.hoisted(() => vi.fn());
vi.mock("@/utils/groupKeyGrant", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/groupKeyGrant")>()),
  issueGroupKeyGrant: issue,
}));
const GRANT = "fgr1_o2EBYmtzWBAC-_9";

const onIssued = vi.fn();

async function renderStep({ expires = EXPIRES as bigint | null, pubkeysig = PUBKEYSIG } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <ol>
          <GroupKeyStep
            number={2}
            network='calibration'
            account={OWNER.address}
            sessionKey={SESSION.address}
            keyAgreement={{ pubkey: PUBKEY, pubkeysig, node: "keyspace" }}
            expires={expires}
            onIssued={onIssued}
          />
        </ol>
      </QueryClientProvider>,
    );
  });
}
const signButton = () => screen.queryByRole("button", { name: "Sign and create Grant" }) as HTMLButtonElement | null;

describe("GroupKeyStep", () => {
  beforeEach(() => {
    state.dataSets = [];
    state.events = [];
    state.multicalls = [];
    state.failReads = 0;
    state.walletReady = true;
    onIssued.mockReset();
    issue.mockReset().mockImplementation(async (wallet: { signTypedData: (args: object) => Promise<string> }) => {
      for (const primaryType of ["KeyspaceKey", "KeyspaceKey", "ReadGrant"]) {
        await wallet.signTypedData({ primaryType, domain: {}, types: {}, message: {} });
      }
      return GRANT;
    });
  });
  afterEach(cleanup);

  it("shows the session key and the warning, and cannot sign before the key is authorized", async () => {
    await renderStep({ expires: null });

    expect(screen.getByText(SESSION.address)).toBeTruthy();
    expect(screen.getByText(GROUP_KEY_WARNING)).toBeTruthy();
    expect(screen.queryByText("Fetching ends")).toBeNull();
    await waitFor(() => expect(screen.getByText("0x02ca08cf7e0222c8432adc159232b7eb")).toBeTruthy());
    expect(signButton()?.disabled).toBe(true);
    expect(state.events).toEqual([]);
  });

  const BROKEN_DEFAULT = [
    {
      dataSetId: 3n,
      live: true,
      metadata: { "foc/ks": "0x02ca08cf7e0222c8432adc159232b7eb", "foc/kc": "v1.aa", "foc/enc": "2" },
    },
  ];
  it.each([
    {
      name: "a pubkey the session key did not sign",
      setup: () => {},
      props: { forged: true },
      alert: "The session key did not sign this encryption key",
      button: null,
    },
    {
      name: "a broken default group key",
      setup: () => {
        state.dataSets = BROKEN_DEFAULT;
      },
      props: {},
      alert: "Data sets 3 use group key 0x02ca08cf7e0222c8432adc159232b7eb",
      button: "Sign and create Grant",
    },
    {
      // The step must feed `expires` into the phase: before authorization the warning still shows.
      name: "a broken default group key before the session key is authorized",
      setup: () => {
        state.dataSets = BROKEN_DEFAULT;
      },
      props: { expires: null },
      alert: "Your default group key is in an inconsistent state",
      button: "Sign and create Grant",
    },
    {
      name: "a broken default group key and no wallet",
      setup: () => {
        state.dataSets = BROKEN_DEFAULT;
        state.walletReady = false;
      },
      props: {},
      alert: "Your default group key is in an inconsistent state",
      button: "Sign and create Grant",
    },
    {
      name: "data sets that cannot be read",
      setup: () => {
        state.failReads = 1;
      },
      props: {},
      alert: "Could not read your data setsRetry",
      button: "Sign and create Grant",
    },
    {
      name: "no wallet client yet",
      setup: () => {
        state.walletReady = false;
      },
      props: {},
      alert: null,
      button: "Connecting to your wallet…",
    },
  ])("renders one notice and a disabled or no sign button for $name", async ({ setup, props, alert, button }) => {
    setup();
    const { forged, ...rest } = props as { forged?: boolean; expires?: null };
    const pubkeysig = forged ? await OWNER.signMessage({ message: keyAgreementMessage(PUBKEY) }) : PUBKEYSIG;
    await renderStep({ ...rest, pubkeysig });

    await waitFor(() => {
      const alerts = screen.queryAllByRole("alert").map((a) => a.textContent ?? "");
      expect(alerts).toHaveLength(alert ? 1 : 0);
      if (alert) expect(alerts[0]).toContain(alert);
      const buttons = screen.queryAllByRole("button").filter((b) => /Grant|wallet/.test(b.textContent ?? ""));
      expect(buttons.map((b) => [b.textContent, (b as HTMLButtonElement).disabled])).toEqual(
        button ? [[button, true]] : [],
      );
    });
    expect(state.events).toEqual([]);
  });

  it("offers Retry when the data sets cannot be read, and a retry recovers", async () => {
    state.failReads = 1;
    await renderStep();

    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Retry" })));
    await waitFor(() => expect(signButton()?.disabled).toBe(false));
    expect(screen.queryAllByRole("alert")).toEqual([]);
  });

  it("ignores data sets that are no longer live", async () => {
    state.dataSets = [
      {
        dataSetId: 3n,
        live: false,
        metadata: { "foc/ks": "0x02ca08cf7e0222c8432adc159232b7eb", "foc/kc": "v1.aa", "foc/enc": "2" },
      },
    ];
    await renderStep();

    await waitFor(() => expect(signButton()?.disabled).toBe(false));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reads only each data set's liveness and metadata, one multicall a page, never its provider", async () => {
    await renderStep();
    await waitFor(() => expect(signButton()?.disabled).toBe(false));
    // An owner with no data sets costs no multicall at all.
    expect(state.multicalls).toEqual([]);
    cleanup();

    const tagged = (groupKeyId: string) => ({ "foc/ks": groupKeyId, "foc/kc": "v1.aa", "foc/enc": "1" });
    state.dataSets = [
      { dataSetId: 4n, live: true, metadata: tagged(`0x${"44".repeat(16)}`) },
      { dataSetId: 7n, live: true, metadata: {} },
      { dataSetId: 2n, live: true, metadata: tagged(`0x${"22".repeat(16)}`) },
    ];
    await renderStep();
    await waitFor(() => expect(signButton()?.disabled).toBe(false));
    expect(state.multicalls).toEqual([
      ["dataSetLive", "getAllDataSetMetadata", "dataSetLive", "getAllDataSetMetadata"],
      ["dataSetLive", "getAllDataSetMetadata"],
    ]);
    // The oldest group key, found on the second page.
    expect(screen.getByText(`0x${"22".repeat(16)}`)).toBeTruthy();
  });

  it("names the group key it will sign for: none yet, a new one, or the one the data sets record", async () => {
    const groupKeyRow = () => screen.getByText("Group key id").nextElementSibling?.textContent;
    await renderStep({ pubkeysig: await OWNER.signMessage({ message: keyAgreementMessage(PUBKEY) }) });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(groupKeyRow()).toBe("Not chosen yet");
    cleanup();

    await renderStep();
    await waitFor(() =>
      expect(groupKeyRow()).toBe("0x02ca08cf7e0222c8432adc159232b7ebNew: none of your data sets uses a group key yet."),
    );
    cleanup();

    state.dataSets = [
      { dataSetId: 5n, live: true, metadata: { "foc/ks": `0x${"11".repeat(16)}`, "foc/kc": "v1.aa", "foc/enc": "1" } },
    ];
    await renderStep();
    await waitFor(() =>
      expect(groupKeyRow()).toBe(
        `0x${"11".repeat(16)}Tags your encrypted data sets. The session key gets access to every data set under this key.`,
      ),
    );
  });

  it("says a declined signature plainly, and a retry can still make the Grant", async () => {
    issue.mockRejectedValueOnce(
      new BaseError("Signing failed", { cause: new UserRejectedRequestError(new Error("no")) }),
    );
    await renderStep();
    await waitFor(() => expect(signButton()?.disabled).toBe(false));

    await act(async () => fireEvent.click(signButton() as HTMLButtonElement));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "No Grant was madeYou declined the signature. No Grant was made.",
      ),
    );
    expect(onIssued).not.toHaveBeenCalled();

    await act(async () => fireEvent.click(signButton() as HTMLButtonElement));
    await waitFor(() => expect((screen.getByLabelText("Grant") as HTMLTextAreaElement).value).toBe(GRANT));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onIssued).toHaveBeenCalledOnce();
  });

  it("waits for Privy's dialog before each signature, then shows the Grant to paste in place of the warning", async () => {
    await renderStep();
    await waitFor(() => expect(signButton()?.disabled).toBe(false));

    await act(async () => fireEvent.click(signButton() as HTMLButtonElement));

    await waitFor(() => expect(onIssued).toHaveBeenCalledOnce());
    expect(issue.mock.calls[0]?.[1]).toEqual({
      owner: OWNER.address,
      groupKeyId: "0x02ca08cf7e0222c8432adc159232b7eb",
      commitment: null,
      chainId: 314159,
      bearer: SESSION.address,
      pubkey: PUBKEY,
      node: "keyspace",
      expires: EXPIRES,
    });
    expect(state.events).toEqual(["wait", "sign KeyspaceKey", "wait", "sign KeyspaceKey", "wait", "sign ReadGrant"]);
    expect(screen.queryByText(GROUP_KEY_WARNING)).toBeNull();
    const output = screen.getByLabelText("Grant") as HTMLTextAreaElement;
    expect(output.readOnly).toBe(true);
    expect(output.value).toBe(GRANT);
    expect(screen.getByText("filecoin-pin login --grant <grant>")).toBeTruthy();

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy Grant" })));
    expect(writeText).toHaveBeenCalledWith(GRANT);
  });
});
