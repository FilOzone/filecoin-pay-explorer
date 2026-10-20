import assert from "node:assert/strict";
import { getAddress } from "viem";
import { describe, it } from "vitest";
import { legacySetupPath, parseSetupLink } from "./setupLink";

const LOWERCASE = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const CHECKSUMMED = getAddress(LOWERCASE);

const link = (query: string) => parseSetupLink(new URLSearchParams(query));
const keyLink = (extra = "") => link(`authorize=${LOWERCASE}&scopes=addPieces&network=calibration${extra}`);

describe("parseSetupLink", () => {
  it("reads a bare link as no request, on the wallet's own network", () => {
    assert.deepEqual(link(""), {
      network: null,
      sessionKey: null,
      deposit: null,
      balance: null,
      approvalOnly: false,
      unlimitedApproval: false,
    });
    assert.deepEqual(link("foo=bar"), {
      network: null,
      sessionKey: null,
      deposit: null,
      balance: null,
      approvalOnly: false,
      unlimitedApproval: false,
    });
  });

  it("reads a network-only link as the approval and funding steps for that network", () => {
    assert.deepEqual(link("network=mainnet"), {
      network: "mainnet",
      sessionKey: null,
      deposit: null,
      balance: null,
      approvalOnly: false,
      unlimitedApproval: false,
    });
  });

  it("reads a complete session-key link", () => {
    assert.deepEqual(keyLink(), {
      network: "calibration",
      sessionKey: { address: CHECKSUMMED, scopes: ["addPieces"], name: null, days: null },
      deposit: null,
      balance: null,
      approvalOnly: false,
      unlimitedApproval: false,
    });
  });

  it("reads the fil CLI's signer as the key to authorize", () => {
    assert.deepEqual(link(`signer=${LOWERCASE}&scopes=addPieces&network=mainnet`), {
      network: "mainnet",
      sessionKey: { address: CHECKSUMMED, scopes: ["addPieces"], name: null, days: null },
      deposit: null,
      balance: null,
      approvalOnly: false,
      unlimitedApproval: false,
    });
  });

  it("reads a funding link, with and without a deposit", () => {
    assert.deepEqual(link("deposit=2&operator=fwss&network=calibration"), {
      network: "calibration",
      sessionKey: null,
      deposit: "2",
      balance: null,
      approvalOnly: false,
      unlimitedApproval: false,
    });
    assert.deepEqual(link("operator=FWSS&network=mainnet"), {
      network: "mainnet",
      sessionKey: null,
      deposit: null,
      balance: null,
      approvalOnly: true,
      unlimitedApproval: false,
    });
  });

  it("reads a key and a deposit in one link", () => {
    assert.deepEqual(keyLink("&deposit=1.5"), {
      network: "calibration",
      sessionKey: { address: CHECKSUMMED, scopes: ["addPieces"], name: null, days: null },
      deposit: "1.5",
      balance: null,
      approvalOnly: false,
      unlimitedApproval: false,
    });
  });

  it("carries a suggested name, cleaned like any other key name, and treats an unusable one as none", () => {
    const name = (value: string) => {
      const result = keyLink(`&name=${encodeURIComponent(value)}`);
      return "sessionKey" in result ? result.sessionKey?.name : "refused";
    };
    assert.deepEqual(["  filecoin-cli  ", "ci‮vne.yek", "x".repeat(80), "", "‮"].map(name), [
      "filecoin-cli",
      "civne.yek",
      "x".repeat(64),
      null,
      null,
    ]);
  });

  it("carries suggested days, capped, and treats unusable days as none", () => {
    const days = (value: string) => {
      const result = keyLink(`&days=${value}`);
      return "sessionKey" in result ? result.sessionKey?.days : "refused";
    };
    assert.deepEqual(["7", "365", "366", "0", "1.5", "soon"].map(days), [7, 365, 365, null, null, null]);
  });

  it("refuses a key request with a bad or missing address, reporting the address first", () => {
    assert.deepEqual(link("scopes=addPieces&network=mainnet"), { error: "not-an-address" });
    assert.deepEqual(link("authorize=&scopes=addPieces&network=mainnet"), { error: "not-an-address" });
    assert.deepEqual(link("authorize=0xnope"), { error: "not-an-address" });
    assert.deepEqual(link(`authorize=0x${LOWERCASE.slice(2).toUpperCase()}&scopes=addPieces&network=mainnet`), {
      error: "bad-checksum",
    });
  });

  it("refuses a request whose network is missing or misspelled, so the wallet's chain can never stand in", () => {
    assert.deepEqual(link(`authorize=${LOWERCASE}&scopes=addPieces`), { error: "no-network" });
    assert.deepEqual(link(`authorize=${LOWERCASE}&network=calibraiton`), { error: "no-network" });
    assert.deepEqual(link("deposit=2&operator=fwss"), { error: "no-network" });
  });

  it("refuses a key request with no usable scopes", () => {
    assert.deepEqual(link(`authorize=${LOWERCASE}&network=calibration`), { error: "no-scopes" });
    assert.deepEqual(link(`authorize=${LOWERCASE}&scopes=nope&network=calibration`), { error: "no-scopes" });
  });

  it("refuses a deposit it names but cannot read, instead of setting up without one", () => {
    for (const deposit of ["", "0", "junk", "-1", "1e3"]) {
      assert.deepEqual(link(`deposit=${deposit}&network=mainnet`), { error: "bad-deposit" }, deposit);
    }
    assert.deepEqual(keyLink("&deposit=0"), { error: "bad-deposit" });
  });

  it("asks only for the approval when the link names the operator or the approval, but no deposit", () => {
    const approvalOnly = (query: string) => {
      const result = link(query);
      return "error" in result ? result.error : result.approvalOnly;
    };
    assert.deepEqual(
      [
        "operator=fwss&network=mainnet",
        "approval=unlimited&network=mainnet",
        "operator=fwss&deposit=2&network=mainnet",
        "operator=fwss&balance=2&network=mainnet",
        "network=mainnet",
        `authorize=${LOWERCASE}&scopes=addPieces&network=mainnet`,
        "",
      ].map(approvalOnly),
      [true, true, false, false, false, false, false],
    );
  });

  it("reads approval=unlimited as requiring Warm Storage without spending limits", () => {
    assert.deepEqual(link("operator=fwss&network=mainnet&approval=unlimited"), {
      network: "mainnet",
      sessionKey: null,
      deposit: null,
      balance: null,
      approvalOnly: true,
      unlimitedApproval: true,
    });
    assert.deepEqual(link("approval=Unlimited&network=calibration"), {
      network: "calibration",
      sessionKey: null,
      deposit: null,
      balance: null,
      approvalOnly: true,
      unlimitedApproval: true,
    });
  });

  it("refuses an approval it cannot read, instead of accepting any approval", () => {
    for (const approval of ["", "max", "limited", "true"]) {
      assert.deepEqual(link(`approval=${approval}&network=mainnet`), { error: "bad-approval" }, approval);
    }
    assert.deepEqual(link("approval=unlimited"), { error: "no-network" });
  });

  it("reads balance as the target the tool needs, beside the amount to add", () => {
    const result = link("deposit=10&balance=17.34&network=mainnet");
    assert.deepEqual("error" in result ? result : { deposit: result.deposit, balance: result.balance }, {
      deposit: "10",
      balance: "17.34",
    });
    for (const balance of ["", "0", "junk"]) {
      assert.deepEqual(link(`deposit=10&balance=${balance}&network=mainnet`), { error: "bad-balance" }, balance);
    }
  });

  it("refuses an operator other than Warm Storage", () => {
    assert.deepEqual(link("operator=0x8408502033c418e1bbc97ce9ac48e5528f371a9f&network=mainnet"), {
      error: "bad-operator",
    });
    assert.deepEqual(link("operator=&network=mainnet"), { error: "bad-operator" });
  });

  it("never throws on hostile input", () => {
    for (const input of ["%", "<script>", "a".repeat(10_000), "\u0000"]) {
      const query = `authorize=${encodeURIComponent(input)}&scopes=${encodeURIComponent(input)}&deposit=${encodeURIComponent(input)}`;
      assert.doesNotThrow(() => link(query), input);
    }
  });
});

