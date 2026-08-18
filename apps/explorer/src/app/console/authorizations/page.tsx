"use client";
import { OperatorApprovalsSection } from "@/components/UserConsole";
import ConsoleAccountGate from "@/components/UserConsole/ConsoleAccountGate";

const AuthorizationsPage = () => (
  <ConsoleAccountGate>{({ account }) => <OperatorApprovalsSection account={account} />}</ConsoleAccountGate>
);

export default AuthorizationsPage;
