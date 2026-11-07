
import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

import "@xterm/xterm/css/xterm.css";

interface Props {
  cwd: string;
}

interface TerminalOutput {
  session_id: string;
  data: string;
}

export default function TerminalPanel({ cwd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "Consolas, monospace",
      theme: {
        background: "#111318",
        foreground: "#e5e7eb",
        cursor: "#a78bfa",
        selectionBackground: "#45415e",
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();

    let sessionId: string | null = null;
    let disposed = false;

    let unlistenOutput: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;

    const start = async () => {
      try {
        unlistenOutput = await listen<TerminalOutput>(
          "terminal-output",
          (event) => {
            if (
              event.payload.session_id === sessionId
            ) {
              terminal.write(event.payload.data);
            }
          }
        );

        unlistenExit = await listen<string>(
          "terminal-exit",
          (event) => {
            if (event.payload === sessionId) {
              terminal.writeln("\r\n[Process exited]");
            }
          }
        );

        if (disposed) return;

        const id = await invoke<string>("terminal_spawn", {
          cwd: cwd || null,
          cols: terminal.cols,
          rows: terminal.rows,
        });

        if (disposed) {
          await invoke("terminal_close", {
            sessionId: id,
          });
          return;
        }

        sessionId = id;

        terminal.writeln("Welcome to koai terminal.");
        terminal.writeln("");

        terminal.onData((data) => {
          if (!sessionId) return;

          void invoke("terminal_write", {
            sessionId,
            data,
          }).catch((error) => {
            terminal.writeln(
              `\r\nTerminal error: ${String(error)}`
            );
          });
        });

        terminal.focus();
      } catch (error) {
        terminal.writeln(
          `\r\nFailed to start terminal: ${String(error)}`
        );
      }
    };

    void start();

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();

      if (sessionId) {
        void invoke("terminal_resize", {
          sessionId,
          cols: terminal.cols,
          rows: terminal.rows,
        }).catch(console.error);
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      disposed = true;
      resizeObserver.disconnect();

      unlistenOutput?.();
      unlistenExit?.();

      if (sessionId) {
        void invoke("terminal_close", {
          sessionId,
        });
      }

      terminal.dispose();
    };
  }, [cwd]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 150,
        padding: 8,
        background: "#111318",
        overflow: "hidden",
      }}
    />
  );
}