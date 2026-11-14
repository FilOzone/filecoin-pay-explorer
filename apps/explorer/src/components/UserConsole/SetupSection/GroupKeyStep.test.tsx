// @vitest-environment jsdom
/** The group key step: when it can sign, what it warns, and the Grant it shows. */
import { publicKeyOf } from "@filoz/keysmith";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BaseError, UserRejectedRequestError } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupGrantNode } from "@/utils/groupKeyGrant";
import { keyAgreementMessage } from "@/utils/setupLink";
import { GroupKeyStep, groupKeyWarning } from "./GroupKeyStep";

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
const GROUP_KEY_WARNING = groupKeyWarning("keyspace");

const onIssued = vi.fn();

async function renderStep({
  expires = EXPIRES as bigint | null,
  pubkeysig = PUBKEYSIG,
  node = "keyspace" as GroupGrantNode,
  maxDepth = 7,
} = {}) {
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
            keyAgreement={{ pubkey: PUBKEY, pubkeysig, node, maxDepth }}
            expires={expires}
            onIssued={onIssued}
          />
        </ol>
      </QueryClientProvider>,
    );
  });
}
const signButton = () =>
  screen.queryByRole("button", { name: /Sign to share the group key|Try signing again/ }) as HTMLButtonElement | null;

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

  it("keeps the signing summary visible and the itemized details in a disclosure", async () => {
    await renderStep();

    const summary = screen.getByText(
      "Your wallet signs 2 messages (3 for a new group key). No transaction or network fee.",
    );
    expect(summary.closest("details")).toBeNull();
    const details = screen.getByText("What will my wallet sign?").closest("details");
    expect(details?.open).toBe(false);
    expect(Array.from(details?.querySelectorAll("li") ?? [], (li) => li.textContent)).toEqual([
      "A signature that derives the group key.",
      "For a new group key, the same signature again, to check it is reproducible.",
      "A signature that authorizes the group key's encrypted delivery to this session key.",
    ]);
    expect(details?.contains(screen.getByRole("link", { name: /encryption guide/ }))).toBe(true);
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
      alert: "Encryption recipient could not be verified",
      button: null,
    },
    {
      name: "a broken default group key",
      setup: () => {
        state.dataSets = BROKEN_DEFAULT;
      },
      props: {},
      alert: "Data sets 3 record conflicting encryption details for group 0x02ca08cf7e0222c8432adc159232b7eb",
      button: "Sign to share the group key",
    },
    {
      // The step must feed `expires` into the phase: before authorization the warning still shows.
      name: "a broken default group key before the session key is authorized",
      setup: () => {
        state.dataSets = BROKEN_DEFAULT;
      },
      props: { expires: null },
      alert: "Encryption group records disagree",
      button: "Sign to share the group key",
    },
    {
      name: "a broken default group key and no wallet",
      setup: () => {
        state.dataSets = BROKEN_DEFAULT;
        state.walletReady = false;
      },
      props: {},
      alert: "Encryption group records disagree",
      button: "Sign to share the group key",
    },
    {
      name: "data sets that cannot be read",
      setup: () => {
        state.failReads = 1;
      },
      props: {},
      alert:
        "Could not check your encryption groupYour data sets could not be read. Retry before sharing an encryption key.Retry",
      button: "Sign to share the group key",
    },
    {
      name: "no wallet client yet",
      setup: () => {
        state.walletReady = false;
      },
      props: {},
      alert: null,
      button: "Connecting wallet…",
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
      const buttons = screen.queryAllByRole("button").filter((b) => /Sign to share|wallet/.test(b.textContent ?? ""));
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
    const groupKeyRow = () => screen.getByText("Group key ID").closest("dt")?.nextElementSibling?.textContent;
    await renderStep({ pubkeysig: await OWNER.signMessage({ message: keyAgreementMessage(PUBKEY) }) });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(groupKeyRow()).toBe("Not chosen yet");
    cleanup();

    await renderStep();
    await waitFor(() =>
      expect(groupKeyRow()).toBe(
        "0x02ca08cf7e0222c8432adc159232b7ebPublic identifier, not the secret key. Access covers everything encrypted with this group key — existing and future uploads.",
      ),
    );
    cleanup();

    state.dataSets = [
      { dataSetId: 5n, live: true, metadata: { "foc/ks": `0x${"11".repeat(16)}`, "foc/kc": "v1.aa", "foc/enc": "1" } },
    ];
    await renderStep();
    await waitFor(() =>
      expect(groupKeyRow()).toBe(
        `0x${"11".repeat(16)}Public identifier, not the secret key. Access covers everything encrypted with this group key — existing and future uploads.`,
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
        "Encryption Grant was not createdThe signing process did not complete. You declined the signature. No Grant was made.",
      ),
    );
    expect(onIssued).not.toHaveBeenCalled();

    await act(async () => fireEvent.click(signButton() as HTMLButtonElement));
    await waitFor(() =>
      expect((screen.getByLabelText("Encryption Grant for this session key") as HTMLTextAreaElement).value).toBe(GRANT),
    );
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
      maxDepth: 7,
      expires: EXPIRES,
    });
    expect(state.events).toEqual(["wait", "sign KeyspaceKey", "wait", "sign KeyspaceKey", "wait", "sign ReadGrant"]);
    expect(screen.queryByText(GROUP_KEY_WARNING)).toBeNull();
    const output = screen.getByLabelText("Encryption Grant for this session key") as HTMLTextAreaElement;
    expect(output.readOnly).toBe(true);
    expect(output.value).toBe(GRANT);
    expect(screen.getByRole("button", { name: /copy grant/i })).toBeTruthy();

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy Grant" })));
    expect(writeText).toHaveBeenCalledWith(GRANT);
  });

  it("says what is granted: the whole group key, or one group", () => {
    expect(GROUP_KEY_WARNING).toContain("under this group key");
    const group = groupKeyWarning("scope:photos/2026");
    expect(group).toContain('every piece uploaded under the group "photos/2026" and the groups beneath it');
    expect(group).toContain("everything under this group,");
  });

  const accessRow = () => screen.getByText("Access").closest("dt")?.nextElementSibling?.textContent ?? "";

  it("names a requested group in plain words, with its warning", async () => {
    await renderStep({ node: "scope:photos/2026", maxDepth: 2 });

    expect(accessRow()).toContain("This key can read and write photos/2026 only, with the groups beneath it.");
    expect(screen.getByText(groupKeyWarning("scope:photos/2026"))).toBeTruthy();
    expect(screen.queryByText(GROUP_KEY_WARNING)).toBeNull();
  });

  it("signs a group request as the link asked, node and depth, when the owner does not narrow it", async () => {
    await renderStep({ node: "scope:photos/2026", maxDepth: 2 });
    await waitFor(() => expect(signButton()?.disabled).toBe(false));

    await act(async () => fireEvent.click(signButton() as HTMLButtonElement));

    await waitFor(() => expect(onIssued).toHaveBeenCalledOnce());
    expect(issue.mock.calls[0]?.[1]).toMatchObject({ node: "scope:photos/2026", maxDepth: 2, bearer: SESSION.address });
    expect((screen.getByLabelText("Encryption Grant for group photos/2026") as HTMLTextAreaElement).value).toBe(GRANT);
  });

  const option = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;
  const options = () => screen.queryAllByRole("radio").map((radio) => (radio as HTMLInputElement).value);
  /** Opens the inline input under `under` (its accessible name) and types `name` into it. */
  const typeGroup = (under: string, name: string) => {
    fireEvent.click(screen.getByRole("button", { name: `Add a group under ${under}` }));
    const input = screen.getByLabelText(`New group under ${under}`);
    fireEvent.change(input, { target: { value: name } });
    return input;
  };
  const addGroup = (under: string, name: string) => fireEvent.keyDown(typeGroup(under, name), { key: "Enter" });

  /** The text of each tree row, in order, indented two spaces per level. */
  const treeRows = () =>
    Array.from(document.querySelectorAll("fieldset li"), (li) => {
      let depth = 0;
      // Count only the tree's own levels, not the setup step's list item around it.
      for (let up = li.parentElement?.closest("fieldset li"); up; up = up.parentElement?.closest("fieldset li")) {
        depth += 1;
      }
      const own = li.firstElementChild?.textContent ?? "";
      return `${"  ".repeat(depth)}${own}`;
    });

  it("shows a whole group key request as one selected root", async () => {
    await renderStep();
    expect(accessRow()).toContain("Whole group key.");
    expect(treeRows()).toEqual(["Whole group key"]);
    expect(options()).toEqual(["keyspace"]);
    expect(option("Whole group key").checked).toBe(true);
    expect(screen.getByRole("button", { name: "Add a group under the whole group key" })).toBeTruthy();
  });

  it("splits a group request into one row per name, with only the requested group selectable", async () => {
    await renderStep({ node: "scope:photos/2026" });
    expect(treeRows()).toEqual(["photos", "  2026"]);
    // The group above the request is context: no radio and no "+", so the owner can never widen the Grant.
    expect(options()).toEqual(["scope:photos/2026"]);
    expect(option("photos/2026").checked).toBe(true);
    expect(screen.queryByRole("button", { name: "Add a group under photos" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add a group under photos/2026" })).toBeTruthy();
  });

  it("says a whole group key link narrowed to a group covers only that group", async () => {
    const groupKeyRow = () => screen.getByText("Group key ID").closest("dt")?.nextElementSibling?.textContent;
    await renderStep();
    await waitFor(() => expect(groupKeyRow()).toContain("Access covers everything encrypted with this group key"));

    addGroup("the whole group key", "docs");
    expect(groupKeyRow()).toContain("The group below sits inside this group key.");
    expect(groupKeyRow()).not.toContain("Access covers everything");
    expect(accessRow()).toContain("The group name is visible in every encrypted piece written under it.");
  });

  it("adds a typed group name in its normalized form", async () => {
    await renderStep({ node: "scope:photos" });
    addGroup("photos", "cafe\u0301");
    expect(options()).toEqual(["scope:photos", "scope:photos/caf\u00e9"]);
  });

  it("nests groups added under the requested group, and signs for the one selected", async () => {
    await renderStep({ node: "scope:photos/2026" });
    await waitFor(() => expect(signButton()?.disabled).toBe(false));
    addGroup("photos/2026", "may");
    addGroup("photos/2026/may", "raw");
    addGroup("photos/2026", "june");
    expect(treeRows()).toEqual(["photos", "  2026", "    may", "      raw", "    june"]);
    expect(option("photos/2026/june").checked).toBe(true);

    fireEvent.click(option("photos/2026/may/raw"));
    expect(accessRow()).toContain("This key can read and write photos/2026/may/raw only");
    await act(async () => fireEvent.click(signButton() as HTMLButtonElement));
    await waitFor(() => expect(onIssued).toHaveBeenCalledOnce());
    expect(issue.mock.calls[0]?.[1]).toMatchObject({ node: "scope:photos/2026/may/raw" });
  });

  it("signs for a group the owner adds beneath the request and selects", async () => {
    await renderStep({ node: "scope:photos", maxDepth: 3 });
    await waitFor(() => expect(signButton()?.disabled).toBe(false));

    addGroup("photos", "2026");
    expect(options()).toEqual(["scope:photos", "scope:photos/2026"]);
    // The root stays selectable; selecting the new group is what narrows the Grant.
    fireEvent.click(option("photos"));
    expect(accessRow()).toContain("This key can read and write photos only");
    fireEvent.click(option("photos/2026"));
    expect(option("photos/2026").checked).toBe(true);
    expect(accessRow()).toContain("This key can read and write photos/2026 only");
    expect(screen.getByText(groupKeyWarning("scope:photos/2026"))).toBeTruthy();

    await act(async () => fireEvent.click(signButton() as HTMLButtonElement));
    await waitFor(() => expect(onIssued).toHaveBeenCalledOnce());
    expect(issue.mock.calls[0]?.[1]).toMatchObject({ node: "scope:photos/2026", maxDepth: 3 });
    expect((screen.getByLabelText("Encryption Grant for group photos/2026") as HTMLTextAreaElement).value).toBe(GRANT);
  });

  it("refuses an invalid group name with an error, and adds nothing", async () => {
    await renderStep({ node: "scope:photos" });
    for (const name of ["", " 2026", "2026 ", "a/b"]) {
      const input = typeGroup("photos", name);
      fireEvent.keyDown(input, { key: "Enter" });
      expect(screen.getByText(/Not a valid group name/), JSON.stringify(name)).toBeTruthy();
      expect(input.getAttribute("aria-invalid")).toBe("true");
      fireEvent.keyDown(input, { key: "Escape" });
    }
    expect(options()).toEqual(["scope:photos"]);
    expect(screen.queryByLabelText("New group under photos")).toBeNull();
  });

  it("cancels an add on blur", async () => {
    await renderStep();
    fireEvent.blur(typeGroup("the whole group key", "docs"));
    expect(screen.queryByLabelText("New group under the whole group key")).toBeNull();
    expect(options()).toEqual(["keyspace"]);
  });

  it("adds groups under added groups, nested, and under the whole group key", async () => {
    await renderStep();
    addGroup("the whole group key", "docs");
    addGroup("docs", "2026");
    addGroup("docs/2026", "may");
    addGroup("the whole group key", "photos");
    expect(options()).toEqual(["keyspace", "scope:docs", "scope:docs/2026", "scope:docs/2026/may", "scope:photos"]);
    // Each level sits one list deeper than its parent.
    expect(option("docs/2026/may").closest("ul")?.parentElement?.closest("li")?.querySelector("input")?.value).toBe(
      "scope:docs/2026",
    );
    expect(option("photos").checked).toBe(true);

    fireEvent.click(option("docs/2026/may"));
    await waitFor(() => expect(signButton()?.disabled).toBe(false));
    await act(async () => fireEvent.click(signButton() as HTMLButtonElement));
    await waitFor(() => expect(onIssued).toHaveBeenCalledOnce());
    expect(issue.mock.calls[0]?.[1]).toMatchObject({ node: "scope:docs/2026/may" });
  });

  it("issues several Grants to the same session key, resetting the tree for each", async () => {
    issue.mockResolvedValueOnce(`${GRANT}a`).mockResolvedValueOnce(`${GRANT}b`);
    await renderStep({ node: "scope:photos" });
    await waitFor(() => expect(signButton()?.disabled).toBe(false));
    addGroup("photos", "2025");
    await act(async () => fireEvent.click(signButton() as HTMLButtonElement));
    await waitFor(() => expect(onIssued).toHaveBeenCalledOnce());
    expect(options()).toEqual([]);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Issue another Grant" })));
    expect(options()).toEqual(["scope:photos"]);
    expect(option("photos").checked).toBe(true);
    addGroup("photos", "2026");
    await act(async () => fireEvent.click(signButton() as HTMLButtonElement));
    await waitFor(() => expect(onIssued).toHaveBeenCalledTimes(2));

    expect(issue.mock.calls.map(([, input]) => input.node)).toEqual(["scope:photos/2025", "scope:photos/2026"]);
    expect(issue.mock.calls.map(([, input]) => input.bearer)).toEqual([SESSION.address, SESSION.address]);
    expect((screen.getByLabelText("Encryption Grant for group photos/2025") as HTMLTextAreaElement).value).toBe(
      `${GRANT}a`,
    );
    expect((screen.getByLabelText("Encryption Grant for group photos/2026") as HTMLTextAreaElement).value).toBe(
      `${GRANT}b`,
    );
  });

  const onwardSwitch = () => screen.getByRole("switch", { name: "Let this key share onward" }) as HTMLButtonElement;
  const signedDepth = async () => {
    const before = onIssued.mock.calls.length;
    await waitFor(() => expect(signButton()?.disabled).toBe(false));
    await act(async () => fireEvent.click(signButton() as HTMLButtonElement));
    await waitFor(() => expect(onIssued).toHaveBeenCalledTimes(before + 1));
    return issue.mock.calls.at(-1)?.[1].maxDepth;
  };

  it.each([
    { link: "no maxdepth", maxDepth: undefined, expected: 7 },
    { link: "maxdepth=3", maxDepth: 3, expected: 3 },
  ])("lets the key share onward by default, signing the link's depth for $link", async ({ maxDepth, expected }) => {
    await renderStep({ maxDepth });
    expect(onwardSwitch().getAttribute("aria-checked")).toBe("true");
    expect(onwardSwitch().disabled).toBe(false);
    expect(screen.queryByText("The link asked for no onward sharing.")).toBeNull();
    expect(await signedDepth()).toBe(expected);
  });

  it("signs maxDepth 0 when the owner turns onward sharing off, and keeps it off for the next Grant", async () => {
    await renderStep({ maxDepth: 3 });
    fireEvent.click(onwardSwitch());
    expect(onwardSwitch().getAttribute("aria-checked")).toBe("false");
    expect(await signedDepth()).toBe(0);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Issue another Grant" })));
    expect(onwardSwitch().getAttribute("aria-checked")).toBe("false");
    fireEvent.click(onwardSwitch());
    expect(await signedDepth()).toBe(3);
  });

  it("keeps onward sharing off and disabled when the link asks for maxdepth=0", async () => {
    await renderStep({ maxDepth: 0 });
    expect(onwardSwitch().getAttribute("aria-checked")).toBe("false");
    expect(onwardSwitch().disabled).toBe(true);
    expect(screen.getByText("The link asked for no onward sharing.")).toBeTruthy();
    fireEvent.click(onwardSwitch());
    expect(onwardSwitch().getAttribute("aria-checked")).toBe("false");
    expect(await signedDepth()).toBe(0);
  });
});
