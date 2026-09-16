use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{fs::read_to_string, sync::Mutex};
use thiserror::Error;

use crate::AppState;

#[derive(Serialize, Deserialize, Default)]
#[serde(tag = "type", rename_all = "camelCase")]
struct PatternConfig {
    name: String,
    pattern: String,
    groups: Vec<String>,
    color: String,
}

#[derive(Clone)]
pub struct CompiledPattern {
    pub name: String,
    pub regex: Regex,
    pub groups: Vec<String>,
    pub color: String,
}

#[derive(Error, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ConfigurationSyntaxError {
    #[error("Syntax error at index {index} ({title}): {description}")]
    InvalidSyntax {
        index: usize,
        title: String,
        description: String,
    },
}

fn validation_config(configs: &Vec<PatternConfig>) -> Result<(), ConfigurationSyntaxError> {
    for (index, config) in configs.iter().enumerate() {
        let regex = Regex::new(&config.pattern);

        if config.name.trim().is_empty() {
            return Err(ConfigurationSyntaxError::InvalidSyntax {
                index,
                title: "Empty Pattern Name".to_string(),
                description: format!(
                    "The 'name' field at index {} cannot be empty or contain only whitespace.",
                    index
                ),
            });
        }

        let re = match regex {
            Ok(compiled_regex) => compiled_regex,
            Err(err) => {
                return Err(ConfigurationSyntaxError::InvalidSyntax {
                    index,
                    title: "Invalid Regular Expression".to_string(),
                    description: format!(
                        "The string provided in the 'pattern' field is not a valid regex: {}",
                        err
                    ),
                });
            }
        };

        if (re.captures_len() - 1) < config.groups.len() {
            return Err(ConfigurationSyntaxError::InvalidSyntax {
        index,
        title: "Capture Group Mismatch".to_string(),
        description: format!(
            "The 'pattern' contains {} capture group(s), but {} name(s) were specified in 'groups'. The number of names cannot exceed the number of capture groups.",
            re.captures_len() - 1,
            config.groups.len()
        ),
    });
        }

        if !Regex::new(r"^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$")
            .unwrap()
            .is_match(&config.color)
        {
            return Err(ConfigurationSyntaxError::InvalidSyntax {
                index,
                title: "Invalid Color Format".to_string(),
                description: format!(
                    "The value '{}' in the 'color' field is not a valid HEX color. Please use the '#RRGGBB' or '#RGB' format.",
                    config.color
                ),
            });
        }
    }

    Ok(())
}

fn compiled_regex(
    config_patterns: &Vec<PatternConfig>,
) -> Result<Vec<CompiledPattern>, ConfigurationSyntaxError> {
    let mut contents = vec![];

    for config in config_patterns {
        let compiled_regex = Regex::new(&config.pattern).unwrap();

        let value = CompiledPattern {
            name: config.name.clone(),
            regex: compiled_regex,
            groups: config.groups.clone(),
            color: config.color.clone(),
        };

        contents.push(value);
    }

    Ok(contents)
}

#[tauri::command]
pub fn load_configuration(
    path: String,
    state: tauri::State<Mutex<AppState>>,
) -> Result<(), ConfigurationSyntaxError> {
    let mut app = state.lock().unwrap();

    let contents = read_to_string(&path).map_err(|e| ConfigurationSyntaxError::InvalidSyntax {
        index: 0,
        title: "Configuration File".to_string(),
        description: format!("Failed to read file '{}': {}", path, e),
    })?;

    let patterns: Vec<PatternConfig> =
        serde_json::from_str(&contents).map_err(|e| ConfigurationSyntaxError::InvalidSyntax {
            index: 0,
            title: "JSON Format".to_string(),
            description: format!("JSON parsing failed: {}", e),
        })?;

    validation_config(&patterns)?;
    app.configs = compiled_regex(&patterns)?;

    Ok(())
}
