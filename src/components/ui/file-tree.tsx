// Referenced from: https://ui.shadcn.com/blocks/sidebar#sidebar-11
import { ChevronRight, File, FileDigit, FilePlus, Folder, FolderPlus, X } from "lucide-react";
import * as React from "react";
import { useDrag, useDrop } from "react-dnd";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
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
  onPathChange?: (oldPath: string, newPath: string) => void;
  onFileAdd?: () => void;
  onFolderAdd?: () => void;
  onPathDelete?: (path: string) => void;
};

const DeleteContextMenu: React.FC<
  React.PropsWithChildren & { path: string; onPathDelete?: (path: string) => void }
> = ({ path, onPathDelete, children }) => {
  if (!onPathDelete) {
    return <>{children}</>;
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onPathDelete(path)}>Delete</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export function FileTree({
  onCloseFileTree,
  onPathChange,
  onFileAdd,
  onFolderAdd,
  onPathDelete,
  files,
  ...props
}: React.ComponentProps<typeof Sidebar> & OwnProps) {
  const [, drop] = useDrop<TreeFile | TreeFolder>(() => ({
    accept: "File",
    drop: (draggedItem, monitor) => {
      if (monitor.didDrop()) {
        return;
      }
      if ("children" in draggedItem) {
        onPathChange?.(draggedItem.path, draggedItem.name + "/");
      } else {
        onPathChange?.(draggedItem.path, draggedItem.name);
      }
    },
  }));

  return (
    <Sidebar {...props} className="relative h-full w-[300px] rounded-md border" variant="filetree" collapsible="none">
      <SidebarContent className="h-full overflow-y-scroll" ref={drop}>
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
                  <Tree key={index} item={item} onPathChange={onPathChange} onPathDelete={onPathDelete} />
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {(onFileAdd || onFolderAdd) && (
        <SidebarFooter>
          <div className="flex items-center justify-end gap-2">
            {onFileAdd && (
              <Button variant="outline" className="h-8 w-8" type="button" onClick={onFileAdd}>
                <FilePlus />
              </Button>
            )}
            {onFolderAdd && (
              <Button variant="outline" className="h-8 w-8" type="button" onClick={onFolderAdd}>
                <FolderPlus />
              </Button>
            )}
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}

function Tree({
  item,
  onPathChange,
  onPathDelete,
}: {
  item: TreeFolder | TreeFile;
  onPathChange?: (oldPath: string, newPath: string) => void;
  onPathDelete?: (path: string) => void;
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

  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: "File", // todo: refactor
      item,
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    }),
    [item],
  );

  const [, drop] = useDrop<TreeFile | TreeFolder>(
    () => ({
      accept: "File",
      drop: (draggedItem, monitor) => {
        if (monitor.didDrop()) {
          return;
        }
        if (!isFolder(item)) {
          return;
        }
        if (draggedItem.path === item.path) {
          return;
        }

        const oldPath = draggedItem.path;
        if (isFolder(draggedItem) && oldPath[oldPath.length - 1] !== "/") {
          throw new Error("Folder path should end with /, " + JSON.stringify(draggedItem));
        }

        const newPath = item.path + draggedItem.name + (isFolder(draggedItem) ? "/" : "");
        onPathChange?.(oldPath, newPath);
      },
    }),
    [item],
  );

  if (!isItemFolder) {
    return (
      <DeleteContextMenu onPathDelete={onPathDelete} path={item.path}>
        <SidebarMenuButton
          className={cn({
            "bg-emerald-900 hover:bg-emerald-800": item.highlighted,
            "data-[active=true]:bg-transparent": !item.highlighted,
            "bg-red-200 opacity-50": isDragging,
          })}
          type="button"
          size="big"
          onClick={item.onClick}
          ref={drag}
        >
          {item.isBinary ? <FileDigit /> : <File />}
          <span
            className="inline-block"
            contentEditable={isEditing}
            suppressContentEditableWarning={true}
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
      </DeleteContextMenu>
    );
  }

  return (
    <DeleteContextMenu onPathDelete={onPathDelete} path={item.path}>
      <SidebarMenuItem ref={drop}>
        <Collapsible className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90">
          <CollapsibleTrigger asChild>
            <SidebarMenuButton ref={drag}>
              <ChevronRight className="transition-transform" />
              <Folder />
              <span
                className="inline-block"
                contentEditable={isEditing}
                suppressContentEditableWarning={true}
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
          {item.children.length > 0 && (
            <CollapsibleContent>
              <SidebarMenuSub className="mr-0 pr-0">
                {item.children.map((subItem, index) => (
                  <Tree key={index} item={subItem} onPathChange={onPathChange} onPathDelete={onPathDelete} />
                ))}
              </SidebarMenuSub>
            </CollapsibleContent>
          )}
        </Collapsible>
      </SidebarMenuItem>
    </DeleteContextMenu>
  );
}
