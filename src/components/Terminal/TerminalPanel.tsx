
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
    const container = containerRef.current;
    if (!container) return;

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
      allowProposedApi: true,
      convertEol: false,
    });

    const fitAddon = new FitAddon();

    terminal.loadAddon(fitAddon);
    terminal.open(container);

    let sessionId: string | null = null;
    let disposed = false;
    let animationFrame = 0;
    let closing = false;

    let unlistenOutput: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;

    const fitTerminal = () => {
      if (disposed) return;

      cancelAnimationFrame(animationFrame);

      animationFrame = requestAnimationFrame(() => {
        if (disposed) return;

        if (
          container.clientWidth <= 0 ||
          container.clientHeight <= 0
        ) {
          return;
        }

        try {
          fitAddon.fit();

          if (sessionId) {
            void invoke("terminal_resize", {
              sessionId,
              cols: terminal.cols,
              rows: terminal.rows,
            }).catch(console.error);
          }
        } catch (error) {
          console.error("Terminal resize failed:", error);
        }
      });
    };

    const closeSession = async (id: string) => {
      if (closing) return;

      closing = true;

      try {
        await invoke("terminal_close", {
          sessionId: id,
        });
      } catch (error) {
        console.error("Terminal close failed:", error);
      }
    };

    const start = async () => {
      try {
        const outputListener = await listen<TerminalOutput>(
          "terminal-output",
          (event) => {
            if (
              !disposed &&
              event.payload.session_id === sessionId
            ) {
              terminal.write(event.payload.data);
            }
          }
        );

        if (disposed) {
          outputListener();
          return;
        }

        unlistenOutput = outputListener;

        const exitListener = await listen<string>(
          "terminal-exit",
          (event) => {
            if (
              !disposed &&
              event.payload === sessionId
            ) {
              terminal.writeln("\r\n[Process exited]");
              sessionId = null;
            }
          }
        );

        if (disposed) {
          exitListener();
          return;
        }

        unlistenExit = exitListener;

        if (
          container.clientWidth > 0 &&
          container.clientHeight > 0
        ) {
          fitAddon.fit();
        }

        const id = await invoke<string>("terminal_spawn", {
          cwd: cwd || null,
          cols: Math.max(terminal.cols, 20),
          rows: Math.max(terminal.rows, 5),
        });

        if (disposed) {
          await closeSession(id);
          return;
        }

        sessionId = id;

        terminal.writeln("koai terminal ^_^");
        terminal.writeln("This is **not** an isolated environment. Run commands carefully.");
        terminal.writeln("");

        terminal.onData((data) => {
          if (!sessionId || disposed) return;

          void invoke("terminal_write", {
            sessionId,
            data,
          }).catch((error) => {
            if (!disposed) {
              terminal.writeln(
                `\r\nTerminal error: ${String(error)}`
              );
            }
          });
        });

        fitTerminal();
        terminal.focus();
      } catch (error) {
        if (!disposed) {
          terminal.writeln(
            `\r\nFailed to start terminal: ${String(error)}`
          );
          console.error("Terminal startup failed:", error);
        }
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      fitTerminal();
    });

    resizeObserver.observe(container);

    void start();

    return () => {
      disposed = true;

      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();

      unlistenOutput?.();
      unlistenExit?.();

      if (sessionId) {
        void closeSession(sessionId);
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
        minWidth: 0,
        minHeight: 0,
        boxSizing: "border-box",
        padding: 8,
        background: "#111318",
        overflow: "hidden",
      }}
    />
  );
}