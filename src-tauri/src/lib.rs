
mod commands;
mod terminal;
use commands::filesystem::*;
mod ai;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            ai::ai_chat,
            ai::setup_master_password,
            ai::unlock_ai_settings,
            ai::lock_ai_settings,
            ai::is_ai_unlocked,
            ai::has_ai_settings,
            ai::save_ai_settings,
            ai::get_ai_settings,
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
        .manage(ai::AIEncryptionState::default())
        .manage(terminal::TerminalState::default())
        .run(tauri::generate_context!())
        .expect("error while running koai");
}
