"use client";

import Link from "next/link";

import { useShallow } from "zustand/react/shallow";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { APP_CONFIG } from "@/config/app-config";
import { useCurrentUser } from "@/hooks/use-current-user";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const currentUser = useCurrentUser();
  const { isMobile, setOpenMobile } = useSidebar();
  const { sidebarVariant, sidebarCollapsible, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.sidebarVariant,
      sidebarCollapsible: s.sidebarCollapsible,
      isSynced: s.isSynced,
    })),
  );

  const variant = isSynced ? sidebarVariant : props.variant;
  const collapsible = isSynced ? sidebarCollapsible : props.collapsible;

  return (
    <Sidebar {...props} variant={variant} collapsible={collapsible}>
      <SidebarHeader className="justify-center border-b border-sidebar-border md:h-14">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={APP_CONFIG.name} className="h-10 gap-2.5 px-2">
              <Link
                prefetch={false}
                href="/function/tasks"
                aria-label={APP_CONFIG.name}
                onNavigate={isMobile ? () => setOpenMobile(false) : undefined}
              >
                <span
                  aria-hidden="true"
                  className="size-6 shrink-0 bg-sidebar-primary [mask-position:center] [mask-repeat:no-repeat] [mask-size:150%] group-data-[collapsible=icon]:size-4"
                  style={{ maskImage: "url('/logo.svg')" }}
                />
                <span className="font-semibold text-[16px] tracking-tight text-sidebar-accent-foreground">
                  {APP_CONFIG.name}
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="group-data-[collapsible=icon]:overflow-y-auto">
        <nav aria-label="Main navigation">
          <NavMain items={sidebarItems} />
        </nav>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <NavUser user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
