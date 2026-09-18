use std::{
    fs::File,
    io::{BufRead, BufReader},
    mem::take,
};

use serde::Serialize;
use tauri::ipc::Channel;

const PAGE_SIZE: usize = 500;

#[derive(Clone, Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "event",
    content = "data"
)]
pub enum ViewerEvent {
    ReadFile {
        payload: Vec<String>,
        has_more: bool
    },
}

#[tauri::command]
pub fn open_log_at_line(
    page: usize,
    file_path: String,
    on_event: Channel<ViewerEvent>,
) -> Result<(), String> {
    let f = File::open(&file_path).map_err(|e| e.to_string())?;
    let reader: BufReader<File> = BufReader::new(f);
    let skip_count = PAGE_SIZE * page;

    let mut payload: Vec<String> = reader
        .lines()
        .skip(skip_count)
        .flatten()
        .take(PAGE_SIZE + 1)
        .collect();

    let has_more = payload.len() > PAGE_SIZE;

    if has_more {
        payload.pop();
    }

    on_event
        .send(ViewerEvent::ReadFile {
            payload: take(&mut payload),
            has_more
        })
        .unwrap();

    Ok(())
}