use serde::Serialize;
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use rusqlite::{params, Connection};
use std::sync::Mutex;
use once_cell::sync::Lazy;
use tempfile::NamedTempFile;

static DB_PATH: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

#[derive(Serialize, Clone)]
pub struct FileInfo {
    pub name: String,
    pub size_bytes: i64,
    pub size_str: String,
    pub parent_path: String,
}

#[derive(Serialize, Clone)]
pub struct DirInfo {
    pub path: String,
    pub size_bytes: i64,
    pub size_str: String,
}

#[derive(Serialize)]
pub struct AnalysisSummary {
    pub total_size_bytes: i64,
    pub total_dirs: i64,
    pub total_files: i64,
    pub root_path: String,
}

fn parse_size(size_str: &str) -> i64 {
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

    (val * multiplier) as i64
}

#[tauri::command]
async fn parse_report(report_path: String) -> Result<AnalysisSummary, String> {
    let path_obj = Path::new(&report_path);
    if !path_obj.exists() {
        return Err(format!("Arquivo nao encontrado: {}", report_path));
    }

    let file = File::open(path_obj).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);

    let temp_db = NamedTempFile::new().map_err(|e| e.to_string())?;
    let (file_handle, db_path) = temp_db.keep().map_err(|e| e.to_string())?;
    drop(file_handle);
    
    let db_path_str = db_path.to_str().unwrap().to_string();
    
    {
        let mut conn = Connection::open(&db_path_str).map_err(|e| e.to_string())?;
        
        conn.execute_batch("
            PRAGMA journal_mode = OFF;
            PRAGMA synchronous = OFF;
            PRAGMA cache_size = 100000;
            PRAGMA locking_mode = EXCLUSIVE;
            PRAGMA temp_store = MEMORY;
        ").map_err(|e| e.to_string())?;

        conn.execute("CREATE TABLE directories (path TEXT PRIMARY KEY, size_bytes INTEGER, size_str TEXT)", []).map_err(|e| e.to_string())?;
        conn.execute("CREATE TABLE files (name TEXT, size_bytes INTEGER, size_str TEXT, parent_path TEXT)", []).map_err(|e| e.to_string())?;

        let mut current_dir_path: Option<String> = None;
        let mut tx = conn.transaction().map_err(|e| e.to_string())?;
        let mut count = 0;

        for line in reader.lines() {
            let line = line.map_err(|e| e.to_string())?;
            if line.trim().is_empty() { continue; }

            if !line.starts_with("  [") {
                let parts: Vec<&str> = line.rsplitn(2, " [").collect();
                if parts.len() == 2 {
                    let size_str = parts[0].trim_end_matches(']');
                    let path = parts[1].trim();
                    let size_bytes = parse_size(size_str);

                    let _ = tx.execute("INSERT OR REPLACE INTO directories (path, size_bytes, size_str) VALUES (?, ?, ?)", 
                        params![path, size_bytes, size_str]);
                    
                    current_dir_path = Some(path.to_string());
                }
            } else if let Some(ref parent) = current_dir_path {
                let parts: Vec<&str> = line.trim().splitn(2, ']').collect();
                if parts.len() == 2 {
                    let size_str = parts[0].trim_start_matches('[').trim();
                    let name = parts[1].trim();
                    let size_bytes = parse_size(size_str);

                    let _ = tx.execute("INSERT INTO files (name, size_bytes, size_str, parent_path) VALUES (?, ?, ?, ?)", 
                        params![name, size_bytes, size_str, parent]);
                }
            }

            count += 1;
            if count % 50000 == 0 {
                tx.commit().map_err(|e| e.to_string())?;
                tx = conn.transaction().map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;

        conn.execute("CREATE INDEX idx_files_parent ON files (parent_path)", []).map_err(|e| e.to_string())?;
        conn.execute("CREATE INDEX idx_files_size ON files (size_bytes DESC)", []).map_err(|e| e.to_string())?;
        conn.execute("CREATE INDEX idx_dirs_path ON directories (path)", []).map_err(|e| e.to_string())?;
    }

    *DB_PATH.lock().unwrap() = Some(db_path_str.clone());

    let conn = Connection::open(&db_path_str).map_err(|e| e.to_string())?;
    
    let total_dirs: i64 = conn.query_row("SELECT COUNT(*) FROM directories", [], |r| r.get(0)).unwrap_or(0);
    let total_files: i64 = conn.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0)).unwrap_or(0);
    
    let (root_path, total_size_bytes): (String, i64) = conn.query_row(
        "SELECT path, size_bytes FROM directories ORDER BY length(path) ASC LIMIT 1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?))
    ).map_err(|e| e.to_string())?;

    Ok(AnalysisSummary {
        total_size_bytes,
        total_dirs,
        total_files,
        root_path,
    })
}

