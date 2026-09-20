use std::sync::Mutex;

use crate::{
    analyzer::{analys, research, selected_path},
    configuration::{CompiledPattern, load_configuration},
    viewer::{get_analyzed_logs, open_log_at_line},
};

mod analyzer;
mod configuration;
mod viewer;

#[derive(Default)]
struct AppState {
    path: Option<String>,
    configs: Vec<CompiledPattern>,
    client: reqwest::Client,
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
            research,
            get_analyzed_logs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
