// Referenced from: https://ui.shadcn.com/blocks/sidebar#sidebar-11

import { ChevronRight, File, Folder, FolderOpen, X } from "lucide-react";
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
import { FileTreeType, isFolder, TreeFile, TreeFolder } from "@/lib/files";

type OwnProps = {
  files: FileTreeType;
};
export function FileTree({
  ...props
}: React.ComponentProps<typeof Sidebar> & OwnProps) {
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
              {/* TODO: DELETE THIS LATER */}
              <SidebarMenuItem />
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

function Tree({ item }: { item: TreeFolder | TreeFile }) {
  const isItemFolder = isFolder(item);

  if (!isItemFolder) {
    return (
      <SidebarMenuButton
        className="data-[active=true]:bg-transparent"
        type="button"
        size="big"
      >
        <File />
        {item.name}
      </SidebarMenuButton>
    );
  }

  return (
    <SidebarMenuItem>
      <Collapsible className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90">
        <CollapsibleTrigger asChild>
          <SidebarMenuButton>
            <ChevronRight className="transition-transform" />
            <Folder className="hidden group-data-[state=closed]/collapsible:block" />
            <FolderOpen className="hidden group-data-[state=open]/collapsible:block" />
            {item.name}
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mr-0 pr-0">
            {item.children.map((subItem, index) => (
              <Tree key={index} item={subItem} />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}
