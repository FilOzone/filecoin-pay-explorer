import { PATHS } from "@/constants/paths";
import { FOC_URLS } from "@/constants/site-metadata";

type NavItem = {
  label: string;
  href: string;
};

type ExpandedNavItem = NavItem & {
  description: string;
};

export type NavigationMenuItem = {
  label: string;
  items: Array<{
    title: string;
    links: Array<ExpandedNavItem>;
  }>;
};

type HeaderNavItem = NavItem | NavigationMenuItem;

export const headerNavigationItems: Array<HeaderNavItem> = [
  {
    label: PATHS.RAILS.label,
    href: PATHS.RAILS.path,
  },
  {
    label: PATHS.OPERATORS.label,
    href: PATHS.OPERATORS.path,
  },
  {
    label: PATHS.ACCOUNTS.label,
    href: PATHS.ACCOUNTS.path,
  },
  {
    label: "Documentation",
    href: FOC_URLS.documentation,
  },
];

export const mobileNavigationItems = headerNavigationItems
  .map((item) => {
    if ("href" in item) {
      return item;
    }

    return null;
  })
  .filter(Boolean) as Array<NavItem>;
