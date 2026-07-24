// RFC 5321 length limits
const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;
const MAX_DOMAIN_LENGTH = 253;
const MAX_LABEL_LENGTH = 63;

// Accepts + addressing and Unicode (user+tag@domain.com, 用户@例子.中国)
// [^\s@] matches any non-whitespace, non-@ char including Unicode
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailValidationResult = { ok: true } | { ok: false; error: string };

export function validateEmailSyntax(email: string): EmailValidationResult {
  if (email.length > MAX_EMAIL_LENGTH) {
    return { ok: false, error: "Email address too long" };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { ok: false, error: "Invalid email format" };
  }

  const atIndex = email.lastIndexOf("@");
  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (localPart.length > MAX_LOCAL_LENGTH) {
    return { ok: false, error: "Email local part too long" };
  }

  if (domain.length > MAX_DOMAIN_LENGTH) {
    return { ok: false, error: "Email domain too long" };
  }

  for (const label of domain.split(".")) {
    if (label.length === 0 || label.length > MAX_LABEL_LENGTH) {
      return { ok: false, error: "Invalid email domain" };
    }
  }

  return { ok: true };
}

export function validateEmail(email: string): EmailValidationResult {
  return validateEmailSyntax(email);
}
