
import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "../types/editor";

const isSaf = (path: string) => path.startsWith("content://");

export const fileService = {
  read(path: string): Promise<string> {
    return isSaf(path)
      ? invoke("plugin:saf|readFile", { uri: path })
      : invoke("read_file", { path });
  },

  write(path: string, content: string): Promise<void> {
    return isSaf(path)
      ? invoke("plugin:saf|writeFile", { uri: path, content })
      : invoke("write_file", { path, content });
  },

  listDirectory(path: string): Promise<FileEntry[]> {
    return isSaf(path)
      ? invoke("plugin:saf|listDirectory", { uri: path })
      : invoke("list_directory", { path });
  },

  create(
    directory: string,
    name: string,
    isDirectory: boolean,
  ): Promise<string> {
    return isSaf(directory)
      ? invoke("plugin:saf|createEntry", {
          uri: directory,
          name,
          isDirectory,
        })
      : invoke("create_entry", {
          directory,
          name,
          isDirectory,
        });
  },

  rename(path: string, newName: string): Promise<string> {
    return isSaf(path)
      ? invoke("plugin:saf|renameEntry", {
          uri: path,
          newName,
        })
      : invoke("rename_entry", {
          path,
          newName,
        });
  },

  delete(path: string): Promise<void> {
    return isSaf(path)
      ? invoke("plugin:saf|deleteEntry", { uri: path })
      : invoke("delete_entry", { path });
  },

  parentDirectory(path: string): Promise<string | null> {
    if (isSaf(path)) return Promise.resolve(null);
    return invoke("parent_directory", { path });
  },
};
