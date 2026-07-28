import { describe, expect, it, vi } from "vitest";

// cloudflare:email only resolves in the workers runtime; stub it so buildMimeEmail
// (which never touches it) can be exercised in plain node.
vi.mock("cloudflare:email", () => ({ EmailMessage: class {} }));

import { buildMimeEmail } from "../../../shared/emails/send";

const mime = buildMimeEmail({
  from: "noreply@filecoin.cloud",
  fromName: "Filecoin Onchain Cloud",
  to: "alice@example.com",
  subject: "Your account needs attention",
  html: "<p>Top up soon</p>",
  text: "Top up soon",
});

describe("buildMimeEmail", () => {
  it("sets the From, To and Subject headers", () => {
    expect(mime).toContain("From: Filecoin Onchain Cloud <noreply@filecoin.cloud>");
    expect(mime).toContain("To: alice@example.com");
    expect(mime).toContain("Subject: Your account needs attention");
  });

  it("carries both bodies as multipart/alternative, text before html", () => {
    const boundary = mime.match(/boundary="([^"]+)"/)?.[1];
    expect(boundary).toBeTruthy();

    const textAt = mime.indexOf('Content-Type: text/plain; charset="UTF-8"');
    const htmlAt = mime.indexOf('Content-Type: text/html; charset="UTF-8"');
    // Clients render the last alternative they understand, so html must come after text.
    expect(textAt).toBeGreaterThan(-1);
    expect(htmlAt).toBeGreaterThan(textAt);

    expect(mime).toContain("Top up soon");
    expect(mime).toContain("<p>Top up soon</p>");
    expect(mime).toContain(`--${boundary}--`);
  });

  it("uses CRLF line endings throughout", () => {
    expect(mime).toContain("\r\n");
    expect(mime).not.toMatch(/[^\r]\n/); // no bare LF
  });
});
