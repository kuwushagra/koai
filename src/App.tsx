import { getVersion } from "@tauri-apps/api/app";
//import { openUrl } from "@tauri-apps/plugin-opener";
import { fileService } from "./services/fileService";
import semver from "semver";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { download } from "@tauri-apps/plugin-upload";
import { appCacheDir, join } from "@tauri-apps/api/path";
import {
  install,
  canInstall,
  requestInstallPermission,
} from "tauri-plugin-android-installer-api";

const GITHUB_OWNER = "kuwushagra";
const GITHUB_REPO = "koai";

import {
  open,
  save,
  confirm
} from "@tauri-apps/plugin-dialog";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Bot,
  ChevronDown,
  File,
  FilePlus,
  FolderOpen,
  Save,
  Search,
  Palette,
  Info,
  RefreshCw,
  X,
  Copy,
  Clipboard,
  Scissors,
  Check,
  Terminal as TerminalIcon,
  Sparkles,
  ArrowUp,
  ExternalLink,
  FolderPlus,
  Trash2,
  PanelLeft,
  RotateCcw,
  Square,
  GitBranch,
  AlertTriangle,
  Settings,
  LockKeyhole
} from "lucide-react";

import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { invoke } from "@tauri-apps/api/core";
import TerminalPanel from "./components/Terminal/TerminalPanel";
import CodeEditor from "./components/Editor/CodeEditor";
import { themes } from "./themes/themes.ts";
import "./App.css";
import koaiLogo from "./assets/koai.png";

interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

interface OpenFile {
  path: string;
  name: string;
  content: string;
  savedContent: string;
  language: string;
  dirty: boolean;
}

interface SearchResult {
  file: FileEntry;
  match: string;
  line?: number;
  query: string;
}

interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

interface AISettings {
  provider: string;
  model: string;
  customUrl: string;
  apiKey: string;
}

type MenuName = "koai" | "file" | "search" | null;
type ThemeName = keyof typeof themes;
type SearchMode = "files" | "content";
type SettingsView = "about" | "ai" | "themes" | null;

type AIProvider = "openai" | "anthropic" | "google" | "custom";

const IGNORED_DIRECTORIES = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  "target",
  "vendor",
];

const getLanguage = (name: string): string => {
  const extension = name.split(".").pop()?.toLowerCase();

  const languages: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",

    ts: "typescript",
    tsx: "typescript",

    py: "python",
    rs: "rust",

    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",

    json: "json",
    jsonc: "json",
    md: "markdown",

    sh: "shell",
    bash: "shell",
    zsh: "shell",

    sql: "sql",
    java: "java",
    cpp: "cpp",
    c: "c",
    h: "c",
    go: "go",
    php: "php",

    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    toml: "ini",

    vue: "html",
    svelte: "html"
  };

  return languages[extension ?? ""] ?? "plaintext";
};

const getFileName = (path: string): string => {
  return path.split(/[\\/]/).pop() ?? path;
};

const joinPath = (directory: string, name: string): string => {
  const separator = directory.includes("\\") ? "\\" : "/";
  return `${directory.replace(/[\\/]+$/, "")}${separator}${name}`;
};

const normalizeError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

