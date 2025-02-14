import { ChevronRight, File, Folder, X } from "lucide-react";
import * as React from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";

type TreeType = string | TreeType[];

export function FileTree({
  ...props
}: React.ComponentProps<typeof Sidebar> & { files: TreeType[] }) {
  return (
    <Sidebar
      {...props}
      className="relative w-full"
      variant="filetree"
      collapsible="none"
    >
      <SidebarContent className="h-full overflow-y-scroll">
        <SidebarGroup className="relative h-full">
          <SidebarGroupLabel>
            <div className="flex w-full items-center justify-between">
              <div>Files</div>
              <X className="h-4 w-4 cursor-pointer" />
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent className="h-full">
            <SidebarMenu>
              {props.files.map((item, index) => (
                <Tree key={index} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function Tree({ item }: { item: TreeType }) {
  const [name, ...items] = Array.isArray(item) ? item : [item];

  if (!items.length) {
    return (
      <SidebarMenuButton
        isActive={name === "button.tsx"}
        className="data-[active=true]:bg-transparent"
        type="button"
        size="big"
      >
        <File />
        {name}
      </SidebarMenuButton>
    );
  }

  return (
    <SidebarMenuItem>
      <Collapsible
        className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
        defaultOpen={name === "components" || name === "ui"}
      >
        <CollapsibleTrigger asChild>
          <SidebarMenuButton>
            <ChevronRight className="transition-transform" />
            <Folder />
            {name}
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mr-0 pr-0">
            {items.map((subItem, index) => (
              <Tree key={index} item={subItem} />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}
