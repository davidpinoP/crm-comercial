"use client";
import * as React from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const Dropdown = Menu.Root;
export const DropdownTrigger = Menu.Trigger;

export function DropdownContent({ className, align = "end", ...props }: React.ComponentPropsWithoutRef<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={6}
        className={cn("z-50 min-w-48 rounded-xl border border-line bg-paper p-1 shadow-pop", className)}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownItem({ className, danger, ...props }: React.ComponentPropsWithoutRef<typeof Menu.Item> & { danger?: boolean }) {
  return (
    <Menu.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none select-none data-[highlighted]:bg-sunken [&_svg]:size-4 [&_svg]:text-ink-muted",
        danger && "text-negative [&_svg]:text-negative",
        className,
      )}
      {...props}
    />
  );
}

export const DropdownSeparator = () => <Menu.Separator className="my-1 h-px bg-line" />;
export const DropdownLabel = ({ children }: { children: React.ReactNode }) => (
  <Menu.Label className="px-2.5 pt-1.5 pb-1 text-[12px] text-ink-muted">{children}</Menu.Label>
);
