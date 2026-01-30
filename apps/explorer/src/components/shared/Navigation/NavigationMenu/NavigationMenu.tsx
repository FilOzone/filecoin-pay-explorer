"use client";

import { useIsNavigationMenuActive } from "@filecoin-foundation/ui-filecoin/Navigation/hooks/useIsNavigationMenuActive";
import { desktopStyle } from "@filecoin-foundation/ui-filecoin/Navigation/NavigationMainLink";
import { NavigationMenu as SharedNavigationMenu } from "@filecoin-foundation/ui-filecoin/Navigation/NavigationMenu";
import { NavigationMenuPanel } from "@filecoin-foundation/ui-filecoin/Navigation/NavigationMenuPanel";
import clsx from "clsx";
import { BASE_DOMAIN } from "@/constants/site-metadata";
import type { NavigationMenuItem } from "@/types/navigation";
import { NavigationMenuLink } from "./NavigationMenuLink";

export function NavigationMenu({ label, items }: NavigationMenuItem) {
  const isActive = useIsNavigationMenuActive({ items, baseDomain: BASE_DOMAIN });

  return (
    <SharedNavigationMenu
      key={label}
      as='li'
      label={label}
      isCurrent={isActive}
      labelClassName={clsx(desktopStyle, "inline-flex items-center gap-2")}
    >
      <NavigationMenuPanel items={items} NavigationMenuLinkComponent={NavigationMenuLink} />
    </SharedNavigationMenu>
  );
}
