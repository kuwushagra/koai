use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};

use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    thread,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Serialize, Clone)]
struct TerminalOutput {
    session_id: String,
    data: String,
}

struct TerminalSession {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
}

#[derive(Default)]
pub struct TerminalState {
    sessions: Mutex<HashMap<String, Arc<TerminalSession>>>,
}

#[tauri::command]
pub fn terminal_spawn(
    app: AppHandle,
    state: State<'_, TerminalState>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let system = native_pty_system();

    let pair = system
        .openpty(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    let mut command = CommandBuilder::new("powershell.exe");

    #[cfg(target_os = "macos")]
    let mut command =
        CommandBuilder::new(std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into()));

    #[cfg(target_os = "linux")]
    let mut command =
        CommandBuilder::new(std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into()));

    command.env("TERM", "xterm-256color");

    if let Some(directory) = cwd {
        if !directory.trim().is_empty() {
            command.cwd(directory);
        }
    }

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|e| e.to_string())?;

    let killer = child.clone_killer();

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    drop(pair.slave);

    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed).to_string();

    let session = Arc::new(TerminalSession {
        writer: Mutex::new(writer),
        master: Mutex::new(pair.master),
        killer: Mutex::new(killer),
    });

    state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id.clone(), session);

    let app_handle = app.clone();
    let session_id = id.clone();

    thread::spawn(move || {
        let mut buffer = [0u8; 4096];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => {
                    let data = String::from_utf8_lossy(&buffer[..size]).to_string();

                    let _ = app_handle.emit(
                        "terminal-output",
                        TerminalOutput {
                            session_id: session_id.clone(),
                            data,
                        },
                    );
                }
                Err(_) => break,
            }
        }

        let _ = app_handle.emit("terminal-exit", session_id);
    });

    Ok(id)
}

#[tauri::command]
pub fn terminal_write(
    state: State<'_, TerminalState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;

    let session = sessions
        .get(&session_id)
        .ok_or("Terminal session not found")?;

    let mut writer = session.writer.lock().map_err(|e| e.to_string())?;

    writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;

    writer.flush().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn terminal_resize(
    state: State<'_, TerminalState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;

    let session = sessions
        .get(&session_id)
        .ok_or("Terminal session not found")?;

    let master = session.master.lock().map_err(|e| e.to_string())?;

    master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn terminal_close(state: State<'_, TerminalState>, session_id: String) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&session_id);

    if let Some(session) = session {
        let mut killer = session.killer.lock().map_err(|e| e.to_string())?;

        killer.kill().map_err(|e| e.to_string())?;
    }

    Ok(())
}
