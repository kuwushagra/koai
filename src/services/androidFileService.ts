
import {
  readTextFile,
  writeTextFile,
  readDir,
  createNewFile,
  createDir,
  renameFile,
  removeFile,
  removeDirAll,
  showOpenDirPicker,
  persistPickerUriPermission,
  getType,
  isFsUri,
  type FsUri,
} from "tauri-plugin-android-fs-api";

import type { FileEntry } from "../types/editor";

export const encodeSafUri = (uri: FsUri): string =>
  JSON.stringify(uri);

export const decodeSafUri = (value: string): FsUri => {
  const parsed: unknown = JSON.parse(value);

  if (!isFsUri(parsed)) {
    throw new Error("Invalid Android filesystem URI");
  }

  return parsed;
};

export const isSafPath = (path: string): boolean => {
  try {
    decodeSafUri(path);
    return true;
  } catch {
    return false;
  }
};

export const androidFileService = {
  async pickWorkspace(): Promise<string | null> {
    const uri = await showOpenDirPicker();

    if (!uri) return null;

    await persistPickerUriPermission(uri);

    return encodeSafUri(uri);
  },

  async read(path: string): Promise<string> {
    return readTextFile(decodeSafUri(path));
  },

  async write(path: string, content: string): Promise<void> {
    return writeTextFile(decodeSafUri(path), content);
  },

  async listDirectory(path: string): Promise<FileEntry[]> {
    const entries = await readDir(decodeSafUri(path));

    return entries.map((entry) => ({
      name: entry.name,
      path: encodeSafUri(entry.uri),
      isDir: entry.type === "Dir",
    }));
  },

  async create(
    directory: string,
    name: string,
    isDirectory: boolean,
  ): Promise<string> {
    const parent = decodeSafUri(directory);

    const uri = isDirectory
      ? await createDir(parent, name)
      : await createNewFile(parent, name, null);

    return encodeSafUri(uri);
  },

  async rename(path: string, newName: string): Promise<string> {
    const uri = await renameFile(decodeSafUri(path), newName);

    return encodeSafUri(uri);
  },

  async delete(path: string): Promise<void> {
    const uri = decodeSafUri(path);
    const type = await getType(uri);

    if (type.type === "Dir") {
      return removeDirAll(uri);
    }

    return removeFile(uri);
  },
};