
import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "../types/editor";

import {
  androidFileService,
  isSafPath,
} from "./androidFileService";

export const fileService = {
  async pickWorkspaceFolder(): Promise<string | null> {
    return androidFileService.pickWorkspace();
  },

  async read(path: string): Promise<string> {
    if (isSafPath(path)) {
      return androidFileService.read(path);
    }

    return invoke("read_file", { path });
  },

  async write(path: string, content: string): Promise<void> {
    if (isSafPath(path)) {
      return androidFileService.write(path, content);
    }

    return invoke("write_file", { path, content });
  },

  async listDirectory(path: string): Promise<FileEntry[]> {
    if (isSafPath(path)) {
      return androidFileService.listDirectory(path);
    }

    return invoke("list_directory", { path });
  },

  async create(
    directory: string,
    name: string,
    isDirectory: boolean,
  ): Promise<string> {
    if (isSafPath(directory)) {
      return androidFileService.create(
        directory,
        name,
        isDirectory,
      );
    }

    return invoke("create_entry", {
      directory,
      name,
      isDirectory,
    });
  },

  async rename(path: string, newName: string): Promise<string> {
    if (isSafPath(path)) {
      return androidFileService.rename(path, newName);
    }

    return invoke("rename_entry", {
      path,
      newName,
    });
  },

  async delete(path: string): Promise<void> {
    if (isSafPath(path)) {
      return androidFileService.delete(path);
    }

    return invoke("delete_entry", { path });
  },

  async parentDirectory(path: string): Promise<string | null> {
    if (isSafPath(path)) {
      return androidFileService.parentDirectory(path);
    }

    return invoke("parent_directory", { path });
  },
};