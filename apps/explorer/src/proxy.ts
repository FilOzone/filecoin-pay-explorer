import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supportedChains } from "@/services/wagmi/config";
import { DEFAULT_NETWORK } from "@/utils/constants";
import { legacySetupPath } from "@/utils/setupLink";

const VALID_NETWORKS: readonly string[] = supportedChains.map((chain) => chain.slug);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    return NextResponse.redirect(new URL(`/${DEFAULT_NETWORK}`, request.url));
  }

  if (pathname.startsWith("/console")) {
    // Older CLIs still print the pre-setup-page links.
    const setupPath = legacySetupPath(pathname, request.nextUrl.searchParams);
    return setupPath ? NextResponse.redirect(new URL(setupPath, request.url)) : NextResponse.next();
  }

  const networkMatch = pathname.match(/^\/([^/]+)/);

  if (networkMatch) {
    const network = networkMatch[1];

    if (!VALID_NETWORKS.includes(network)) {
      const pathAfterNetwork = pathname.slice(network.length + 1);
      const newPath = `/${DEFAULT_NETWORK}${pathAfterNetwork}`;
      return NextResponse.redirect(new URL(newPath, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|.*\\..*).*)"],
};
