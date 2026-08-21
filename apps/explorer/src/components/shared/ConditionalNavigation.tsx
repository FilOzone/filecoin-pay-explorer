"use client";

import { usePathname } from "next/navigation";
import Navigation from "./Navigation/Navigation";

// Console routes render their own header (see UserConsole/ConsoleHeader), so the
// global site navigation is suppressed there. Every other route is unaffected.
function isConsoleRoute(pathname: string | null): boolean {
  return pathname === "/console" || Boolean(pathname?.startsWith("/console/"));
}

function ConditionalNavigation() {
  const pathname = usePathname();

  if (isConsoleRoute(pathname)) return null;

  return <Navigation backgroundVariant='light' />;
}

export default ConditionalNavigation;
