
import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "../types/editor";

import {
  androidFileService,
  isSafPath,
} from "./androidFileService";

export const fileService = {
  read(path: string): Promise<string> {
    return isSafPath(path)
      ? androidFileService.read(path)
      : invoke("read_file", { path });
  },

  write(path: string, content: string): Promise<void> {
    return isSafPath(path)
      ? androidFileService.write(path, content)
      : invoke("write_file", { path, content });
  },

  listDirectory(path: string): Promise<FileEntry[]> {
    return isSafPath(path)
      ? androidFileService.listDirectory(path)
      : invoke("list_directory", { path });
  },

  create(
    directory: string,
    name: string,
    isDirectory: boolean,
  ): Promise<string> {
    return isSafPath(directory)
      ? androidFileService.create(directory, name, isDirectory)
      : invoke("create_entry", {
          directory,
          name,
          isDirectory,
        });
  },

  rename(path: string, newName: string): Promise<string> {
    return isSafPath(path)
      ? androidFileService.rename(path, newName)
      : invoke("rename_entry", { path, newName });
  },

  delete(path: string): Promise<void> {
    return isSafPath(path)
      ? androidFileService.delete(path)
      : invoke("delete_entry", { path });
  },

  parentDirectory(path: string): Promise<string | null> {
    if (isSafPath(path)) return Promise.resolve(null);

    return invoke("parent_directory", { path });
  },
};
