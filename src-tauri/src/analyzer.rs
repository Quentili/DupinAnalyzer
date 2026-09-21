use std::{
    fmt::Write,
    fs::{read_dir, File},
    io::{BufRead, BufReader},
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread::spawn,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use rayon::prelude::*;
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
}

#[tauri::command]
pub fn analys(
    state: tauri::State<Mutex<AppState>>,
    on_event: Channel<AnalysEvent>,
) -> Result<(), String> {
    let (dir_path, configs) = {
        let app = state.lock().unwrap();
        let path = match &app.paths {
            Some(path) => path.clone(),
            None => return Err("File not found".to_string()),
        };

        let configs = app.configs.clone();
        (path, configs)
    };

    let (files_process, total_bytes) = collect_log_files(&dir_path)?;

    if total_bytes == 0 {
        return Ok(());
    }

    let processed_bytes = Arc::new(AtomicU64::new(0));

    spawn(move || {
        files_process.par_iter().for_each(|file_path| {
            let file_name = file_path
                .metadata()
                .map_err(|e| e.to_string())
                .and_then(|meta| {
                    let mod_time = meta
                        .modified()
                        .map_err(|e| e.to_string())?
                        .duration_since(UNIX_EPOCH)
                        .map_err(|e| e.to_string())?
                        .as_secs();

                    Ok(format!("{{{}}}::{{{}}}", file_path.display(), mod_time))
                })
                .unwrap();

            let f = match File::open(&file_path) {
                Ok(file) => file,
                Err(_) => return,
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
        });

        on_event
            .send(AnalysEvent::Progress {
                progress: 100.0,
                timestamp: SystemTime::now(),
            })
            .unwrap();
    });

    Ok(())
}

fn collect_log_files(dir_paths: &Vec<String>) -> Result<(Vec<PathBuf>, u64), String> {
    let mut files = Vec::new();
    let mut total_bytes = 0u64;

    for dir_path in dir_paths {
        for entry in read_dir(dir_path).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_file()
                && matches!(
                    path.extension().and_then(|e| e.to_str()),
                    Some("txt" | "log")
                )
            {
                total_bytes += entry.metadata().map_err(|e| e.to_string())?.len();
                files.push(path);
            }
        }
    }

    Ok((files, total_bytes))
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

                let mut buffer: String = String::new();

                for (i, group) in caps.iter().skip(skip_count).enumerate() {
                    if let Some(mat) = group {
                        let group_name = config.groups.get(i).unwrap_or(&config.name);

                        if i < (config.groups.len() - skip_count) {
                            write!(&mut buffer, "{{{}::{}}}::", group_name, mat.as_str()).unwrap();
                        } else {
                            write!(&mut buffer, "{{{}::{}}}", group_name, mat.as_str()).unwrap();
                            write!(
                                &mut buffer,
                                "{{{}::{}::{}}}",
                                config.name, config.color, line_index
                            )
                            .unwrap();

                            payload.push(buffer);
                            buffer = String::new();
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
pub fn research(
    state: tauri::State<Mutex<AppState>>,
    query: String,
    on_event: Channel<AnalysEvent>,
) -> Result<(), String> {
    let dir_path = {
        let app = state.lock().unwrap();
        let path = match &app.paths {
            Some(path) => path.clone(),
            None => return Err("File not found".to_string()),
        };

        path
    };

    let (files_process, total_bytes) = collect_log_files(&dir_path)?;

    if total_bytes == 0 {
        return Ok(());
    }

    let processed_bytes = Arc::new(AtomicU64::new(0));

    spawn(move || {
        let mut payload: Vec<String> = Vec::with_capacity(BATCH_SIZE);
        let mut last_emit = Instant::now();

        for file_path in files_process {
            let file_name = file_path
                .metadata()
                .map_err(|e| e.to_string())
                .and_then(|meta| {
                    let mod_time = meta
                        .modified()
                        .map_err(|e| e.to_string())?
                        .duration_since(UNIX_EPOCH)
                        .map_err(|e| e.to_string())?
                        .as_secs();

                    Ok(format!("{{{}}}::{{{}}}", file_path.display(), mod_time))
                })
                .unwrap();

            let f = match File::open(&file_path) {
                Ok(file) => file,
                Err(_) => continue,
            };
            let reader = BufReader::new(f);

            on_event
                .send(AnalysEvent::Start {
                    id: file_name.clone(),
                    timestamp: SystemTime::now(),
                })
                .unwrap();

            let mut buffer = String::new();
            let mut file_byte_offset: u64 = 0;

            for (line_index, line) in reader.lines().flatten().into_iter().enumerate() {
                let line_bytes = line.len() as u64 + 1;
                let segment = file_byte_offset / 8192;

                let current_bytes =
                    processed_bytes.fetch_add(line_bytes, Ordering::Relaxed) + line_bytes;

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

                if line.contains(&query) {
                    write!(
                        &mut buffer,
                        "{{Line::{}}}{{Search::#88c0d0::{}::{}}}",
                        line, line_index, segment
                    )
                    .unwrap();
                    payload.push(std::mem::take(&mut buffer));
                }

                if payload.len() >= BATCH_SIZE {
                    on_event
                        .send(AnalysEvent::Batch {
                            id: file_name.clone(),
                            payload: std::mem::take(&mut payload),
                        })
                        .unwrap();
                }

                file_byte_offset += line_bytes;
            }

            on_event
                .send(AnalysEvent::End {
                    id: file_name,
                    payload: std::mem::take(&mut payload),
                    timestamp: SystemTime::now(),
                })
                .unwrap();
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

#[tauri::command]
pub fn selected_paths(paths: Vec<String>, state: tauri::State<Mutex<AppState>>) {
    let mut app = state.lock().unwrap();
    app.paths = Some(paths);
}
