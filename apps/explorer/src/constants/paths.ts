import { createPathConfig } from "@/utils/createPathConfig";

export type StaticPath =
  | "/"
  | "/console"
  | "/console/authorizations"
  | "/console/notifications"
  | "/rails"
  | "/operators"
  | "/accounts"
  | "/privacy-policy"
  | "/terms-of-use";

export const PATHS = {
  CONSOLE: createPathConfig("/console", "Console"),
  CONSOLE_AUTHORIZATIONS: createPathConfig("/console/authorizations", "Authorizations"),
  CONSOLE_ALERTS: createPathConfig("/console/notifications", "Alerts"),
  RAILS: createPathConfig("/rails", "Rails"),
  OPERATORS: createPathConfig("/operators", "Operators"),
  ACCOUNTS: createPathConfig("/accounts", "Accounts"),
  PRIVACY_POLICY: createPathConfig("/privacy-policy", "Privacy Policy"),
  TERMS_OF_USE: createPathConfig("/terms-of-use", "Terms of Use"),
};
