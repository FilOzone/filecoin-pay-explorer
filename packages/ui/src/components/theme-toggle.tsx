"use client";

import { Button } from "@filecoin-pay/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@filecoin-pay/ui/components/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@filecoin-pay/ui/components/tooltip";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [suppressTooltip, setSuppressTooltip] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button variant='ghost' size='icon' aria-label='Toggle theme' className='shrink-0 cursor-pointer'>
        <Sun className='size-5' />
      </Button>
    );
  }

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Laptop;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        // When menu closes, suppress tooltip until mouse leaves the trigger.
        if (!open) {
          setTooltipOpen(false);
          setSuppressTooltip(true);
        }
      }}
    >
      <Tooltip open={tooltipOpen}>
        <DropdownMenuTrigger asChild>
          <TooltipTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              aria-label='Toggle theme'
              className='shrink-0 cursor-pointer'
              onMouseEnter={() => {
                if (!suppressTooltip) setTooltipOpen(true);
              }}
              onMouseLeave={() => {
                setTooltipOpen(false);
                setSuppressTooltip(false);
              }}
              onFocus={() => setTooltipOpen(false)}
              onBlur={() => setTooltipOpen(false)}
              onClick={() => {
                setTooltipOpen(false);
                setSuppressTooltip(true);
              }}
            >
              <Icon className='size-5' />
            </Button>
          </TooltipTrigger>
        </DropdownMenuTrigger>
        <TooltipContent>Theme</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align='end' className='min-w-40'>
        <DropdownMenuItem
          onClick={() => {
            setTheme("light");
            setTooltipOpen(false);
            setSuppressTooltip(true);
          }}
        >
          <Sun className='mr-2 size-4' /> Light
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setTheme("dark");
            setTooltipOpen(false);
            setSuppressTooltip(true);
          }}
        >
          <Moon className='mr-2 size-4' /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setTheme("system");
            setTooltipOpen(false);
            setSuppressTooltip(true);
          }}
        >
          <Laptop className='mr-2 size-4' /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
