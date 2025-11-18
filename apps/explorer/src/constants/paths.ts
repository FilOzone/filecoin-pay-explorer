import { createPathConfig } from "@/utils/createPathConfig";

export type StaticPath = "/" | "/console" | "/rails" | "/operators" | "/accounts" | "/privacy-policy" | "/terms-of-use";

export const PATHS = {
  CONSOLE: createPathConfig("/console", "Console"),
  RAILS: createPathConfig("/rails", "Rails"),
  OPERATORS: createPathConfig("/operators", "Operators"),
  ACCOUNTS: createPathConfig("/accounts", "Accounts"),
  PRIVACY_POLICY: createPathConfig("/privacy-policy", "Privacy Policy"),
  TERMS_OF_USE: createPathConfig("/terms-of-use", "Terms of Use"),
};
