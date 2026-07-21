import { describe, expect, it } from "vitest";
import { validateEmailSyntax } from "../../shared/email-validation";

const validEmails = [
  "test@example.com",
  "user+tag@domain.org",
  "first.last@subdomain.example.co.uk",
  "disposable.style.email.with+symbol@example.com",
  "other.email-with-hyphen@and.subdomains.example.com",
  "用户@例子.中国",
];

const invalidEmails = [
  "not-an-email",
  "missing@tld",
  "@no-local-part.com",
  "",
  "@",
  "double@@at.com",
  "space in@local.com",
  "test@domain..com",
  "test@.domain.com",
  `${"a".repeat(65)}@example.com`,
  `test@${"a".repeat(254)}.com`,
];

describe("validateEmailSyntax", () => {
  describe("valid emails", () => {
    validEmails.forEach((email) => {
      it(`accepts: ${email}`, () => {
        expect(validateEmailSyntax(email).ok).toBe(true);
      });
    });
  });

  describe("invalid emails", () => {
    invalidEmails.forEach((email) => {
      it(`rejects: ${email || "(empty string)"}`, () => {
        expect(validateEmailSyntax(email).ok).toBe(false);
      });
    });
  });
});
