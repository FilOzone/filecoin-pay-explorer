"use client";
import { Button } from "@filecoin-pay/ui/components/button";
import { Logo } from "@filecoin-pay/ui/components/logo";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@filecoin-pay/ui/components/navigation-menu";
import { Sheet, SheetContent, SheetTrigger } from "@filecoin-pay/ui/components/sheet";
import { ThemeToggle } from "@filecoin-pay/ui/components/theme-toggle";
import { cn } from "@filecoin-pay/ui/lib/utils";
import { LayoutDashboard, Menu, Network, Shield, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import NetworkIndicator from "./NetworkIndicator";

const navigationLinks = [
  { name: "Console", href: "/console", icon: LayoutDashboard },
  { name: "Rails", href: "/rails", icon: Network },
  { name: "Accounts", href: "/accounts", icon: Users },
  { name: "Operators", href: "/operators", icon: Shield },
];

function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const isActiveLink = (href: string) => {
    return pathname === href || pathname?.startsWith(`${href}/`);
  };

  return (
    <header className='sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'>
      <div className='max-w-screen-2xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8'>
        {/* Logo */}
        <Link href='/' className='inline-flex items-center gap-2 transition-opacity hover:opacity-80'>
          <Logo />
        </Link>

        {/* Desktop Navigation */}
        <NavigationMenu className='hidden md:flex'>
          <NavigationMenuList>
            {navigationLinks.map((link) => {
              const Icon = link.icon;
              const isActive = isActiveLink(link.href);
              return (
                <NavigationMenuItem key={link.href}>
                  <NavigationMenuLink active={isActive} asChild>
                    <Link href={link.href} className='flex-row items-center gap-2 transition-all duration-200'>
                      <Icon className='h-4 w-4' />
                      {link.name}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              );
            })}
          </NavigationMenuList>
        </NavigationMenu>

        {/* Right Side Actions */}
        <div className='flex items-center gap-3'>
          <NetworkIndicator />
          <ThemeToggle />

          {/* Mobile Menu */}
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild className='md:hidden'>
              <Button variant='ghost' size='icon' aria-label='Toggle menu'>
                {isOpen ? <X className='h-5 w-5' /> : <Menu className='h-5 w-5' />}
              </Button>
            </SheetTrigger>
            <SheetContent side='right' className='w-72'>
              <nav className='flex flex-col gap-2 mt-12'>
                {navigationLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive = isActiveLink(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200",
                        "hover:bg-accent hover:text-accent-foreground",
                        isActive ? "bg-accent text-accent-foreground font-semibold" : "text-muted-foreground",
                      )}
                    >
                      <Icon className='h-5 w-5' />
                      {link.name}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export default Header;
