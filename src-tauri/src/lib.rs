use std::{
    fs::{read_dir, File},
    io::{BufRead, BufReader},
    sync::Mutex,
    time::SystemTime,
};

use serde::Serialize;
use tauri::ipc::Channel;

use crate::configuration::CompiledPattern;

mod configuration;

#[derive(Clone, Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "event",
    content = "data"
)]
enum AnalysEvent<'a> {
    Start {
        id: &'a String,
        timestamp: SystemTime,
    },
    Progress {
        category: String,
        line: Vec<String>,
        color: String,
        timestamp: SystemTime,
    },
    End {
        id: &'a String,
        timestamp: SystemTime,
    },
}

#[derive(Default)]
struct AppState {
    path: Option<String>,
    configs: Vec<CompiledPattern>,
}

#[tauri::command]
fn analys(
    state: tauri::State<Mutex<AppState>>,
    on_event: Channel<AnalysEvent>,
) -> Result<(), String> {
    let app = state.lock().unwrap();

    match &app.path {
        Some(path) => {
            for entry in read_dir(path).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let file_name = entry.file_name();
                let file_path = entry.path();

                if file_path.is_file() {
                    match file_path.extension().and_then(|ext| ext.to_str()) {
                        Some("txt") | Some("log") => {
                            let f = File::open(&file_path).map_err(|e| e.to_string())?;
                            let f = BufReader::new(f);

                            let id_file = file_name
                                .into_string()
                                .map_err(|os_str| format!("Incorrect file name: {:?}", os_str))?;

                            on_event
                                .send(AnalysEvent::Start {
                                    id: &id_file,
                                    timestamp: SystemTime::now(),
                                })
                                .unwrap();

                            for line_result in f.lines() {
                                let line = match line_result {
                                    Ok(valid_line) => valid_line,
                                    Err(_) => continue,
                                };

                                for config in &app.configs {
                                    let regex = &config.regex;

                                    if regex.is_match(&line) {
                                        let mut test: Vec<String> = vec![];

                                        if let Some(caps) = regex.captures(&line) {
                                            for (i, group) in caps.iter().skip(1).enumerate() {
                                                if let Some(mat) = group {
                                                    test.push(format!(
                                                        "{}^{}",
                                                        config.groups[i],
                                                        mat.as_str()
                                                    ));
                                                }
                                            }
                                        }

                                        on_event
                                            .send(AnalysEvent::Progress {
                                                category: config.name.clone(),
                                                line: test,
                                                color: config.color.clone(),
                                                timestamp: SystemTime::now(),
                                            })
                                            .unwrap();
                                    }
                                }
                            }

                            on_event
                                .send(AnalysEvent::End {
                                    id: &id_file,
                                    timestamp: SystemTime::now(),
                                })
                                .unwrap();
                        }
                        _ => {}
                    }
                }
            }

            Ok(())
        }
        None => Err("File not found".to_string()),
    }
}

#[tauri::command]
fn selected_path(path: String, state: tauri::State<Mutex<AppState>>) {
    let mut app = state.lock().unwrap();
    app.path = Some(path);
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
            configuration::load_configuration
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
