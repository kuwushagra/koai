import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "../types/editor";

export const fileService = {
  read(path: string): Promise<string> {
    return invoke("read_file", { path });
  },

  write(path: string, content: string): Promise<void> {
    return invoke("write_file", { path, content });
  },

  listDirectory(path: string): Promise<FileEntry[]> {
    return invoke("list_directory", { path });
  },

  create(
    directory: string,
    name: string,
    isDirectory: boolean,
  ): Promise<string> {
    return invoke("create_entry", {
      directory,
      name,
      isDirectory,
    });
  },

  rename(path: string, newName: string): Promise<string> {
    return invoke("rename_entry", {
      path,
      newName,
    });
  },

  delete(path: string): Promise<void> {
    return invoke("delete_entry", { path });
  },

  parentDirectory(path: string): Promise<string | null> {
    return invoke("parent_directory", { path });
  },
};