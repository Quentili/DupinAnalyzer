use std::{
    fmt::Write,
    fs::{read_dir, File},
    io::{BufRead, BufReader},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread::spawn,
    time::{Duration, Instant, SystemTime},
};

use regex::Regex;
use serde::Serialize;
use tauri::ipc::Channel;

use crate::{configuration::CompiledPattern, AppState};

const BATCH_SIZE: usize = 2000;

#[derive(Clone, Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "event",
    content = "data"
)]
pub enum AnalysEvent {
    Start {
        id: String,
        timestamp: SystemTime,
    },
    Progress {
        progress: f32,
        timestamp: SystemTime,
    },
    Batch {
        id: String,
        payload: Vec<String>,
    },
    End {
        id: String,
        payload: Vec<String>,
        timestamp: SystemTime,
    },
    OpenFile {
        payload: Vec<String>,
        timestamp: SystemTime,
    },
}

#[tauri::command]
pub fn analys(
    state: tauri::State<Mutex<AppState>>,
    on_event: Channel<AnalysEvent>,
) -> Result<(), String> {
    let (dir_path, configs) = {
        let app = state.lock().unwrap();
        let path = match &app.path {
            Some(path) => path.clone(),
            None => return Err("File not found".to_string()),
        };

        let configs = app.configs.clone();
        (path, configs)
    };

    let mut files_process = Vec::new();
    let mut total_bytes: u64 = 0;

    for entry in read_dir(dir_path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_path = entry.path();

        if file_path.is_file() {
            if let Some(ext) = file_path.extension().and_then(|e| e.to_str()) {
                if matches!(ext, "txt" | "log") {
                    let metadate = entry.metadata().map_err(|e| e.to_string())?;
                    total_bytes += metadate.len();
                    files_process.push(file_path);
                }
            }
        }
    }

    if total_bytes == 0 {
        return Ok(());
    }

    let processed_bytes = Arc::new(AtomicU64::new(0));

    spawn(move || {
        for file_path in files_process {
            let file_name = match file_path.file_name().and_then(|e| e.to_str()) {
                Some(name) => name.to_string(),
                None => continue,
            };

            let f = match File::open(&file_path) {
                Ok(file) => file,
                Err(_) => continue,
            };
            let reader = BufReader::new(f);

            search(
                reader,
                &configs,
                &on_event,
                file_name,
                total_bytes,
                Arc::clone(&processed_bytes),
            );
        }

        on_event
            .send(AnalysEvent::Progress {
                progress: 100.0,
                timestamp: SystemTime::now(),
            })
            .unwrap();
    });

    Ok(())
}

fn search(
    reader: BufReader<File>,
    configs: &Vec<CompiledPattern>,
    on_event: &Channel<AnalysEvent>,
    file_name: String,
    total_bytes: u64,
    processed_bytes: Arc<AtomicU64>,
) {
    on_event
        .send(AnalysEvent::Start {
            id: file_name.clone(),
            timestamp: SystemTime::now(),
        })
        .unwrap();

    let mut last_emit = Instant::now();
    let mut payload: Vec<String> = Vec::with_capacity(BATCH_SIZE);

    for (line_index, line) in reader.lines().flatten().into_iter().enumerate() {
        let current_bytes = processed_bytes.fetch_add(line.len() as u64 + 1, Ordering::Relaxed)
            + line.len() as u64
            + 1;

        if last_emit.elapsed() >= Duration::from_millis(100) {
            let progress = (current_bytes as f32 / total_bytes as f32) * 100.0;
            on_event
                .send(AnalysEvent::Progress {
                    progress,
                    timestamp: SystemTime::now(),
                })
                .unwrap();
            last_emit = Instant::now();
        }

        for config in configs {
            let regex = &config.regex;
            if let Some(caps) = regex.captures(&line) {
                let skip_count = if config.groups.is_empty() { 0 } else { 1 };

                let mut log_date: String = String::new();

                for (i, group) in caps.iter().skip(skip_count).enumerate() {
                    if let Some(mat) = group {
                        let group_name = config.groups.get(i).unwrap_or(&config.name);

                        if i < (config.groups.len() - skip_count) {
                            write!(&mut log_date, "{{{}::{}}}::", group_name, mat.as_str())
                                .unwrap();
                        } else {
                            write!(&mut log_date, "{{{}::{}}}", group_name, mat.as_str()).unwrap();
                            write!(
                                &mut log_date,
                                "{{{}::{}::{}}}",
                                config.name, config.color, line_index
                            )
                            .unwrap();

                            payload.push(log_date);
                            log_date = String::new();
                        }
                    }
                }

                if payload.len() >= BATCH_SIZE {
                    on_event
                        .send(AnalysEvent::Batch {
                            id: file_name.clone(),
                            payload: std::mem::take(&mut payload),
                        })
                        .unwrap();
                }
            }
        }
    }

    on_event
        .send(AnalysEvent::End {
            id: file_name,
            payload: std::mem::take(&mut payload),
            timestamp: SystemTime::now(),
        })
        .unwrap();
}

