import { createPathConfig } from "@/utils/createPathConfig";

export type StaticPath = "/" | "/rails" | "/operators" | "/accounts" | "/privacy-policy" | "/terms-of-use";

export const PATHS = {
  RAILS: createPathConfig("/rails", "Rails"),
  OPERATORS: createPathConfig("/operators", "Operators"),
  ACCOUNTS: createPathConfig("/accounts", "Accounts"),
  PRIVACY_POLICY: createPathConfig("/privacy-policy", "Privacy Policy"),
  TERMS_OF_USE: createPathConfig("/terms-of-use", "Terms of Use"),
};