#[tauri::command]
async fn get_dir_content(path: String) -> Result<(Vec<DirInfo>, Vec<FileInfo>), String> {
    let db_opt = DB_PATH.lock().unwrap();
    let db_path = db_opt.as_ref().ok_or("Nenhum relatorio carregado")?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt_dirs = conn.prepare("
        SELECT path, size_bytes, size_str 
        FROM directories 
        WHERE path LIKE ? || '\\%' 
        AND path NOT LIKE ? || '\\%\\%'
    ").map_err(|e| e.to_string())?;
    
    let dir_iter = stmt_dirs.query_map(params![path, path], |row| {
        Ok(DirInfo {
            path: row.get(0)?,
            size_bytes: row.get(1)?,
            size_str: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut dirs = Vec::new();
    for dir in dir_iter {
        dirs.push(dir.map_err(|e| e.to_string())?);
    }

    let mut stmt_files = conn.prepare("
        SELECT name, size_bytes, size_str, parent_path 
        FROM files 
        WHERE parent_path = ?
    ").map_err(|e| e.to_string())?;

    let file_iter = stmt_files.query_map(params![path], |row| {
        Ok(FileInfo {
            name: row.get(0)?,
            size_bytes: row.get(1)?,
            size_str: row.get(2)?,
            parent_path: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut files = Vec::new();
    for file in file_iter {
        files.push(file.map_err(|e| e.to_string())?);
    }

    Ok((dirs, files))
}

#[tauri::command]
async fn search_files(term: String, limit: i64) -> Result<Vec<FileInfo>, String> {
    let db_opt = DB_PATH.lock().unwrap();
    let db_path = db_opt.as_ref().ok_or("Nenhum relatorio carregado")?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("
        SELECT name, size_bytes, size_str, parent_path 
        FROM files 
        WHERE name LIKE ? OR parent_path LIKE ?
        ORDER BY size_bytes DESC 
        LIMIT ?
    ").map_err(|e| e.to_string())?;

    let pattern = format!("%{}%", term);
    let file_iter = stmt.query_map(params![pattern, pattern, limit], |row| {
        Ok(FileInfo {
            name: row.get(0)?,
            size_bytes: row.get(1)?,
            size_str: row.get(2)?,
            parent_path: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut files = Vec::new();
    for file in file_iter {
        files.push(file.map_err(|e| e.to_string())?);
    }
    Ok(files)
}

#[tauri::command]
async fn get_top_files(limit: i64) -> Result<Vec<FileInfo>, String> {
    let db_opt = DB_PATH.lock().unwrap();
    let db_path = db_opt.as_ref().ok_or("Nenhum relatorio carregado")?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("
        SELECT name, size_bytes, size_str, parent_path 
        FROM files 
        ORDER BY size_bytes DESC 
        LIMIT ?
    ").map_err(|e| e.to_string())?;

    let file_iter = stmt.query_map(params![limit], |row| {
        Ok(FileInfo {
            name: row.get(0)?,
            size_bytes: row.get(1)?,
            size_str: row.get(2)?,
            parent_path: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut files = Vec::new();
    for file in file_iter {
        files.push(file.map_err(|e| e.to_string())?);
    }
    Ok(files)
}

#[tauri::command]
async fn save_discard_list(path: String, content: Vec<String>) -> Result<(), String> {
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
        .invoke_handler(tauri::generate_handler![
            parse_report, 
            get_dir_content, 
            get_top_files, 
            search_files,
            save_discard_list
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}