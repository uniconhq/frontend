// This class is used for managing an array of files and converting them to file trees.

// Note: This is a file. It is NOT a folder.
export type FileType = {
  path: string;
  content: string;
  isBinary: boolean;
  downloadUrl: string;
  onClick?: () => void;
};

export type TreeFile = FileType & {
  name: string;
  highlighted?: boolean;
};

export type TreeFolder = {
  name: string;
  path: string;
  children: (TreeFolder | TreeFile)[];
};

export const isFolder = (item: TreeFolder | TreeFile): item is TreeFolder => {
  return "children" in item;
};

export const getName = (path: string) => {
  return path.split("/").pop();
};

export type FileTreeType = (TreeFolder | TreeFile)[];

export const cleanFilePath = (path: string) => path.replace(/^\//, "");

const sortFileTree = (files: FileTreeType) => {
  files.sort((a, b) => {
    return a.name.localeCompare(b.name);
  });
  for (const item of files) {
    if (isFolder(item)) {
      sortFileTree(item.children);
    }
  }
};

export const convertFilesToFileTree = (files: FileType[]): FileTreeType => {
  const tree: FileTreeType = [];
  for (const file of files) {
    const unfilteredPathParts = file.path.split("/");
    // It is possible there are "folder/" files, so the last part could be "".
    // In that case, show the folder, but don't create a file.
    const pathParts = unfilteredPathParts.filter(
      (part, index) => !["", "."].includes(part) || index === unfilteredPathParts.length - 1,
    );
    let currentTree = tree;
    for (let i = 0; i < pathParts.length - 1; i++) {
      const folderName = pathParts[i];
      const folder = currentTree.find((item): item is TreeFolder => "children" in item && item.name === folderName);
      if (folder) {
        currentTree = folder.children;
      } else {
        const newFolder: TreeFolder = {
          name: folderName,
          path: pathParts.slice(0, i + 1).join("/"),
          children: [],
        };
        currentTree.push(newFolder);
        currentTree = newFolder.children;
      }
    }
    const fileName = pathParts[pathParts.length - 1];
    if (fileName) {
      currentTree.push({
        name: fileName,
        ...file,
      });
    }
  }
  sortFileTree(tree);
  return tree;
};
