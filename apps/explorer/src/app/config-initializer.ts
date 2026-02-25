import { setUIConfig } from "@filecoin-foundation/ui-filecoin/config/ui-config";
import Link from "next/link";

import { BASE_DOMAIN } from "@/constants/site-metadata";

export function initUIConfig() {
  setUIConfig({
    baseDomain: BASE_DOMAIN,
    Link: Link,
  });
}