describe("legacySetupPath", () => {
  const path = (pathname: string, query: string) => legacySetupPath(pathname, new URLSearchParams(query));

  it("moves a session keys authorize link to the setup page with its query intact", () => {
    assert.equal(
      path("/console/session-keys", `authorize=${LOWERCASE}&scopes=addPieces&network=mainnet&name=cli&days=7`),
      `/console/setup?authorize=${LOWERCASE}&scopes=addPieces&network=mainnet&name=cli&days=7`,
    );
    // A broken pairing request still lands where its error is explained.
    assert.equal(path("/console/session-keys", "scopes=addPieces"), "/console/setup?scopes=addPieces");
  });

  it("moves a dashboard funding link, with or without a deposit", () => {
    assert.equal(
      path("/console", "deposit=2&operator=fwss&network=mainnet"),
      "/console/setup?deposit=2&operator=fwss&network=mainnet",
    );
    assert.equal(path("/console", "operator=fwss&network=mainnet"), "/console/setup?operator=fwss&network=mainnet");
  });

  it("leaves revoke links, plain pages, and other console pages where they are", () => {
    assert.equal(path("/console/session-keys", `revoke=${LOWERCASE}&network=mainnet`), null);
    assert.equal(path("/console/session-keys", `authorize=${LOWERCASE}&revoke=${LOWERCASE}&network=mainnet`), null);
    assert.equal(path("/console/session-keys", ""), null);
    assert.equal(path("/console", ""), null);
    assert.equal(path("/console", "network=mainnet"), null);
    assert.equal(path("/console/notifications", "deposit=2"), null);
    assert.equal(path("/console/setup", "deposit=2&network=mainnet"), null);
  });
});
