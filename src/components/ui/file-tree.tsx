// Referenced from: https://ui.shadcn.com/blocks/sidebar#sidebar-11

import { ChevronRight, File, FileDigit, FilePlus, Folder, FolderPlus, X } from "lucide-react";
import * as React from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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

import { Button } from "./button";

type OwnProps = {
  files: FileTreeType;
  onCloseFileTree?: () => void;
  onPathChange: (oldPath: string, newPath: string) => void;
};

export function FileTree({
  onCloseFileTree,
  onPathChange,
  files,
  ...props
}: React.ComponentProps<typeof Sidebar> & OwnProps) {
  return (
    <Sidebar {...props} className="relative h-full w-[300px] rounded-md border" variant="filetree" collapsible="none">
      <SidebarContent className="h-full overflow-y-scroll">
        <SidebarGroup className="relative h-full">
          {onCloseFileTree && (
            <SidebarGroupLabel>
              <div className="flex w-full items-center justify-between">
                <div>Files</div>
                <X className="h-4 w-4 cursor-pointer" onClick={onCloseFileTree} />
              </div>
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent className="h-full">
            {files && (
              <SidebarMenu>
                {files.map((item, index) => (
                  <Tree key={index} item={item} onPathChange={onPathChange} />
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" className="h-8 w-8">
            <FilePlus />
          </Button>
          <Button variant="outline" className="h-8 w-8">
            <FolderPlus />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function Tree({
  item,
  onPathChange,
}: {
  item: TreeFolder | TreeFile;
  onPathChange?: (oldPath: string, newPath: string) => void;
}) {
  const isItemFolder = isFolder(item);
  // for file/folder name editing
  const [isEditing, setIsEditing] = React.useState(false);

  const handleNameChange = (newName: string | null) => {
    if (!newName) {
      return;
    }
    const newPath = item.path.split("/").slice(0, -1).join("/") + "/" + newName;
    onPathChange?.(item.path, newPath);
  };

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
        <span
          className="inline-block"
          contentEditable={isEditing}
          spellCheck={false}
          onClick={() => onPathChange && setIsEditing(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setIsEditing(false);
              handleNameChange(e.currentTarget.textContent);
            }
          }}
          onBlur={(e) => {
            setIsEditing(false);
            handleNameChange(e.currentTarget.textContent);
          }}
        >
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
            <span
              className="inline-block"
              contentEditable={isEditing}
              spellCheck={false}
              onClick={() => onPathChange && setIsEditing(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setIsEditing(false);
                  handleNameChange(e.currentTarget.textContent);
                }
              }}
              onBlur={(e) => {
                setIsEditing(false);
                handleNameChange(e.currentTarget.textContent);
              }}
            >
              {item.name}
            </span>
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mr-0 pr-0">
            {item.children.map((subItem, index) => (
              <Tree key={index} item={subItem} onPathChange={onPathChange} />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}
