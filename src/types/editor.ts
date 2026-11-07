export type Language =
  | "javascript"
  | "typescript"
  | "python"
  | "html"
  | "css"
  | "json"
  | "markdown";

export interface EditorDocument {
  id: string;
  name: string;
  path: string | null;
  content: string;
  language: Language;
  modified: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
}