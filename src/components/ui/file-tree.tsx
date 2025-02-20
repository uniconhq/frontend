// Referenced from: https://ui.shadcn.com/blocks/sidebar#sidebar-11

import { ChevronRight, File, FileDigit, Folder, X } from "lucide-react";
import * as React from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { cn } from "@/lib/utils";

type OwnProps = {
  files: FileTreeType;
  onCloseFileTree?: () => void;
};
export function FileTree({ ...props }: React.ComponentProps<typeof Sidebar> & OwnProps) {
  return (
    <Sidebar {...props} className="relative h-full w-[200px] rounded-md border" variant="filetree" collapsible="none">
      <SidebarContent className="h-full overflow-y-scroll">
        <SidebarGroup className="relative h-full">
          {props.onCloseFileTree && (
            <SidebarGroupLabel>
              <div className="flex w-full items-center justify-between">
                <div>Files</div>
                <X className="h-4 w-4 cursor-pointer" onClick={props.onCloseFileTree} />
              </div>
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent className="h-full">
            {props.files && (
              <SidebarMenu>
                {props.files.map((item, index) => (
                  <Tree key={index} item={item} />
                ))}
              </SidebarMenu>
            )}
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
        className={cn({
          "bg-emerald-900 hover:bg-emerald-800": item.highlighted,
          "data-[active=true]:bg-transparent": !item.highlighted,
        })}
        type="button"
        size="big"
        onClick={item.onClick}
      >
        {item.isBinary ? <FileDigit /> : <File />}
        <span contentEditable spellCheck={false}>
          {item.name}
        </span>
      </SidebarMenuButton>
    );
  }

  return (
    <SidebarMenuItem>
      <Collapsible className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90">
        <CollapsibleTrigger asChild>
          <SidebarMenuButton>
            <ChevronRight className="transition-transform" />
            <Folder />
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
