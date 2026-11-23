import { importSPKI, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { isRecord } from "./quote";

export function privyIdentityToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  // Browsers may keep the Privy identity in an HttpOnly cookie. Only accept it on same-origin POSTs.
  const cookie =
    request.headers.get("origin") === request.nextUrl.origin ? request.cookies.get("privy-id-token") : null;
  return authorization === null ? cookie?.value : authorization.match(/^Bearer (\S+)$/)?.[1];
}

export async function verifiedUser(token: string, appId: string, verificationKey: string, address: string) {
  const key = await importSPKI(verificationKey.replaceAll("\\n", "\n"), "ES256");
  const { payload } = await jwtVerify(token, key, {
    typ: "JWT",
    algorithms: ["ES256"],
    issuer: "privy.io",
    audience: appId,
    requiredClaims: ["exp", "sub", "iat", "linked_accounts"],
  });
  if (!payload.sub?.startsWith("did:privy:") || typeof payload.linked_accounts !== "string") return null;
  const accounts: unknown = JSON.parse(payload.linked_accounts);
  const ownsWallet =
    Array.isArray(accounts) &&
    accounts.some(
      (account: unknown) =>
        isRecord(account) &&
        account.type === "wallet" &&
        account.chain_type === "ethereum" &&
        account.wallet_client_type === "privy" &&
        typeof account.address === "string" &&
        account.address.toLowerCase() === address.toLowerCase(),
    );
  return ownsWallet ? payload.sub : null;
}
