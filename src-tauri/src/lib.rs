mod commands;
mod terminal;
use commands::filesystem::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            list_directory,
            create_entry,
            rename_entry,
            delete_entry,
            parent_directory,
            terminal::terminal_spawn,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close
        ])
        .manage(terminal::TerminalState::default())
        .run(tauri::generate_context!())
        .expect("error while running koai");
}
