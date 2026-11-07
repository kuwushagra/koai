
import type { CSSProperties } from "react";

interface Theme {
  light: boolean;
  variables: CSSProperties;
}

export const themes: Record<string, Theme> = {
  // DARK THEMES

  dark: {
    light: false,
    variables: {
      "--bg": "#181818",
      "--surface": "#202020",
      "--surface-hover": "#292929",
      "--border": "#303030",
      "--text": "#eeeeee",
      "--text-muted": "#858585",
      "--accent": "#a78bfa",
      "--editor-bg": "#181818",
    } as CSSProperties,
  },

  amoled: {
    light: false,
    variables: {
      "--bg": "#000000",
      "--surface": "#080808",
      "--surface-hover": "#151515",
      "--border": "#202020",
      "--text": "#ffffff",
      "--text-muted": "#777777",
      "--accent": "#a78bfa",
      "--editor-bg": "#000000",
    } as CSSProperties,
  },

  gruvbox: {
    light: false,
    variables: {
      "--bg": "#282828",
      "--surface": "#32302f",
      "--surface-hover": "#3c3836",
      "--border": "#504945",
      "--text": "#ebdbb2",
      "--text-muted": "#a89984",
      "--accent": "#fabd2f",
      "--editor-bg": "#282828",
    } as CSSProperties,
  },

  nord: {
    light: false,
    variables: {
      "--bg": "#2e3440",
      "--surface": "#3b4252",
      "--surface-hover": "#434c5e",
      "--border": "#4c566a",
      "--text": "#eceff4",
      "--text-muted": "#9aa7ba",
      "--accent": "#88c0d0",
      "--editor-bg": "#2e3440",
    } as CSSProperties,
  },

  dracula: {
    light: false,
    variables: {
      "--bg": "#282a36",
      "--surface": "#343746",
      "--surface-hover": "#44475a",
      "--border": "#44475a",
      "--text": "#f8f8f2",
      "--text-muted": "#9da0b0",
      "--accent": "#bd93f9",
      "--editor-bg": "#282a36",
    } as CSSProperties,
  },

  "tokyo-night": {
    light: false,
    variables: {
      "--bg": "#1a1b26",
      "--surface": "#24283b",
      "--surface-hover": "#292e42",
      "--border": "#343b58",
      "--text": "#c0caf5",
      "--text-muted": "#7982a9",
      "--accent": "#7aa2f7",
      "--editor-bg": "#1a1b26",
    } as CSSProperties,
  },

  "one-dark": {
    light: false,
    variables: {
      "--bg": "#282c34",
      "--surface": "#21252b",
      "--surface-hover": "#2c313a",
      "--border": "#3e4451",
      "--text": "#abb2bf",
      "--text-muted": "#7f848e",
      "--accent": "#61afef",
      "--editor-bg": "#282c34",
    } as CSSProperties,
  },

  catppuccin: {
    light: false,
    variables: {
      "--bg": "#1e1e2e",
      "--surface": "#24243a",
      "--surface-hover": "#313147",
      "--border": "#45475a",
      "--text": "#cdd6f4",
      "--text-muted": "#9399b2",
      "--accent": "#cba6f7",
      "--editor-bg": "#1e1e2e",
    } as CSSProperties,
  },

  "rose-pine": {
    light: false,
    variables: {
      "--bg": "#191724",
      "--surface": "#1f1d2e",
      "--surface-hover": "#26233a",
      "--border": "#403d52",
      "--text": "#e0def4",
      "--text-muted": "#908caa",
      "--accent": "#ebbcba",
      "--editor-bg": "#191724",
    } as CSSProperties,
  },

  monokai: {
    light: false,
    variables: {
      "--bg": "#272822",
      "--surface": "#30312a",
      "--surface-hover": "#3e3f35",
      "--border": "#49483e",
      "--text": "#f8f8f2",
      "--text-muted": "#a6a69c",
      "--accent": "#a6e22e",
      "--editor-bg": "#272822",
    } as CSSProperties,
  },

  // LIGHT THEMES

  light: {
    light: true,
    variables: {
      "--bg": "#f5f5f5",
      "--surface": "#ffffff",
      "--surface-hover": "#eeeeee",
      "--border": "#dedede",
      "--text": "#202020",
      "--text-muted": "#777777",
      "--accent": "#7355c5",
      "--editor-bg": "#ffffff",
    } as CSSProperties,
  },

  "github-light": {
    light: true,
    variables: {
      "--bg": "#ffffff",
      "--surface": "#f6f8fa",
      "--surface-hover": "#eaeef2",
      "--border": "#d0d7de",
      "--text": "#1f2328",
      "--text-muted": "#656d76",
      "--accent": "#0969da",
      "--editor-bg": "#ffffff",
    } as CSSProperties,
  },

  "solarized-light": {
    light: true,
    variables: {
      "--bg": "#fdf6e3",
      "--surface": "#eee8d5",
      "--surface-hover": "#e6dfcc",
      "--border": "#d6cfbc",
      "--text": "#586e75",
      "--text-muted": "#839496",
      "--accent": "#268bd2",
      "--editor-bg": "#fdf6e3",
    } as CSSProperties,
  },

  "gruvbox-light": {
    light: true,
    variables: {
      "--bg": "#fbf1c7",
      "--surface": "#f2e5bc",
      "--surface-hover": "#ebdbb2",
      "--border": "#d5c4a1",
      "--text": "#3c3836",
      "--text-muted": "#928374",
      "--accent": "#b57614",
      "--editor-bg": "#fbf1c7",
    } as CSSProperties,
  },

  "catppuccin-latte": {
    light: true,
    variables: {
      "--bg": "#eff1f5",
      "--surface": "#e6e9ef",
      "--surface-hover": "#dce0e8",
      "--border": "#ccd0da",
      "--text": "#4c4f69",
      "--text-muted": "#8c8fa1",
      "--accent": "#8839ef",
      "--editor-bg": "#eff1f5",
    } as CSSProperties,
  },

  "rose-pine-dawn": {
    light: true,
    variables: {
      "--bg": "#faf4ed",
      "--surface": "#fffaf3",
      "--surface-hover": "#f2e9e1",
      "--border": "#dfdad9",
      "--text": "#575279",
      "--text-muted": "#9893a5",
      "--accent": "#d7827e",
      "--editor-bg": "#faf4ed",
    } as CSSProperties,
  },

  "everforest-light": {
    light: true,
    variables: {
      "--bg": "#fdf6e3",
      "--surface": "#f4f0d9",
      "--surface-hover": "#eae4ca",
      "--border": "#d3c6aa",
      "--text": "#5c6a72",
      "--text-muted": "#939f91",
      "--accent": "#8da101",
      "--editor-bg": "#fdf6e3",
    } as CSSProperties,
  },

  "quiet-light": {
    light: true,
    variables: {
      "--bg": "#f5f5f5",
      "--surface": "#ffffff",
      "--surface-hover": "#eaeaea",
      "--border": "#dddddd",
      "--text": "#333333",
      "--text-muted": "#888888",
      "--accent": "#4876d6",
      "--editor-bg": "#f5f5f5",
    } as CSSProperties,
  },

  "soft-peach": {
    light: true,
    variables: {
      "--bg": "#fff1e6",
      "--surface": "#fff8f2",
      "--surface-hover": "#ffe5d4",
      "--border": "#f0cdb8",
      "--text": "#624638",
      "--text-muted": "#a17c6b",
      "--accent": "#e58b64",
      "--editor-bg": "#fff1e6",
    } as CSSProperties,
  },

  lavender: {
    light: true,
    variables: {
      "--bg": "#f4f0ff",
      "--surface": "#ffffff",
      "--surface-hover": "#eae2ff",
      "--border": "#d9cef2",
      "--text": "#453b5c",
      "--text-muted": "#9385aa",
      "--accent": "#9475d7",
      "--editor-bg": "#f4f0ff",
    } as CSSProperties,
  },
};