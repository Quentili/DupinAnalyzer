use std::{
    fs::File, io::{BufRead, BufReader}, mem::take, path::Path, sync::Mutex
};

use serde::Serialize;
use tar::Builder;
use tauri::ipc::Channel;
use zstd::Encoder;

use crate::AppState;

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
        has_more: bool,
    },
}

#[derive(Debug, thiserror::Error)]
pub enum ViewerError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("request error: {0}")]
    Request(#[from] reqwest::Error),
}

impl Serialize for ViewerError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[tauri::command]
pub fn open_log_at_line(
    page: usize,
    file_path: String,
    on_event: Channel<ViewerEvent>,
) -> Result<(), ViewerError> {
    let f = File::open(&file_path)?;
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
            has_more,
        })
        .unwrap();

    Ok(())
}

#[tauri::command]
pub async fn get_analyzed_logs(
    logs: Vec<String>,
    telegram_id: String,
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<(), ViewerError> {
    let client = {
        let app = state.lock().unwrap();
        let client = app.client.clone();

        client
    };

    let encoder = Encoder::new(Vec::new(), 3)?;
    let mut archive = Builder::new(encoder);

    for log in logs {
            let mut f = File::open(&log)?;

            archive.append_file(Path::new(&log).file_name().unwrap(), &mut f)?;
    }

    let encoder = archive.into_inner()?;
    let archive_bytes = encoder.finish()?;

    let _res = client
        .post(format!(
            "https://dupinanalyzer.onrender.com/api/report?user_id={}",
            telegram_id
        ))
        .body(archive_bytes)
        .send()
        .await?;

    Ok(())
}
