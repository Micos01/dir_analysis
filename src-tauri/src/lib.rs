use serde::Serialize;
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;

#[derive(Serialize, Clone)]
pub struct FileInfo {
    pub name: String,
    pub size_bytes: u64,
    pub size_str: String,
}

#[derive(Serialize, Clone)]
pub struct DirInfo {
    pub path: String,
    pub size_bytes: u64,
    pub size_str: String,
    pub files: Vec<FileInfo>,
}

#[derive(Serialize)]
pub struct AnalysisResult {
    pub directories: Vec<DirInfo>,
    pub total_size_bytes: u64,
}

fn parse_size(size_str: &str) -> u64 {
    let size_str = size_str.trim().to_uppercase();
    let mut num_str = String::new();
    let mut unit = String::new();

    for c in size_str.chars() {
        if c.is_digit(10) || c == '.' || c == ',' {
            let normalized_c = if c == ',' { '.' } else { c };
            num_str.push(normalized_c);
        } else if c.is_alphabetic() {
            unit.push(c);
        }
    }

    let val: f64 = num_str.parse().unwrap_or(0.0);
    let multiplier = match unit.as_str() {
        "TB" => 1024.0 * 1024.0 * 1024.0 * 1024.0,
        "GB" => 1024.0 * 1024.0 * 1024.0,
        "MB" => 1024.0 * 1024.0,
        "KB" => 1024.0,
        _ => 1.0,
    };

    (val * multiplier) as u64
}

#[tauri::command]
fn parse_report(path: String) -> Result<AnalysisResult, String> {
    let file = File::open(Path::new(&path)).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);

    let mut directories = Vec::new();
    let mut current_dir: Option<DirInfo> = None;

    for line in reader.lines() {
        let line = line.map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            continue;
        }

        if !line.starts_with("  [") {
            // It's a directory line: Path [Size]
            if let Some(dir) = current_dir.take() {
                directories.push(dir);
            }

            let parts: Vec<&str> = line.rsplitn(2, " [").collect();
            if parts.len() == 2 {
                let size_str = parts[0].trim_end_matches(']');
                let path = parts[1].trim();
                let size_bytes = parse_size(size_str);

                current_dir = Some(DirInfo {
                    path: path.to_string(),
                    size_bytes,
                    size_str: size_str.to_string(),
                    files: Vec::new(),
                });
            }
        } else {
            // It's a file line:   [Size] Name
            if let Some(ref mut dir) = current_dir {
                let parts: Vec<&str> = line.trim().splitn(2, ']').collect();
                if parts.len() == 2 {
                    let size_str = parts[0].trim_start_matches('[').trim();
                    let name = parts[1].trim();
                    let size_bytes = parse_size(size_str);

                    dir.files.push(FileInfo {
                        name: name.to_string(),
                        size_bytes,
                        size_str: size_str.to_string(),
                    });
                }
            }
        }
    }

    if let Some(dir) = current_dir {
        directories.push(dir);
    }

    // Calculate total size based on top-level directories
    let total_size_bytes = directories
        .iter()
        .filter(|d| {
            !directories.iter().any(|other| {
                d.path != other.path && d.path.starts_with(&format!("{}\\", other.path))
            })
        })
        .map(|d| d.size_bytes)
        .sum();

    Ok(AnalysisResult {
        directories,
        total_size_bytes,
    })
}

#[tauri::command]
fn save_discard_list(path: String, content: Vec<String>) -> Result<(), String> {
    let mut file = File::create(Path::new(&path)).map_err(|e| e.to_string())?;
    for line in content {
        writeln!(file, "{}", line).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![parse_report, save_discard_list])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}