#[tauri::command]
pub fn open_log_at_line(file_path: String, on_event: Channel<AnalysEvent>) -> Result<(), String> {
    let f = File::open(&file_path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(f);
    on_event
        .send(AnalysEvent::OpenFile {
            payload: reader.lines().flatten().collect(),
            timestamp: SystemTime::now(),
        })
        .unwrap();
    Ok(())
}

// #[tauri::command]
// pub fn research(
//     state: tauri::State<Mutex<AppState>>,
//     query: String,
//     on_event: Channel<AnalysEvent>,
// ) -> Result<(), String> {
    // let dir_path = {
    //     let app = state.lock().unwrap();
    //     let path = match &app.path {
    //         Some(path) => path.clone(),
    //         None => return Err("File not found".to_string()),
    //     };

    //     path
    // };

    // let mut files_process = Vec::new();
    // let mut total_bytes: u64 = 0;

    // for entry in read_dir(dir_path).map_err(|e| e.to_string())? {
    //     let entry = entry.map_err(|e| e.to_string())?;
    //     let file_path = entry.path();

    //     if file_path.is_file() {
    //         if let Some(ext) = file_path.extension().and_then(|e| e.to_str()) {
    //             if matches!(ext, "txt" | "log") {
    //                 let metadate = entry.metadata().map_err(|e| e.to_string())?;
    //                 total_bytes += metadate.len();
    //                 files_process.push(file_path);
    //             }
    //         }
    //     }
    // }

    // if total_bytes == 0 {
    //     return Ok(());
    // }

    // let processed_bytes = Arc::new(AtomicU64::new(0));

    // spawn(move || {
    //     for file_path in files_process {
    //         let file_name = match file_path.file_name().and_then(|e| e.to_str()) {
    //             Some(name) => name.to_string(),
    //             None => continue,
    //         };

    //         let f = match File::open(&file_path) {
    //             Ok(file) => file,
    //             Err(_) => continue,
    //         };
    //         let reader = BufReader::new(f);

    //         on_event
    //             .send(AnalysEvent::Start {
    //                 id: file_name.clone(),
    //                 timestamp: SystemTime::now(),
    //             })
    //             .unwrap();

    //         let mut last_emit = Instant::now();
    //         let mut payload: Vec<String> = Vec::with_capacity(BATCH_SIZE);

    //         for (line_index, line) in reader.lines().flatten().into_iter().enumerate() {
    //             let current_bytes = processed_bytes
    //                 .fetch_add(line.len() as u64 + 1, Ordering::Relaxed)
    //                 + line.len() as u64
    //                 + 1;

    //             if last_emit.elapsed() >= Duration::from_millis(100) {
    //                 let progress = (current_bytes as f32 / total_bytes as f32) * 100.0;
    //                 on_event
    //                     .send(AnalysEvent::Progress {
    //                         progress,
    //                         timestamp: SystemTime::now(),
    //                     })
    //                     .unwrap();
    //                 last_emit = Instant::now();
    //             }

    //                 let regex = Regex::new(&query).map_err(|e| e.to_string())?;
    //                 if let Some(caps) = regex.captures(&line) {
    //                     let mut log_date: String = String::new();

    //                     for (i, group) in caps.iter().enumerate() {
    //                         if let Some(mat) = group {
    //                                 write!(&mut log_date, "{{{}::{}}}", mat.as_str(), line_index)
    //                                     .unwrap();
    //                                 payload.push(log_date);
    //                         }
    //                     }

    //                     if payload.len() >= BATCH_SIZE {
    //                         on_event
    //                             .send(AnalysEvent::Batch {
    //                                 id: file_name.clone(),
    //                                 payload: payload.clone(),
    //                             })
    //                             .unwrap();
    //                     }
    //                 }
    //         }

    //         on_event
    //             .send(AnalysEvent::End {
    //                 id: file_name,
    //                 payload: payload.clone(),
    //                 timestamp: SystemTime::now(),
    //             })
    //             .unwrap();
    //     }

    //     on_event
    //         .send(AnalysEvent::Progress {
    //             progress: 100.0,
    //             timestamp: SystemTime::now(),
    //         })
    //         .unwrap();
    // });

    // Ok(())
// }

#[tauri::command]
pub fn selected_path(path: String, state: tauri::State<Mutex<AppState>>) {
    let mut app = state.lock().unwrap();
    app.path = Some(path);
}
