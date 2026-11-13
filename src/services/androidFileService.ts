
import {
  readTextFile,
  writeTextFile,
  readDir,
  createNewFile,
  createDir,
  renameFile,
  renameDir,
  removeFile,
  removeDirAll,
  showOpenDirPicker,
  persistPickerUriPermission,
  getType,
  isFsUri,
  type FsUri,
} from "tauri-plugin-android-fs-api";

import type { FileEntry } from "../types/editor";

const ANDROID_PREFIX = "android-fs:";

export const encodeSafUri = (uri: FsUri): string =>
  ANDROID_PREFIX + encodeURIComponent(JSON.stringify(uri));

export const decodeSafUri = (value: string): FsUri => {
  if (!value.startsWith(ANDROID_PREFIX)) {
    throw new Error("Invalid Android filesystem URI");
  }

  const parsed: unknown = JSON.parse(
    decodeURIComponent(value.slice(ANDROID_PREFIX.length))
  );

  if (!isFsUri(parsed)) {
    throw new Error("Invalid Android filesystem URI");
  }

  return parsed;
};

export const isSafPath = (path: string): boolean =>
  path.startsWith(ANDROID_PREFIX);

const androidParents = new Map<string, string>();

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

    return entries.map((entry) => {
      const entryPath = encodeSafUri(entry.uri);

      androidParents.set(entryPath, path);

      return {
        name: entry.name,
        path: entryPath,
        isDir: entry.type === "Dir",
      };
    });
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
    const uri = decodeSafUri(path);
    const type = await getType(uri);

    const renamed = type.type === "Dir"
      ? await renameDir(uri, newName)
      : await renameFile(uri, newName);

    const newPath = encodeSafUri(renamed);
    const parent = androidParents.get(path);

    if (parent) {
      androidParents.set(newPath, parent);
      androidParents.delete(path);
    }

    return newPath;
  },

  async delete(path: string): Promise<void> {
    const uri = decodeSafUri(path);
    const type = await getType(uri);

    if (type.type === "Dir") {
      return removeDirAll(uri);
    }

    return removeFile(uri);
  },

  parentDirectory(path: string): Promise<string | null> {
    return Promise.resolve(androidParents.get(path) ?? null);
  },
};