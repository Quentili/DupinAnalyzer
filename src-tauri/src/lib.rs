use std::sync::Mutex;

use crate::{
    analyzer::{analys, open_log_at_line, selected_path},
    configuration::{load_configuration, CompiledPattern},
};

mod analyzer;
mod configuration;

#[derive(Default)]
struct AppState {
    path: Option<String>,
    configs: Vec<CompiledPattern>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(AppState::default()))
        .invoke_handler(tauri::generate_handler![
            analys,
            selected_path,
            load_configuration,
            open_log_at_line,
            // research
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
