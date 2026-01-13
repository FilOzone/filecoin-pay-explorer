import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supportedChains } from "./services/wagmi/config";
import type { Network } from "./types";

const VALID_NETWORKS = supportedChains.map((chain) => chain.slug);
const DEFAULT_NETWORK: Network = "mainnet";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    return NextResponse.redirect(new URL(`/${DEFAULT_NETWORK}`, request.url));
  }

  if (pathname.startsWith("/console")) {
    return NextResponse.next();
  }

  const networkMatch = pathname.match(/^\/([^/]+)/);

  if (networkMatch) {
    const network = networkMatch[1];

    if (!(VALID_NETWORKS as readonly string[]).includes(network)) {
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
