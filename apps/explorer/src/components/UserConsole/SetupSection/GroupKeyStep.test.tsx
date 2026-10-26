// @vitest-environment jsdom
/** The group key step: when it can sign, what it warns, and the Grant it shows. */
import { publicKeyOf } from "@filoz/keysmith";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
}));

vi.mock("wagmi", () => ({
  usePublicClient: () => ({}),
  useWalletClient: () => ({
    data: {
      signTypedData: async (args: { primaryType: string }) => {
        state.events.push(`sign ${args.primaryType}`);
        return "0xsig";
      },
    },
  }),
}));
vi.mock("@filoz/synapse-core/warm-storage", () => ({
  getPdpDataSets: async () => ({ items: state.dataSets }),
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
            keyAgreement={{ pubkey: PUBKEY, pubkeysig }}
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
    await waitFor(() => expect(screen.getByText("0x02ca08cf7e0222c8432adc159232b7eb")).toBeTruthy());
    expect(signButton()?.disabled).toBe(true);
    expect(state.events).toEqual([]);
  });

  it("refuses a key-agreement key the session key did not sign, before any wallet request", async () => {
    const forged = await OWNER.signMessage({ message: keyAgreementMessage(PUBKEY) });
    await renderStep({ pubkeysig: forged });

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("The session key did not sign this encryption key"),
    );
    expect(signButton()).toBeNull();
    expect(state.events).toEqual([]);
  });

  it("refuses to sign for a default group key whose data sets are inconsistent", async () => {
    state.dataSets = [
      {
        dataSetId: 3n,
        live: true,
        metadata: { "foc/ks": "0x02ca08cf7e0222c8432adc159232b7eb", "foc/kc": "v1.aa", "foc/enc": "2" },
      },
    ];
    await renderStep();

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Data sets 3 use group key"));
    expect(signButton()?.disabled).toBe(true);
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
