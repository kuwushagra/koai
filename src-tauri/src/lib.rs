
mod ai;
mod commands;

#[cfg(not(target_os = "ios"))]
mod terminal;

use commands::filesystem::*;

#[cfg(not(target_os = "ios"))]
use terminal::TerminalState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build());

    #[cfg(not(target_os = "ios"))]
    let builder = builder
        .manage(TerminalState::default())
        .invoke_handler(tauri::generate_handler![
            get_android_workspace,
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
        ]);

    #[cfg(target_os = "ios")]
    let builder = builder.invoke_handler(tauri::generate_handler![
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
        parent_directory
    ]);

    builder
        .manage(ai::AIEncryptionState::default())
        .run(tauri::generate_context!())
        .expect("error while running koai");
}