function App() {
  const [appVersion, setAppVersion] = useState("Loading...");
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    const saved = localStorage.getItem("koai-theme");

    return saved && saved in themes
      ? (saved as ThemeName)
      : "dark";
  });

  const [aiProvider, setAiProvider] = useState<AIProvider | "">(
    () => {
      const saved = localStorage.getItem("koai-provider");

      return saved === "openai" ||
        saved === "anthropic" ||
        saved === "google" ||
        saved === "custom"
        ? saved
        : "";
    }
  );

  const [aiApiKey, setAiApiKey] = useState("");

  const [aiModel, setAiModel] = useState("");

  const [customApiUrl, setCustomApiUrl] = useState("");

  const [aiUnlocked, setAiUnlocked] = useState(false);
  const [aiSetupRequired, setAiSetupRequired] = useState(false);
  const [masterPassword, setMasterPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");

  const [assistantLoading, setAssistantLoading] = useState(false);

  const [rootDirectory, setRootDirectory] = useState("");
  const [directoryContents, setDirectoryContents] = useState<
    Record<string, FileEntry[]>
  >({});

  const [expandedDirectories, setExpandedDirectories] = useState<
    Set<string>
  >(new Set());
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  const [activeMenu, setActiveMenu] = useState<MenuName>(null);
  const [settingsView, setSettingsView] = useState<SettingsView>(null);

  const [terminalVisible, setTerminalVisible] = useState(false);
  const [assistantVisible, setAssistantVisible] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const [explorerWidth, setExplorerWidth] = useState(240);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [assistantHeight, setAssistantHeight] = useState(300);

  const isAndroid = /android/i.test(navigator.userAgent);

  const checkAIEncryption = async () => {
    try {
      const exists = await invoke<boolean>("has_ai_settings");
      const unlocked = await invoke<boolean>("is_ai_unlocked");

      setAiSetupRequired(!exists);
      setAiUnlocked(unlocked);

      if (unlocked) {
        const settings = await invoke<AISettings | null>(
          "get_ai_settings"
        );

        if (settings) {
          setAiProvider(settings.provider as AIProvider);
          setAiModel(settings.model);
          setCustomApiUrl(settings.customUrl);
          setAiApiKey(settings.apiKey);
        }
      }
    } catch (error) {
      console.error("AI encryption check failed:", error);

      setAiUnlocked(false);
      setAiApiKey("");
      setAiModel("");
      setCustomApiUrl("");
      setAiProvider("");
      setUnlockError(normalizeError(error));
    }
  };

  const setupAIMasterPassword = async () => {
    if (masterPassword.length < 12) {
      setUnlockError(
        "Master password must contain at least 12 characters."
      );
      return;
    }

    try {
      setUnlockError("");

      await invoke("setup_master_password", {
        password: masterPassword,
      });

      setMasterPassword("");
      setAiUnlocked(true);
      setAiSetupRequired(false);

      await checkAIEncryption();

      showToast("AI security configured successfully.");
    } catch (error) {
      setUnlockError(normalizeError(error));
    }
  };

  const unlockAI = async () => {
    try {
      setUnlockError("");

      const settings = await invoke<AISettings>(
        "unlock_ai_settings",
        {
          password: masterPassword,
        }
      );

      setAiProvider(settings.provider as AIProvider);
      setAiModel(settings.model);
      setCustomApiUrl(settings.customUrl);
      setAiApiKey(settings.apiKey);

      setMasterPassword("");
      setAiUnlocked(true);

      showToast("AI unlocked successfully.");
    } catch (error) {
      setUnlockError(normalizeError(error));
    }
  };


  const resizeRef = useRef<{
    type: "explorer" | "terminal" | "assistant";
    startPosition: number;
    startSize: number;
  } | null>(null);

  const [searchMode, setSearchMode] = useState<SearchMode>("files");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const [searchNavigation, setSearchNavigation] = useState<{
    query: string;
    line?: number;
    requestId: number;
  } | null>(null);

  const [searchVisible, setSearchVisible] = useState(false);
  const [searching, setSearching] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);

  const [newFileName, setNewFileName] = useState("");
  const [newFileVisible, setNewFileVisible] = useState(false);

  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderVisible, setNewFolderVisible] = useState(false);

  const [assistantInput, setAssistantInput] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<
    AssistantMessage[]
  >([]);

  const [toast, setToast] = useState("");

  const [confirmCloseFile, setConfirmCloseFile] = useState<string | null>(null);
  const [confirmWorkspaceChange, setConfirmWorkspaceChange] = useState(false);


  const startResize = (
    event: React.PointerEvent<HTMLDivElement>,
    type: "explorer" | "terminal" | "assistant"
  ) => {
    event.preventDefault();

    const startPosition =
      type === "explorer" ? event.clientX : event.clientY;

    const startSize =
      type === "explorer"
        ? explorerWidth
        : type === "terminal"
          ? terminalHeight
          : assistantHeight;

    resizeRef.current = {
      type,
      startPosition,
      startSize,
    };

    document.body.style.cursor =
      type === "explorer" ? "col-resize" : "row-resize";

    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!resizeRef.current) return;

      const { type, startPosition, startSize } =
        resizeRef.current;

      const currentPosition =
        type === "explorer"
          ? moveEvent.clientX
          : moveEvent.clientY;

      const delta = currentPosition - startPosition;

      if (type === "explorer") {
        setExplorerWidth(
          Math.min(500, Math.max(160, startSize + delta))
        );
      }

      if (type === "terminal") {
        setTerminalHeight(
          Math.min(
            window.innerHeight * 0.75,
            Math.max(100, startSize - delta)
          )
        );
      }

      if (type === "assistant") {
        setAssistantHeight(
          Math.min(
            window.innerHeight * 0.75,
            Math.max(120, startSize - delta)
          )
        );
      }
    };

    const handlePointerUp = () => {
      resizeRef.current = null;

      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      window.removeEventListener(
        "pointermove",
        handlePointerMove
      );

      window.removeEventListener(
        "pointerup",
        handlePointerUp
      );
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };



  const renderWorkspaceChangeDialog = () => {
    if (!confirmWorkspaceChange) return null;

    return (
      <div className="modal-overlay">
        <section className="small-modal">
          <div className="small-modal-heading">
            <AlertTriangle size={18} />
            <h3>Unsaved Changes</h3>
          </div>

          <p className="settings-description">
            You have unsaved changes. Open another workspace
            without saving?
          </p>

          <div className="modal-actions">
            <button
              onClick={() => setConfirmWorkspaceChange(false)}
            >
              Cancel
            </button>

            <button
              onClick={() => void saveAll().then((saved) => {
                if (saved) {
                  void openWorkspaceWithoutSaving();
                }
              })}
            >
              Save All
            </button>

            <button
              className="primary"
              onClick={() => void openWorkspaceWithoutSaving()}
            >
              Don't Save
            </button>
          </div>
        </section>
      </div>
    );
  };

  const searchInputRef = useRef<HTMLInputElement>(null);
  const assistantInputRef = useRef<HTMLTextAreaElement>(null);

  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchCancelledRef = useRef(false);

  const theme = themes[themeName];

  const currentFile = openFiles.find(
    (file) => file.path === activeFile
  );

  const dirtyFiles = openFiles.filter((file) => file.dirty);

  const hasUnsavedChanges = dirtyFiles.length > 0;

  const showToast = useCallback((message: string) => {
    setToast(message);

    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }

    toastTimeoutRef.current = setTimeout(() => {
      setToast("");
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    getVersion()
      .then((version) => setAppVersion(version))
      .catch(() => setAppVersion("Unknown"));
  }, []);

  useEffect(() => {
    localStorage.setItem("koai-theme", themeName);
  }, [themeName]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      if (
        !target.closest(".top-menu-item") &&
        !target.closest(".top-dropdown")
      ) {
        setActiveMenu(null);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const toggleMenu = (menu: MenuName) => {
    setActiveMenu((previous) =>
      previous === menu ? null : menu
    );
  };

  const loadDirectory = useCallback(async (path: string) => {
    try {
      const entries = await fileService.listDirectory(path);

      const sorted = entries.sort((a, b) => {
        if (a.isDir !== b.isDir) {
          return a.isDir ? -1 : 1;
        }

        return a.name.localeCompare(b.name);
      });

      setDirectoryContents((previous) => ({
        ...previous,
        [path]: sorted,
      }));

      return sorted;
    } catch (error) {
      showToast(normalizeError(error));
      return [];
    }
  }, [showToast]);

  const toggleDirectory = useCallback(async (path: string) => {
    const isExpanded = expandedDirectories.has(path);

    if (isExpanded) {
      setExpandedDirectories((previous) => {
        const next = new Set(previous);
        next.delete(path);
        return next;
      });

      return;
    }

    if (!directoryContents[path]) {
      await loadDirectory(path);
    }

    setExpandedDirectories((previous) => {
      const next = new Set(previous);
      next.add(path);
      return next;
    });
  }, [expandedDirectories, directoryContents, loadDirectory]);


  const openAndroidWorkspace = useCallback(async () => {
    try {
      const path = await fileService.pickWorkspaceFolder();

      if (!path) return;

      const entries = await fileService.listDirectory(path);

      const sorted = entries.sort((a, b) => {
        if (a.isDir !== b.isDir) {
          return a.isDir ? -1 : 1;
        }

        return a.name.localeCompare(b.name);
      });

      setDirectoryContents({
        [path]: sorted,
      });

      setExpandedDirectories(new Set([path]));
      setRootDirectory(path);
      setOpenFiles([]);
      setActiveFile(null);
      setActiveMenu(null);
      setSearchVisible(false);

      showToast("Android workspace opened");
    } catch (error) {
      showToast(normalizeError(error));
    }
  }, [showToast]);


  const openWorkspace = useCallback(async () => {
    if (hasUnsavedChanges) {
      setConfirmWorkspaceChange(true);
      return;
    }

    try {
      let selected: string;

      if (isAndroid) {
        const result = await fileService.pickWorkspaceFolder();

        if (!result) return;

        selected = result;
      } else {
        const result = await open({
          directory: true,
          multiple: false,
          title: "Open Folder",
        });

        if (!result || Array.isArray(result)) return;

        selected = result;
      }

      const entries = await fileService.listDirectory(selected);

      setDirectoryContents({
        [selected]: entries.sort((a: FileEntry, b: FileEntry) => {
          if (a.isDir !== b.isDir) {
            return a.isDir ? -1 : 1;
          }

          return a.name.localeCompare(b.name);
        }),
      });

      setExpandedDirectories(new Set([selected]));
      setRootDirectory(selected);
      setOpenFiles([]);
      setActiveFile(null);
      setActiveMenu(null);
      setSearchVisible(false);

      if (!isAndroid) {
        localStorage.setItem("koai-last-workspace", selected);
      }

      showToast(`${entries.length} items loaded`);
    } catch (error) {
      showToast(normalizeError(error));
    }
  }, [isAndroid, hasUnsavedChanges, showToast]);


  const openWorkspaceWithoutSaving = useCallback(async () => {
    setConfirmWorkspaceChange(false);

    try {
      let selected: string;

      if (isAndroid) {
        const result = await fileService.pickWorkspaceFolder();

        if (!result) return;

        selected = result;
      } else {
        const result = await open({
          directory: true,
          multiple: false,
          title: "Open Folder",
        });

        if (!result || Array.isArray(result)) return;

        selected = result;
      }

      const entries = await fileService.listDirectory(selected);

      setDirectoryContents({
        [selected]: entries.sort((a: FileEntry, b: FileEntry) => {
          if (a.isDir !== b.isDir) {
            return a.isDir ? -1 : 1;
          }

          return a.name.localeCompare(b.name);
        }),
      });

      setExpandedDirectories(new Set([selected]));
      setRootDirectory(selected);
      setOpenFiles([]);
      setActiveFile(null);
      setActiveMenu(null);
      setSearchVisible(false);

      if (!isAndroid) {
        localStorage.setItem("koai-last-workspace", selected);
      }

      showToast(`${entries.length} items loaded`);
    } catch (error) {
      showToast(normalizeError(error));
    }
  }, [isAndroid, showToast]);

  const saveAll = useCallback(async () => {
    const unsaved = openFiles.filter((file) => file.dirty);

    if (unsaved.length === 0) {
      showToast("Everything is saved");
      return true;
    }

    const savedPaths: string[] = [];

    try {
      for (const file of unsaved) {
        await fileService.write(file.path, file.content);
        savedPaths.push(file.path);
      }

      setOpenFiles((previous) =>
        previous.map((file) =>
          savedPaths.includes(file.path)
            ? {
              ...file,
              savedContent: unsaved.find(
                (item) => item.path === file.path
              )?.content ?? file.savedContent,
              dirty: false,
            }
            : file
        )
      );

      showToast("All files saved");
      return true;
    } catch (error) {
      setOpenFiles((previous) =>
        previous.map((file) => {
          const saved = unsaved.find(
            (item) => item.path === file.path
          );

          if (!saved || !savedPaths.includes(file.path)) {
            return file;
          }

          return {
            ...file,
            savedContent: saved.content,
            dirty: file.content !== saved.content,
          };
        })
      );

      showToast(`Save failed: ${normalizeError(error)}`);
      return false;
    }
  }, [openFiles, showToast]);

  const openFile = useCallback(
    async (path: string, name?: string) => {
      const existing = openFiles.find(
        (file) => file.path === path
      );

      if (existing) {
        setActiveFile(path);
        setSearchVisible(false);
        return;
      }

      try {
        const content = await fileService.read(path);
        const fileName = name ?? getFileName(path);

        const file: OpenFile = {
          path,
          name: fileName,
          content,
          savedContent: content,
          language: getLanguage(fileName),
          dirty: false,
        };

        setOpenFiles((previous) => [
          ...previous,
          file,
        ]);

        setActiveFile(path);
        setSearchVisible(false);
      } catch (error) {
        showToast(normalizeError(error));
      }
    },
    [openFiles, showToast]
  );

  const openSingleFile = useCallback(async () => {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        title: "Open File",
      });

      if (!selected || Array.isArray(selected)) return;

      if (isAndroid) {
        const content = await readTextFile(selected);

        const decoded = decodeURIComponent(selected);

        const originalName =
          decoded
            .split("/")
            .pop()
            ?.split(":")
            .pop()
            ?.split("?")[0] || "untitled.txt";

        const name = originalName.replace(/[\\/]/g, "_");

        const workspace =
          rootDirectory ||
          await invoke<string>("get_android_workspace");

        let destinationName = name;
        let destination = joinPath(workspace, destinationName);

        try {
          await invoke("create_entry", {
            directory: workspace,
            name: destinationName,
            isDirectory: false,
          });
        } catch {
          const extensionIndex = name.lastIndexOf(".");
          const baseName = extensionIndex > 0
            ? name.slice(0, extensionIndex)
            : name;

          const extension = extensionIndex > 0
            ? name.slice(extensionIndex)
            : "";

          destinationName = `${baseName}-${Date.now()}${extension}`;
          destination = joinPath(workspace, destinationName);

          await invoke("create_entry", {
            directory: workspace,
            name: destinationName,
            isDirectory: false,
          });
        }

        await invoke("write_file", {
          path: destination,
          content,
        });

        if (!rootDirectory) {
          const entries = await invoke<FileEntry[]>(
            "list_directory",
            { path: workspace }
          );

          setRootDirectory(workspace);
          setDirectoryContents({
            [workspace]: entries,
          });
          setExpandedDirectories(new Set([workspace]));
        } else {
          await loadDirectory(workspace);
        }

        await openFile(destination, destinationName);

        setActiveMenu(null);
        showToast("External file imported successfully");
        return;
      }

      await openFile(selected);
      setActiveMenu(null);
    } catch (error) {
      showToast(normalizeError(error));
    }
  }, [
    isAndroid,
    rootDirectory,
    openFile,
    loadDirectory,
    showToast,
  ]);

  const createNewFile = useCallback(async () => {
    const name = newFileName.trim();

    if (!name) {
      showToast("Enter a file name");
      return;
    }

    try {
      if (!rootDirectory) {
        if (isAndroid) {
          await openAndroidWorkspace();
          showToast("Workspace opened. Create your file again.");
          return;
        }

        const destination = await save({
          title: "Create File",
          defaultPath: name,
        });

        if (!destination) return;

        await fileService.write(destination, "");

        await openFile(destination, getFileName(destination));
      } else {
        const path = await fileService.create(
          rootDirectory,
          name,
          false
        );

        await loadDirectory(rootDirectory);
        await openFile(path, name);
      }

      setNewFileName("");
      setNewFileVisible(false);

      showToast("File created");
    } catch (error) {
      showToast(normalizeError(error));
    }
  }, [
    isAndroid,
    rootDirectory,
    newFileName,
    openAndroidWorkspace,
    openFile,
    loadDirectory,
    showToast,
  ]);

  const createNewFolder = useCallback(async () => {
    const name = newFolderName.trim();

    if (!name || !rootDirectory) {
      showToast("Enter a folder name and open a workspace");
      return;
    }

    try {
      await fileService.create(
        rootDirectory,
        name,
        true
      );

      await loadDirectory(rootDirectory);

      setNewFolderName("");
      setNewFolderVisible(false);

      showToast("Folder created");
    } catch (error) {
      showToast(normalizeError(error));
    }
  }, [newFolderName, rootDirectory, loadDirectory, showToast]);

  const updateFileContent = useCallback(
    (path: string, content: string) => {
      setOpenFiles((previous) =>
        previous.map((file) =>
          file.path === path
            ? {
              ...file,
              content,
              dirty: content !== file.savedContent,
            }
            : file
        )
      );
    },
    []
  );

  const saveFile = useCallback(
    async (path?: string) => {
      const targetPath = path ?? activeFile;

      if (!targetPath) return;

      const target = openFiles.find(
        (file) => file.path === targetPath
      );

      if (!target) return;

      try {
        await fileService.write(
          target.path,
          target.content
        );

        setOpenFiles((previous) =>
          previous.map((file) =>
            file.path === target.path
              ? {
                ...file,
                savedContent: target.content,
                dirty: false,
              }
              : file
          )
        );

        showToast(`${target.name} saved`);
      } catch (error) {
        showToast(`Save failed: ${normalizeError(error)}`);
      }
    },
    [openFiles, activeFile, showToast]
  );

  const saveAs = useCallback(async () => {
    if (!currentFile) return;

    try {
      let destination: string;

      if (isAndroid) {
        if (!rootDirectory) {
          showToast("Open a workspace first");
          return;
        }

        const name = window.prompt(
          "Save as:",
          currentFile.name
        );

        if (!name?.trim()) return;

        destination = await fileService.create(
          rootDirectory,
          name.trim(),
          false
        );
      } else {
        const selected = await save({
          title: "Save File As",
          defaultPath: currentFile.name,
        });

        if (!selected) return;

        destination = selected;
      }

      await fileService.write(
        destination,
        currentFile.content
      );

      const name = getFileName(destination);

      setOpenFiles((previous) =>
        previous.map((file) =>
          file.path === currentFile.path
            ? {
              ...file,
              path: destination,
              name,
              language: getLanguage(name),
              savedContent: file.content,
              dirty: false,
            }
            : file
        )
      );

      setActiveFile(destination);

      if (rootDirectory) {
        await loadDirectory(rootDirectory);
      }

      showToast("File saved successfully");
    } catch (error) {
      showToast(`Save As failed: ${normalizeError(error)}`);
    }
  }, [
    currentFile,
    isAndroid,
    rootDirectory,
    loadDirectory,
    showToast,
  ]);

  const deleteEntry = useCallback(
    async (path: string) => {
      try {
        await fileService.delete(path);

        const parent = await fileService.parentDirectory(path);

        if (parent) {
          await loadDirectory(parent);
        } else if (rootDirectory) {
          await loadDirectory(rootDirectory);
        }

        setDirectoryContents((previous) => {
          const next = { ...previous };
          delete next[path];
          return next;
        });

        const separator = path.includes("\\") ? "\\" : "/";
        const prefix = path.endsWith(separator)
          ? path
          : `${path}${separator}`;

        const deletedFiles = openFiles.filter(
          (file) =>
            file.path === path ||
            file.path.startsWith(prefix)
        );

        if (deletedFiles.length > 0) {
          const remaining = openFiles.filter(
            (file) =>
              file.path !== path &&
              !file.path.startsWith(prefix)
          );

          setOpenFiles(remaining);

          if (
            activeFile &&
            deletedFiles.some(
              (file) => file.path === activeFile
            )
          ) {
            setActiveFile(remaining[0]?.path ?? null);
          }
        }

        showToast("Item deleted");
      } catch (error) {
        showToast(normalizeError(error));
      }
    },
    [openFiles, activeFile, rootDirectory, showToast, loadDirectory]
  );

  const renameEntry = useCallback(
    async (path: string, newName: string) => {
      const name = newName.trim();

      if (!name) {
        showToast("Enter a valid name");
        return;
      }

      try {
        const newPath = await fileService.rename(path, name);

        const parent = await fileService.parentDirectory(newPath);

        if (parent) {
          await loadDirectory(parent);
        } else if (rootDirectory) {
          await loadDirectory(rootDirectory);
        }

        const separator = path.includes("\\") ? "\\" : "/";
        const prefix = path.endsWith(separator)
          ? path
          : `${path}${separator}`;

        setOpenFiles((previous) =>
          previous.map((file) => {
            if (file.path === path) {
              return {
                ...file,
                path: newPath,
                name,
                language: getLanguage(name),
              };
            }

            if (file.path.startsWith(prefix)) {
              return {
                ...file,
                path: newPath + file.path.slice(path.length),
              };
            }

            return file;
          })
        );

        if (activeFile === path) {
          setActiveFile(newPath);
        } else if (activeFile?.startsWith(prefix)) {
          setActiveFile(
            newPath + activeFile.slice(path.length)
          );
        }

        showToast("Renamed successfully");
      } catch (error) {
        showToast(normalizeError(error));
      }
    },
    [activeFile, rootDirectory, showToast, loadDirectory]
  );

  const applyAIResponse = useCallback(() => {
    if (!currentFile) {
      showToast("No file is currently open");
      return;
    }

    const lastAssistantMessage = [...assistantMessages]
      .reverse()
      .find((message) => message.role === "assistant");

    if (!lastAssistantMessage) {
      showToast("No AI response available");
      return;
    }

    let content = lastAssistantMessage.content;

    const codeBlockMatch = content.match(
      /```(?:[\w+-]+)?\s*\n([\s\S]*?)```/
    );

    if (codeBlockMatch) {
      content = codeBlockMatch[1];
    }

    updateFileContent(currentFile.path, content);

    showToast("AI response applied to editor");
  }, [
    currentFile,
    assistantMessages,
    updateFileContent,
    showToast,
  ]);

  const closeFile = useCallback(
    async (path: string, saveBeforeClose: boolean) => {
      const file = openFiles.find(
        (item) => item.path === path
      );

      if (!file) return;

      if (file.dirty && !saveBeforeClose) {
        setConfirmCloseFile(path);
        return;
      }

      if (file.dirty && saveBeforeClose) {
        try {
          await fileService.write(file.path, file.content);

          setOpenFiles((previous) =>
            previous.map((item) =>
              item.path === path
                ? {
                  ...item,
                  savedContent: file.content,
                  dirty: false,
                }
                : item
            )
          );
        } catch (error) {
          showToast(`Could not save ${file.name}: ${normalizeError(error)}`);
          return;
        }
      }

      const remaining = openFiles.filter(
        (item) => item.path !== path
      );

      setOpenFiles(remaining);

      if (activeFile === path) {
        const index = openFiles.findIndex(
          (item) => item.path === path
        );

        setActiveFile(
          remaining[Math.max(0, index - 1)]?.path ?? null
        );
      }

      setConfirmCloseFile(null);
    },
    [activeFile, openFiles, showToast]
  );

  const discardAndCloseFile = useCallback(
    (path: string) => {
      const remaining = openFiles.filter(
        (file) => file.path !== path
      );

      const index = openFiles.findIndex(
        (file) => file.path === path
      );

      setOpenFiles(remaining);

      if (activeFile === path) {
        setActiveFile(
          remaining[Math.max(0, index - 1)]?.path ?? null
        );
      }

      setConfirmCloseFile(null);
    },
    [openFiles, activeFile]
  );

  const handleEditorCommand = (
    command: "cut" | "copy" | "paste"
  ) => {
    document.execCommand(command);
    setActiveMenu(null);
  };


  const searchWorkspace = useCallback(async () => {
    if (!searchQuery.trim()) {
      showToast("Enter something to search");
      return;
    }

    if (!rootDirectory) {
      showToast("Open a folder first");
      return;
    }

    searchCancelledRef.current = false;
    setSearching(true);
    setSearchResults([]);

    const results: SearchResult[] = [];

    const query = caseSensitive
      ? searchQuery
      : searchQuery.toLowerCase();

    const matches = (value: string) => {
      const text = caseSensitive
        ? value
        : value.toLowerCase();

      return text.includes(query);
    };

    const scan = async (directory: string): Promise<void> => {
      if (searchCancelledRef.current) return;

      const entries = await fileService.listDirectory(directory);

      for (const entry of entries) {
        if (searchCancelledRef.current) return;

        if (
          entry.isDir &&
          IGNORED_DIRECTORIES.includes(entry.name)
        ) {
          continue;
        }

        if (entry.isDir) {
          try {
            await scan(entry.path);
          } catch (error) {
            console.warn(
              `Could not scan directory: ${entry.path}`,
              error
            );
          }

          continue;
        }

        if (searchMode === "files") {
          if (matches(entry.name)) {
            results.push({
              file: entry,
              match: entry.name,
              query: searchQuery,
            });
          }

          continue;
        }

        try {
          const content = await fileService.read(entry.path);

          content.split(/\r?\n/).forEach((line, index) => {
            if (matches(line)) {
              results.push({
                file: entry,
                match: line.trim(),
                line: index + 1,
                query: searchQuery,
              });
            }
          });
        } catch {
          // Skip files that cannot be read.
        }
      }
    };

    try {
      await scan(rootDirectory);

      if (!searchCancelledRef.current) {
        setSearchResults(results);

        if (results.length === 0) {
          showToast("No matches found");
        }
      }
    } catch (error) {
      if (!searchCancelledRef.current) {
        showToast(normalizeError(error));
      }
    } finally {
      setSearching(false);
    }
  }, [
    searchQuery,
    searchMode,
    rootDirectory,
    caseSensitive,
    showToast,
  ]);

  const cancelSearch = () => {
    searchCancelledRef.current = true;
    setSearching(false);
  };

  const selectSearchMode = (mode: SearchMode) => {
    setSearchMode(mode);
    setSearchResults([]);
    setSearchQuery("");
    setSearchVisible(true);
    setActiveMenu(null);

    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const openSearchResult = async (result: SearchResult) => {
    setSearchNavigation({
      query: result.query,
      line: result.line,
      requestId: Date.now(),
    });

    await openFile(result.file.path, result.file.name);

    setSearchVisible(false);
  };

  const sendAssistantMessage = async () => {
    const message = assistantInput.trim();

    if (!message || assistantLoading) return;

    if (!aiProvider) {
      showToast("Select an AI provider in settings first");
      setSettingsView("ai");
      return;
    }

    if (!aiApiKey.trim()) {
      showToast("Configure your API key first");
      setSettingsView("ai");
      return;
    }

    const userMessage: AssistantMessage = {
      role: "user",
      content: message,
    };

    const updatedMessages = [
      ...assistantMessages,
      userMessage,
    ];

    setAssistantMessages(updatedMessages);
    setAssistantInput("");
    setAssistantLoading(true);

    try {
      const response = await invoke<string>(
        "ai_chat",
        {
          provider: aiProvider,
          apiKey: aiApiKey,
          model: aiModel || null,
          customUrl: aiProvider === "custom"
            ? customApiUrl
            : null,
          messages: updatedMessages.map((item) => ({
            role: item.role,
            content: item.content,
          })),
          context: currentFile
            ? {
              fileName: currentFile.name,
              language: currentFile.language,
              content: currentFile.content,
            }
            : null,
        }
      );

      setAssistantMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: response,
        },
      ]);
    } catch (error) {
      const errorMessage = normalizeError(error);

      setAssistantMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: `Error: ${errorMessage}`,
        },
      ]);
    } finally {
      setAssistantLoading(false);
    }
  };

  const clearAssistantConversation = () => {
    setAssistantMessages([]);
    showToast("Conversation cleared");
  };

  const stopAssistantGeneration = async () => {
    try {
      await invoke("stop_ai_generation");
    } catch {
      setAssistantLoading(false);
    }
  };

  const lockAI = async () => {
    try {
      await invoke("lock_ai_settings");

      setAiUnlocked(false);
      setAiApiKey("");
      setAiModel("");
      setCustomApiUrl("");
      setAiProvider("");
      setMasterPassword("");
    } catch (error) {
      console.error("AI locking failed:", error);
    }
  };

  const saveAISettings = async () => {
    if (!aiProvider) {
      showToast("Select an AI provider");
      return;
    }

    if (!aiApiKey.trim()) {
      showToast("Enter your API key");
      return;
    }

    try {
      await invoke("save_ai_settings", {
        provider: aiProvider,
        apiKey: aiApiKey.trim(),
        model: aiModel || null,
        customUrl: customApiUrl || null,
      });

      showToast("AI settings saved securely");
    } catch (error) {
      showToast(
        `Could not save AI settings: ${normalizeError(error)}`
      );
    }
  };

  const checkForUpdates = async () => {
    setActiveMenu(null);

    let update: Awaited<ReturnType<typeof check>> = null;

    try {
      showToast("Checking for updates...");

      const isAndroid = /android/i.test(navigator.userAgent);

      if (isAndroid) {
        const currentVersion = await getVersion();

        const response = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
          {
            headers: {
              Accept: "application/vnd.github+json",
            },
          }
        );

        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status}`);
        }

        const release = await response.json();

        const latestVersion = release.tag_name.replace(/^v/, "");

        if (!semver.valid(latestVersion)) {
          throw new Error("Invalid release version");
        }

        if (!semver.gt(latestVersion, currentVersion)) {
          showToast("koai is already up to date!");
          return;
        }

        const apk = release.assets.find(
          (asset: { name: string }) =>
            asset.name.toLowerCase().endsWith(".apk")
        );

        if (!apk) {
          throw new Error("No APK found in the latest GitHub release");
        }

        const confirmed = await confirm(
          `A new version of koai is available!\n\n` +
          `Current version: ${currentVersion}\n` +
          `New version: ${latestVersion}\n\n` +
          `Release notes:\n${release.body || "No release notes available."}\n\n` +
          `Would you like to download and install it?`,
          {
            title: "koai Update Available",
            kind: "info",
            okLabel: "Download & Install",
            cancelLabel: "Cancel",
          }
        );

        if (!confirmed) {
          showToast("Update cancelled");
          return;
        }

        const apkPath = await join(
          await appCacheDir(),
          `koai-${latestVersion}.apk`
        );

        showToast("Downloading koai update...");

        await download(
          apk.browser_download_url,
          apkPath,
          ({ progressTotal, total }) => {
            if (total > 0) {
              const percentage = Math.floor(
                (progressTotal / total) * 100
              );

              showToast(`Downloading koai update: ${percentage}%`);
            } else {
              showToast("Downloading koai update...");
            }
          }
        );

        showToast("Download complete. Preparing installer...");

        if (!(await canInstall())) {
          await requestInstallPermission();

          if (!(await canInstall())) {
            showToast("Installation permission was not granted.");
            return;
          }
        }

        await install(apkPath);

        showToast("Android installer opened. Approve the update to continue.");

        return;
      }

      // Windows / Linux / macOS

      update = await check();

      if (!update) {
        showToast("koai is already up to date!");
        return;
      }

      const confirmed = await confirm(
        `A new version of koai is available!\n\n` +
        `Current version: ${update.currentVersion}\n` +
        `New version: ${update.version}\n\n` +
        `Release notes:\n${update.body || "No release notes available."}\n\n` +
        `Would you like to download and install it?`,
        {
          title: "koai Update Available",
          kind: "info",
          okLabel: "Download & Install",
          cancelLabel: "Cancel"
        }
      );

      if (!confirmed) {
        await update.close();
        showToast("Update cancelled");
        return;
      }

      showToast(`Downloading koai ${update.version}...`);

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            showToast("Update download started...");
            break;

          case "Progress":
            console.log(
              "Downloaded chunk:",
              event.data.chunkLength
            );
            break;

          case "Finished":
            showToast("Download complete. Installing...");
            break;
        }
      });

      showToast("Update installed. Restarting koai...");

      await relaunch();

    } catch (error) {
      console.error("Updater error:", error);

      if (update) {
        try {
          await update.close();
        } catch {
        }
      }

      showToast(`Update failed: ${normalizeError(error)}`);
    }
  };

  const changeTheme = (name: ThemeName) => {
    setThemeName(name);
    localStorage.setItem("koai-theme", name);
    showToast(`${String(name)} theme applied`);
  };

  const toggleTerminal = () => {
    setTerminalVisible((previous) => !previous);
    setActiveMenu(null);
  };

  const toggleAssistant = () => {
    setAssistantVisible((previous) => !previous);
    setActiveMenu(null);

    setTimeout(() => assistantInputRef.current?.focus(), 50);
  };

  const openKoaiMenu = () => {
    setActiveMenu(null);
    setSettingsView("about");
  };

  const handleKeyboard = useCallback(
    (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (modifier && event.shiftKey && key === "s") {
        event.preventDefault();
        void saveAs();
        return;
      }

      if (modifier && key === "s") {
        event.preventDefault();
        void saveFile();
        return;
      }

      if (modifier && event.shiftKey && key === "o") {
        event.preventDefault();
        void openSingleFile();
        return;
      }

      if (modifier && key === "o") {
        event.preventDefault();
        void openWorkspace();
        return;
      }

      if (modifier && key === "n") {
        event.preventDefault();
        setNewFileVisible(true);
        return;
      }

      if (modifier && key === "f") {
        event.preventDefault();
        selectSearchMode("content");
        return;
      }

      if (modifier && key === "p") {
        event.preventDefault();
        selectSearchMode("files");
        return;
      }

      if (modifier && key === "w") {
        event.preventDefault();

        if (currentFile) {
          void closeFile(currentFile.path, true);
        }

        return;
      }

      if (modifier && key === "b") {
        event.preventDefault();
        setSidebarVisible((previous) => !previous);
        return;
      }

      if (modifier && key === "h") {
        event.preventDefault();
        selectSearchMode("content");
        return;
      }

      if (modifier && event.key === "`") {
        event.preventDefault();
        toggleTerminal();
        return;
      }

      if (modifier && event.shiftKey && key === "p") {
        event.preventDefault();
        showToast("Command palette is not implemented yet");
        return;
      }

      if (event.key === "Escape") {
        setActiveMenu(null);
        setSettingsView(null);
        setSearchVisible(false);
        setNewFileVisible(false);
        setNewFolderVisible(false);
        setConfirmCloseFile(null);
        setConfirmWorkspaceChange(false);
      }
    },
    [
      saveFile,
      saveAs,
      openSingleFile,
      openWorkspace,
      currentFile,
      closeFile,
      showToast,
    ]
  );

  useEffect(() => {
    void checkAIEncryption();
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyboard);

    return () => {
      window.removeEventListener("keydown", handleKeyboard);
    };
  }, [handleKeyboard]);

  const renderFileTab = (file: OpenFile) => (
    <button
      key={file.path}
      className={`editor-tab ${activeFile === file.path ? "active" : ""}`}
      onClick={() => setActiveFile(file.path)}
      title={file.path}
    >
      <File size={14} />
      <span>{file.name}</span>

      {file.dirty && (
        <span className="tab-dirty">●</span>
      )}

      <span
        className="tab-close"
        onClick={(event) => {
          event.stopPropagation();
          void closeFile(file.path, false);
        }}
      >
        <X size={13} />
      </span>
    </button>
  );

  const renderDirectoryEntry = (
    entry: FileEntry,
    depth = 0
  ): React.ReactNode => {
    const expanded = expandedDirectories.has(entry.path);
    const children = directoryContents[entry.path] ?? [];

    return (
      <React.Fragment key={entry.path}>
        <div
          className={`tree-entry ${activeFile === entry.path ? "active" : ""
            }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          {entry.isDir ? (
            <button
              className="tree-entry-main"
              onClick={() => void toggleDirectory(entry.path)}
            >
              <ChevronDown
                size={13}
                className={expanded ? "" : "tree-chevron-closed"}
              />

              {expanded ? (
                <FolderOpen size={15} />
              ) : (
                <FolderOpen size={15} />
              )}

              <span>{entry.name}</span>
            </button>
          ) : (
            <button
              className="tree-entry-main"
              onClick={() => void openFile(entry.path, entry.name)}
            >
              <span className="tree-chevron-placeholder" />
              <File size={15} />
              <span>{entry.name}</span>
            </button>
          )}

          <div className="tree-entry-actions">
            <button
              title="Rename"
              onClick={() => {
                const newName = window.prompt(
                  "Enter new name:",
                  entry.name
                );

                if (newName && newName.trim() !== entry.name) {
                  void renameEntry(entry.path, newName);
                }
              }}
            >
              <ExternalLink size={12} />
            </button>

            <button
              title="Delete"
              onClick={() => {
                if (
                  window.confirm(
                    `Delete ${entry.name}?`
                  )
                ) {
                  void deleteEntry(entry.path);
                }
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {entry.isDir && expanded && (
          <div className="tree-children">
            {children.map((child) =>
              renderDirectoryEntry(child, depth + 1)
            )}

            {children.length === 0 && (
              <div className="tree-empty">
                Empty folder
              </div>
            )}
          </div>
        )}
      </React.Fragment>
    );
  };

  const renderFileExplorer = () => (
    <aside className="file-explorer">
      <div className="panel-heading">
        <div className="panel-title">
          <FolderOpen size={15} />
          <span>Explorer</span>
        </div>

        <div className="explorer-actions">
          <button
            className="icon-button"
            title="New file"
            onClick={() => setNewFileVisible(true)}
          >
            <FilePlus size={15} />
          </button>

          <button
            className="icon-button"
            title="New folder"
            onClick={() => setNewFolderVisible(true)}
            disabled={!rootDirectory}
          >
            <FolderPlus size={15} />
          </button>

          <button
            className="icon-button"
            title="Refresh"
            onClick={() => {
              if (rootDirectory) {
                void loadDirectory(rootDirectory);
              }
            }}
            disabled={!rootDirectory}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="explorer-content">
        {!rootDirectory ? (
          <div className="panel-empty">
            <FolderOpen size={28} />
            <p>No workspace opened.</p>

            <button
              className="settings-action"
              onClick={() => void openWorkspace()}
            >
              Open Folder
            </button>
          </div>
        ) : (
          <div className="explorer-root">
            <button
              className="explorer-root-name"
              onClick={() => void toggleDirectory(rootDirectory)}
            >
              <ChevronDown
                size={13}
                className={
                  expandedDirectories.has(rootDirectory)
                    ? ""
                    : "tree-chevron-closed"
                }
              />

              <FolderOpen size={15} />
              <span>{getFileName(rootDirectory)}</span>
            </button>

            {expandedDirectories.has(rootDirectory) && (
              <div className="tree-children">
                {(directoryContents[rootDirectory] ?? []).map(
                  (entry) => renderDirectoryEntry(entry)
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );

  const renderEditor = () => (
    <main className="editor-area">
      {openFiles.length > 0 && (
        <div className="editor-tabs">
          {openFiles.map(renderFileTab)}
        </div>
      )}

      <div className="editor-content">
        {currentFile ? (
          <CodeEditor
            value={currentFile.content}
            language={currentFile.language}
            theme={themeName}
            searchNavigation={searchNavigation}
            onChange={(content) =>
              updateFileContent(currentFile.path, content)
            }
          />
        ) : (
          <div className="editor-empty">
            <img className="empty-koala" src={koaiLogo}></img>
            <h1>koai</h1>
            <p>Cozy Codespace for your crazy ideas</p>

            <div className="empty-actions">
              <button onClick={() => void openWorkspace()}>
                <FolderOpen size={15} />
                Open Folder
              </button>

              <button onClick={() => void openSingleFile()}>
                <File size={15} />
                Open File
              </button>

              <button onClick={() => setNewFileVisible(true)}>
                <FilePlus size={15} />
                New File
              </button>
            </div>

            <div className="editor-shortcuts">
              <span>Ctrl + O — Open Folder</span>
              <span>Ctrl + N — New File</span>
              <span>Ctrl + P — Find File</span>
            </div>
          </div>
        )}
      </div>
    </main>
  );

  const renderSearchPanel = () => (
    <section className="search-panel">
      <div className="panel-heading">
        <div className="panel-title">
          <Search size={15} />
          <span>Search</span>
        </div>

        <button
          className="panel-close"
          onClick={() => {
            cancelSearch();
            setSearchVisible(false);
          }}
          title="Close search"
        >
          <X size={16} />
        </button>
      </div>

      <div className="search-controls">
        <div className="search-modes">
          <button
            className={searchMode === "files" ? "selected" : ""}
            onClick={() => selectSearchMode("files")}
          >
            File search
          </button>

          <button
            className={searchMode === "content" ? "selected" : ""}
            onClick={() => selectSearchMode("content")}
          >
            Word search
          </button>
        </div>

        <div className="search-input-row">
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void searchWorkspace();
              }
            }}
            placeholder={
              searchMode === "files"
                ? "Search file names..."
                : "Search file contents..."
            }
          />

          <button
            onClick={() =>
              searching
                ? cancelSearch()
                : void searchWorkspace()
            }
            title={searching ? "Cancel search" : "Search"}
          >
            {searching ? (
              <Square size={15} />
            ) : (
              <Search size={16} />
            )}
          </button>
        </div>

        <label className="search-option">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(event) =>
              setCaseSensitive(event.target.checked)
            }
          />
          Case sensitive
        </label>
      </div>

      <div className="search-results">
        <div className="search-results-heading">
          {searching
            ? "Searching..."
            : `${searchResults.length} results`}
        </div>

        {searchResults.map((result, index) => (
          <button
            key={`${result.file.path}-${index}`}
            className="search-result"
            onClick={() => void openSearchResult(result)}
          >
            <span className="search-result-name">
              <File size={14} />
              {result.file.name}
            </span>

            <span className="search-result-path">
              {result.file.path}
            </span>

            {searchMode === "content" && (
              <span className="search-result-match">
                {result.line
                  ? `Line ${result.line}: `
                  : ""}
                {result.match}
              </span>
            )}
          </button>
        ))}

        {!searching &&
          searchQuery &&
          searchResults.length === 0 && (
            <div className="panel-empty">
              No results found.
            </div>
          )}

        {!searchQuery && (
          <div className="panel-empty">
            Search your workspace.
          </div>
        )}
      </div>
    </section>
  );


  const renderTerminal = () => (
    <section className="bottom-panel">
      <div className="panel-heading">
        <div className="panel-title">
          <TerminalIcon size={15} />
          <span>Terminal</span>
        </div>

        <div className="terminal-actions">
          <button
            className="panel-close"
            onClick={() => setTerminalVisible(false)}
            title="Close terminal"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="terminal-content">
        <TerminalPanel cwd={rootDirectory} />
      </div>
    </section>
  );

  const renderAssistant = () => (
    <section className="bottom-panel assistant-panel">
      <div className="panel-heading">
        <div className="panel-title">
          <Sparkles size={15} />
          <span>Assistant</span>
        </div>

        <div className="assistant-actions">
          <button
            className="icon-button"
            onClick={clearAssistantConversation}
            title="Clear conversation"
            disabled={assistantLoading}
          >
            <RotateCcw size={14} />
          </button>

          <button
            className="panel-close"
            onClick={() => setAssistantVisible(false)}
            title="Close assistant"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="assistant-content">
        {assistantMessages.length === 0 ? (
          <div className="assistant-empty">
            <div className="assistant-koala"><img className="empty-koala" src={koaiLogo}></img></div>
            <h3>How can I help?</h3>

            <p>
              Ask koai about your code or development workflow.
            </p>

            {currentFile && (
              <div className="assistant-context">
                <File size={13} />
                Context: {currentFile.name}
              </div>
            )}

            <div className="assistant-suggestions">
              <button
                onClick={() =>
                  setAssistantInput("Explain my current code")
                }
                disabled={!currentFile}
              >
                Explain my code
              </button>

              <button
                onClick={() =>
                  setAssistantInput("Find potential bugs in my code")
                }
                disabled={!currentFile}
              >
                Find bugs
              </button>

              <button
                onClick={() =>
                  setAssistantInput("Suggest improvements to my code")
                }
                disabled={!currentFile}
              >
                Improve code
              </button>

              <button
                onClick={() =>
                  setAssistantInput(
                    "Generate a complete implementation for my requirements."
                  )
                }
              >
                Generate code
              </button>

              <button
                onClick={() =>
                  setAssistantInput(
                    "Review my current file and provide a corrected version."
                  )
                }
                disabled={!currentFile}
              >
                Fix my code
              </button>

              <button
                onClick={() =>
                  setAssistantInput(
                    "Refactor my current code and improve its structure."
                  )
                }
                disabled={!currentFile}
              >
                Refactor code
              </button>
            </div>
          </div>
        ) : (
          assistantMessages.map((message, index) => (
            <div
              key={index}
              className={`assistant-message ${message.role}`}
            >
              <span>
                {message.role === "user" ? "You" : "koai"}
              </span>

              <p>{message.content}</p>
            </div>
          ))
        )}

        {assistantLoading && (
          <div className="assistant-message assistant">
            <span>koai</span>
            <p>Thinking...</p>
          </div>
        )}
        {assistantMessages.some(
          (message) => message.role === "assistant"
        ) && (
            <div className="assistant-suggestions">
              <button
                onClick={() => void applyAIResponse()}
                disabled={!currentFile || assistantLoading}
              >
                Apply to Editor
              </button>
            </div>
          )}
      </div>

      <div className="assistant-input">
        <textarea
          ref={assistantInputRef}
          value={assistantInput}
          onChange={(event) =>
            setAssistantInput(event.target.value)
          }
          placeholder="Ask koai anything..."
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey
            ) {
              event.preventDefault();
              void sendAssistantMessage();
            }
          }}
        />

        {assistantLoading ? (
          <button
            onClick={() => void stopAssistantGeneration()}
            title="Stop generation"
          >
            <Square size={15} />
          </button>
        ) : (
          <button
            onClick={() => void sendAssistantMessage()}
            disabled={!assistantInput.trim()}
            title="Send message"
          >
            <ArrowUp size={17} />
          </button>
        )}
      </div>
    </section>
  );

  const renderDropdownItem = (
    label: string,
    action: () => void,
    shortcut?: string,
    disabled = false,
    icon?: React.ReactNode
  ) => (
    <button
      className="dropdown-item"
      onClick={action}
      disabled={disabled}
    >
      {icon && (
        <span className="dropdown-icon">
          {icon}
        </span>
      )}

      <span>{label}</span>

      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );

  const renderTopBar = () => (
    <header className="topbar">
      <div className="topbar-left">
        <button
          className="icon-button sidebar-toggle"
          onClick={() =>
            setSidebarVisible((previous) => !previous)
          }
          title="Toggle explorer"
        >
          <PanelLeft size={16} />
        </button>

        <div className="top-menu-item">
          <button
            className="brand-button"
            onClick={openKoaiMenu}
          >
            <span>koai</span>
          </button>
        </div>

        <div className="top-menu-item">
          <button
            className={`top-menu-button ${activeMenu === "file" ? "active" : ""
              }`}
            onClick={() => toggleMenu("file")}
          >
            File
            <ChevronDown size={12} />
          </button>

          {activeMenu === "file" && (
            <div className="top-dropdown">
              {renderDropdownItem(
                "Open File",
                () => void openSingleFile(),
                "Ctrl + Shift + O",
                false,
                <File size={15} />
              )}

              {renderDropdownItem(
                "Open Folder",
                () => void openWorkspace(),
                "Ctrl + O",
                false,
                <FolderOpen size={15} />
              )}

              <div className="dropdown-divider" />

              {renderDropdownItem(
                "New File",
                () => {
                  setNewFileVisible(true);
                  setActiveMenu(null);
                },
                "Ctrl + N",
                false,
                <FilePlus size={15} />
              )}

              {renderDropdownItem(
                "New Folder",
                () => {
                  setNewFolderVisible(true);
                  setActiveMenu(null);
                },
                undefined,
                !rootDirectory,
                <FolderPlus size={15} />
              )}

              <div className="dropdown-divider" />

              {renderDropdownItem(
                "Save",
                () => {
                  void saveFile();
                  setActiveMenu(null);
                },
                "Ctrl + S",
                !currentFile,
                <Save size={15} />
              )}

              {renderDropdownItem(
                "Save As",
                () => {
                  void saveAs();
                  setActiveMenu(null);
                },
                "Ctrl + Shift + S",
                !currentFile,
                <ExternalLink size={15} />
              )}

              {renderDropdownItem(
                "Save All",
                () => {
                  void saveAll();
                  setActiveMenu(null);
                },
                undefined,
                dirtyFiles.length === 0,
                <Check size={15} />
              )}

              <div className="dropdown-divider" />

              {renderDropdownItem(
                "Save & Close",
                () => {
                  if (currentFile) {
                    void closeFile(currentFile.path, true);
                  }

                  setActiveMenu(null);
                },
                undefined,
                !currentFile,
                <Save size={15} />
              )}

              {renderDropdownItem(
                "Don't Save & Close",
                () => {
                  if (currentFile) {
                    void closeFile(currentFile.path, false);
                  }

                  setActiveMenu(null);
                },
                undefined,
                !currentFile,
                <X size={15} />
              )}
            </div>
          )}
        </div>

        <div className="top-menu-item">
          <button
            className={`top-menu-button ${activeMenu === "search" || searchVisible
              ? "active"
              : ""
              }`}
            onClick={() => toggleMenu("search")}
          >
            Search
            <ChevronDown size={12} />
          </button>

          {activeMenu === "search" && (
            <div className="top-dropdown">
              {renderDropdownItem(
                "File search",
                () => selectSearchMode("files"),
                "Ctrl + P",
                false,
                <File size={15} />
              )}

              {renderDropdownItem(
                "Word search",
                () => selectSearchMode("content"),
                "Ctrl + F",
                false,
                <Search size={15} />
              )}

              <div className="dropdown-divider" />

              {renderDropdownItem(
                "Cut",
                () => handleEditorCommand("cut"),
                "Ctrl + X",
                !currentFile,
                <Scissors size={15} />
              )}

              {renderDropdownItem(
                "Copy",
                () => handleEditorCommand("copy"),
                "Ctrl + C",
                !currentFile,
                <Copy size={15} />
              )}

              {renderDropdownItem(
                "Paste",
                () => handleEditorCommand("paste"),
                "Ctrl + V",
                !currentFile,
                <Clipboard size={15} />
              )}
            </div>
          )}
        </div>

        <button
          className={`top-toggle ${terminalVisible ? "enabled" : ""
            }`}
          onClick={toggleTerminal}
        >
          <TerminalIcon size={15} />
          <span>Terminal</span>
          <span className="toggle-indicator" />
        </button>

        <button
          className={`top-toggle ${assistantVisible ? "enabled" : ""
            }`}
          onClick={toggleAssistant}
        >
          <Sparkles size={15} />
          <span>Assistant</span>
          <span className="toggle-indicator" />
        </button>
      </div>

      <div className="topbar-right">
        {currentFile && (
          <span className="current-file-name">
            {currentFile.dirty && (
              <span className="file-dirty-dot">●</span>
            )}

            {currentFile.name}
          </span>
        )}

        {rootDirectory && (
          <span className="workspace-name">
            <GitBranch size={13} />
            {getFileName(rootDirectory)}
          </span>
        )}
      </div>
    </header>
  );

  const renderSettings = () => {
    if (!settingsView) return null;

    return (
      <div
        className="modal-overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setSettingsView(null);
          }
        }}
      >
        <section className="settings-modal">
          <header className="settings-header">
            <div className="settings-brand">
              <Settings size={18} />
              <span>Info & Settings</span>
            </div>
            <button
              className="icon-button"
              onClick={() => setSettingsView(null)}
              title="Close"
            >
              <X size={17} />
            </button>
          </header>

          <nav className="settings-navigation">
            <button
              className={settingsView === "about" ? "selected" : ""}
              onClick={() => setSettingsView("about")}
            >
              <Info size={15} />
              About
            </button>

            <button
              className={settingsView === "ai" ? "selected" : ""}
              onClick={() => setSettingsView("ai")}
            >
              <Bot size={15} />
              AI Settings
            </button>

            <button
              className={settingsView === "themes" ? "selected" : ""}
              onClick={() => setSettingsView("themes")}
            >
              <Palette size={15} />
              Theme Settings
            </button>
          </nav>

          <div className="settings-body">
            {settingsView === "about" && (
              <div className="settings-page">
                <img className="about-logo" src={koaiLogo}></img>
                <h2>koai</h2>

                <p className="settings-description">
                  A minimal code editor with terminal and AI support.
                </p>

                <div className="settings-information">
                  <div>
                    <span>Version</span>
                    <strong>{appVersion}</strong>
                  </div>

                  <div>
                    <span>Platform</span>
                    <strong>{isAndroid ? "Android" : "Desktop"}</strong>
                  </div>

                  <div>
                    <span>Developed by</span>
                    <strong>kuwushagra</strong>
                  </div>
                </div>

                <button
                  className="settings-action"
                  onClick={checkForUpdates}
                >
                  <RefreshCw size={15} />
                  Check for updates
                </button>
              </div>
            )}

            {settingsView === "ai" && (
              <div className="settings-page">
                <h2 className="ai-settings-label">AI Settings</h2>
                <p className="settings-description">
                  Configure your AI provider.
                </p>
                {!aiUnlocked ? (
                  <div className="ai-unlock-screen">
                    <div className="ai-unlock-icon">
                      <LockKeyhole size={36} />
                    </div>

                    <h2>
                      {aiSetupRequired ? "Secure Your AI Settings" : "Unlock koai Assistant Settings"}
                    </h2>

                    <p>
                      {aiSetupRequired
                        ? "Create a master password to encrypt your AI credentials."
                        : "Enter your master password to access your AI credentials."}
                    </p>

                    <input
                      type="password"
                      value={masterPassword}
                      onChange={(e) => setMasterPassword(e.target.value)}
                      placeholder={
                        aiSetupRequired
                          ? "Create master password (12+ characters)"
                          : "Enter master password"
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (aiSetupRequired) {
                            void setupAIMasterPassword();
                          } else {
                            void unlockAI();
                          }
                        }
                      }}
                    />

                    {unlockError && (
                      <p className="error-message">{unlockError}</p>
                    )}

                    <button
                      onClick={() => {
                        if (aiSetupRequired) {
                          void setupAIMasterPassword();
                        } else {
                          void unlockAI();
                        }
                      }}
                      disabled={masterPassword.length === 0}
                    >
                      {aiSetupRequired ? "Create Secure Storage" : "Unlock AI"}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="ai-security-status">
                      <span>AI settings unlocked</span>
                      <button onClick={() => void lockAI()}>
                        Lock AI
                      </button>
                    </div>

                    <label className="settings-label">
                      Provider
                    </label>

                    <select
                      className="settings-select"
                      value={aiProvider}
                      onChange={(event) => {
                        const provider = event.target.value as AIProvider | "";
                        setAiProvider(provider);
                        localStorage.setItem("koai-provider", provider);
                      }}
                    >
                      <option value="">Select provider</option>
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="google">Google</option>
                      <option value="custom">Custom API</option>
                    </select>

                    <label className="settings-label">
                      Model
                    </label>

                    <input
                      className="settings-input"
                      type="text"
                      placeholder="gpt-5.5 / gemini-3.5-flash / claude-sonnet-4-5"
                      value={aiModel}
                      onChange={(event) =>
                        setAiModel(event.target.value)
                      }
                    />

                    {aiProvider === "custom" && (
                      <>
                        <label className="settings-label">
                          API Endpoint
                        </label>

                        <input
                          className="settings-input"
                          type="text"
                          placeholder="https://your-api.com/v1"
                          value={customApiUrl}
                          onChange={(event) =>
                            setCustomApiUrl(event.target.value)
                          }
                        />
                      </>
                    )}

                    <label className="settings-label">
                      API Key
                    </label>

                    <input
                      type="password"
                      value={aiApiKey}
                      onChange={(e) => setAiApiKey(e.target.value)}
                      placeholder="Enter API key"
                    />

                    <p className="settings-description">
                      Go to your preferred AI service to generate an API Key for koai
                    </p>

                    <button
                      className="settings-action primary"
                      onClick={() => void saveAISettings()}
                    >
                      <Save size={15} />
                      Save AI Settings
                    </button>
                  </>
                )}
              </div>
            )}

            {settingsView === "themes" && (
              <div className="settings-page">
                <h2>Theme Settings</h2>

                <p className="settings-description">
                  Choose the appearance of your workspace.
                </p>

                <div className="theme-grid">
                  {(Object.keys(themes) as ThemeName[]).map(
                    (name) => (
                      <button
                        key={String(name)}
                        className={`theme-option ${themeName === name ? "selected" : ""
                          }`}
                        onClick={() => changeTheme(name)}
                      >
                        <span
                          className="theme-preview"
                          data-theme-preview={String(name)}
                        >
                          <span />
                          <span />
                          <span />
                        </span>

                        <span className="theme-option-name">
                          {String(name)
                            .replace(/[-_]/g, " ")
                            .replace(/\b\w/g, (letter) =>
                              letter.toUpperCase()
                            )}
                        </span>

                        {themeName === name && (
                          <Check size={14} />
                        )}
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    );
  };

  const renderNewFileDialog = () => {
    if (!newFileVisible) return null;

    return (
      <div
        className="modal-overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setNewFileVisible(false);
          }
        }}
      >
        <section className="small-modal">
          <div className="small-modal-heading">
            <FilePlus size={18} />
            <h3>New File</h3>
          </div>

          <input
            autoFocus
            className="settings-input"
            placeholder="File name..."
            value={newFileName}
            onChange={(event) =>
              setNewFileName(event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void createNewFile();
              }

              if (event.key === "Escape") {
                setNewFileVisible(false);
              }
            }}
          />

          <div className="modal-actions">
            <button
              onClick={() => setNewFileVisible(false)}
            >
              Cancel
            </button>

            <button
              className="primary"
              onClick={() => void createNewFile()}
            >
              Create
            </button>
          </div>
        </section>
      </div>
    );
  };

  const renderNewFolderDialog = () => {
    if (!newFolderVisible) return null;

    return (
      <div
        className="modal-overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setNewFolderVisible(false);
          }
        }}
      >
        <section className="small-modal">
          <div className="small-modal-heading">
            <FolderPlus size={18} />
            <h3>New Folder</h3>
          </div>

          <input
            autoFocus
            className="settings-input"
            placeholder="Folder name..."
            value={newFolderName}
            onChange={(event) =>
              setNewFolderName(event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void createNewFolder();
              }

              if (event.key === "Escape") {
                setNewFolderVisible(false);
              }
            }}
          />

          <div className="modal-actions">
            <button
              onClick={() => setNewFolderVisible(false)}
            >
              Cancel
            </button>

            <button
              className="primary"
              onClick={() => void createNewFolder()}
            >
              Create
            </button>
          </div>
        </section>
      </div>
    );
  };

  const renderUnsavedDialog = () => {
    if (!confirmCloseFile) return null;

    const file = openFiles.find(
      (item) => item.path === confirmCloseFile
    );

    if (!file) return null;

    return (
      <div className="modal-overlay">
        <section className="small-modal">
          <div className="small-modal-heading">
            <AlertTriangle size={18} />
            <h3>Unsaved Changes</h3>
          </div>

          <p className="settings-description">
            Save changes to {file.name} before closing?
          </p>

          <div className="modal-actions">
            <button
              onClick={() => setConfirmCloseFile(null)}
            >
              Cancel
            </button>

            <button
              onClick={() => {
                discardAndCloseFile(confirmCloseFile);
              }}
            >
              Don't Save
            </button>

            <button
              className="primary"
              onClick={() => {
                void closeFile(confirmCloseFile, true);
              }}
            >
              Save
            </button>
          </div>
        </section>
      </div>
    );
  };

  return (
    <div
      className="koai-app"
      data-theme={String(themeName)}
      style={
        (theme as { variables?: React.CSSProperties }).variables
      }
    >
      {renderTopBar()}

      <div className="workspace">
        {sidebarVisible && (
          <>
            <div
              className="file-explorer-wrapper"
              style={{ width: explorerWidth }}
            >
              {renderFileExplorer()}
            </div>

            <div
              className="resize-handle horizontal"
              onPointerDown={(event) =>
                startResize(event, "explorer")
              }
            />
          </>
        )}

        <div className="workspace-main">
          {renderEditor()}

          {(searchVisible ||
            terminalVisible ||
            assistantVisible) && (
              <div className="workspace-panels">
                {searchVisible && renderSearchPanel()}

                {terminalVisible && (
                  <div
                    className="resizable-panel"
                    style={{ height: terminalHeight }}
                  >
                    <div
                      className="resize-handle vertical"
                      onPointerDown={(event) =>
                        startResize(event, "terminal")
                      }
                    />
                    {renderTerminal()}
                  </div>
                )}

                {assistantVisible && (
                  <div
                    className="resizable-panel"
                    style={{ height: assistantHeight }}
                  >
                    <div
                      className="resize-handle vertical"
                      onPointerDown={(event) =>
                        startResize(event, "assistant")
                      }
                    />
                    {renderAssistant()}
                  </div>
                )}
              </div>
            )}
        </div>
      </div>

      {renderSettings()}
      {renderNewFileDialog()}
      {renderNewFolderDialog()}
      {renderUnsavedDialog()}
      {renderWorkspaceChangeDialog()}

      {toast && (
        <div className="toast">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;