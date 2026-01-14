"use client";

import { NavigationMainLink } from "@filecoin-foundation/ui-filecoin/Navigation/NavigationMainLink";
import { useNavigationItems } from "@/hooks/useNavigationItems";
import NetworkOptions from "./components/NetworkOptions";

export function DesktopNavigation() {
  const { headerNavigationItems } = useNavigationItems();

  return (
    <div className='flex w-full items-center justify-end gap-4'>
      <ul aria-label='Main navigation menu' className='flex items-center gap-6'>
        {headerNavigationItems.map((item) => (
          <li key={item.href}>
            <NavigationMainLink on='desktop' {...item} />
          </li>
        ))}

        <NetworkOptions />
      </ul>
    </div>
  );
}
