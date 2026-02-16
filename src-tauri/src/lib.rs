use serde::Serialize;
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use rusqlite::{params, Connection};
use std::sync::Mutex;
use once_cell::sync::Lazy;
use tempfile::NamedTempFile;
use std::sync::mpsc;
use std::thread;
use tauri::{Emitter, Window};

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

#[derive(Serialize, Clone)]
struct ProgressPayload {
    count: i64,
    status: String,
}

fn parse_size(size_str: &str) -> i64 {
    let s = size_str.trim();
    if s.is_empty() { return 0; }
    let unit_start = s.find(|c: char| c.is_alphabetic()).unwrap_or(s.len());
    let (num_part, unit_part) = s.split_at(unit_start);
    let val: f64 = if num_part.contains(',') {
        num_part.replace(',', ".").trim().parse().unwrap_or(0.0)
    } else {
        num_part.trim().parse().unwrap_or(0.0)
    };
    let multiplier = match unit_part.trim().to_uppercase().as_str() {
        "TB" | "T" => 1099511627776.0,
        "GB" | "G" => 1073741824.0,
        "MB" | "M" => 1048576.0,
        "KB" | "K" => 1024.0,
        _ => 1.0,
    };
    (val * multiplier) as i64
}

enum ParseItem {
    Directory(String, i64, String),
    File(String, i64, String, String),
}

#[tauri::command]
 async fn parse_report(window: Window, report_path: String) -> Result<AnalysisSummary, String> {
    let path_obj = Path::new(&report_path);
    if !path_obj.exists() {
        return Err(format!("Arquivo nao encontrado: {}", report_path));
    }

    let temp_db = NamedTempFile::new().map_err(|e| e.to_string())?;
    let (file_handle, db_path) = temp_db.keep().map_err(|e| e.to_string())?;
    drop(file_handle);
    let db_path_str = db_path.to_str().unwrap().to_string();

    let (tx_chan, rx_chan) = mpsc::sync_channel::<Vec<ParseItem>>(100);

    let report_path_clone = report_path.clone();
    let window_clone = window.clone();
    
    thread::spawn(move || {
        let file = File::open(report_path_clone).expect("Falha ao abrir arquivo");
        let mut reader = BufReader::with_capacity(1024 * 1024, file);
        let mut line = String::with_capacity(512);
        let mut current_dir: Option<String> = None;
        let mut batch = Vec::with_capacity(10000);
        let mut total_count = 0;

        while reader.read_line(&mut line).unwrap_or(0) > 0 {
            if line.trim().is_empty() {
                line.clear();
                continue;
            }

            if !line.starts_with("  [") {
                if let Some(pos) = line.rfind(" [") {
                    let path = line[..pos].trim().to_string();
                    let size_part = line[pos + 2..].trim_end_matches(|c| c == ']' || c == '\n' || c == '\r');
                    let size_bytes = parse_size(size_part);
                    batch.push(ParseItem::Directory(path.clone(), size_bytes, size_part.to_string()));
                    current_dir = Some(path);
                }
            } else if let Some(ref parent) = current_dir {
                if let Some(end_size_pos) = line.find(']') {
                    let size_part = line[3..end_size_pos].trim();
                    let name = line[end_size_pos + 1..].trim();
                    let size_bytes = parse_size(size_part);
                    batch.push(ParseItem::File(name.to_string(), size_bytes, size_part.to_string(), parent.clone()));
                }
            }

            total_count += 1;
            if total_count % 100000 == 0 {
                let _ = window_clone.emit("processing-progress", ProgressPayload { 
                    count: total_count, 
                    status: "Lendo e processando texto...".to_string() 
                });
            }

            if batch.len() >= 10000 {
                let to_send = std::mem::replace(&mut batch, Vec::with_capacity(10000));
                if tx_chan.send(to_send).is_err() { return; }
            }
            line.clear();
        }
        let _ = tx_chan.send(batch);
    });

    let db_path_for_consumer = db_path_str.clone();
    let window_for_consumer = window.clone();
    let consumer_handle = thread::spawn(move || -> Result<(), String> {
        let mut conn = Connection::open(&db_path_for_consumer).map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA cache_size=200000; PRAGMA locking_mode=EXCLUSIVE; PRAGMA temp_store=MEMORY;")
            .map_err(|e| e.to_string())?;

        conn.execute("CREATE TABLE directories (path TEXT PRIMARY KEY, size_bytes INTEGER, size_str TEXT)", []).map_err(|e| e.to_string())?;
        conn.execute("CREATE TABLE files (name TEXT, size_bytes INTEGER, size_str TEXT, parent_path TEXT)", []).map_err(|e| e.to_string())?;

        while let Ok(batch) = rx_chan.recv() {
            let tx = conn.transaction().map_err(|e| e.to_string())?;
            {
                let mut stmt_dir = tx.prepare("INSERT OR REPLACE INTO directories (path, size_bytes, size_str) VALUES (?, ?, ?)").map_err(|e| e.to_string())?;
                let mut stmt_file = tx.prepare("INSERT INTO files (name, size_bytes, size_str, parent_path) VALUES (?, ?, ?, ?)").map_err(|e| e.to_string())?;
                for item in batch {
                    match item {
                        ParseItem::Directory(p, s_b, s_s) => { let _ = stmt_dir.execute(params![p, s_b, s_s]); }
                        ParseItem::File(n, s_b, s_s, p) => { let _ = stmt_file.execute(params![n, s_b, s_s, p]); }
                    }
                }
            }
            tx.commit().map_err(|e| e.to_string())?;
        }

        let _ = window_for_consumer.emit("processing-progress", ProgressPayload { count: -1, status: "Criando índices de busca...".to_string() });
        conn.execute("CREATE INDEX idx_files_parent ON files (parent_path)", []).map_err(|e| e.to_string())?;
        conn.execute("CREATE INDEX idx_files_size ON files (size_bytes DESC)", []).map_err(|e| e.to_string())?;
        conn.execute("CREATE INDEX idx_dirs_path ON directories (path)", []).map_err(|e| e.to_string())?;
        Ok(())
    });

    consumer_handle.join().map_err(|_| "Erro ao sincronizar")??;
    *DB_PATH.lock().unwrap() = Some(db_path_str.clone());

    let conn = Connection::open(&db_path_str).map_err(|e| e.to_string())?;
    let total_dirs: i64 = conn.query_row("SELECT COUNT(*) FROM directories", [], |r| r.get(0)).unwrap_or(0);
    let total_files: i64 = conn.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0)).unwrap_or(0);
    let (root_path, total_size_bytes): (String, i64) = conn.query_row(
        "SELECT path, size_bytes FROM directories ORDER BY length(path) ASC LIMIT 1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?))
    ).map_err(|e| e.to_string())?;

    Ok(AnalysisSummary { total_size_bytes, total_dirs, total_files, root_path })
}

#[tauri::command]
async fn get_dir_content(path: String) -> Result<(Vec<DirInfo>, Vec<FileInfo>), String> {
    let db_opt = DB_PATH.lock().unwrap();
    let db_path = db_opt.as_ref().ok_or("Nenhum relatorio carregado")?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let mut stmt_dirs = conn.prepare("SELECT path, size_bytes, size_str FROM directories WHERE path LIKE ? || '\\%' AND path NOT LIKE ? || '\\%\\%'").map_err(|e| e.to_string())?;
    let dir_iter = stmt_dirs.query_map(params![path, path], |row| Ok(DirInfo { path: row.get(0)?, size_bytes: row.get(1)?, size_str: row.get(2)? })).map_err(|e| e.to_string())?;
    let mut dirs = Vec::new();
    for dir in dir_iter { dirs.push(dir.map_err(|e| e.to_string())?); }
    let mut stmt_files = conn.prepare("SELECT name, size_bytes, size_str, parent_path FROM files WHERE parent_path = ?").map_err(|e| e.to_string())?;
    let file_iter = stmt_files.query_map(params![path], |row| Ok(FileInfo { name: row.get(0)?, size_bytes: row.get(1)?, size_str: row.get(2)?, parent_path: row.get(3)? })).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    for file in file_iter { files.push(file.map_err(|e| e.to_string())?); }
    Ok((dirs, files))
}

#[tauri::command]
async fn search_files(term: String, limit: i64) -> Result<Vec<FileInfo>, String> {
    let db_opt = DB_PATH.lock().unwrap();
    let db_path = db_opt.as_ref().ok_or("Nenhum relatorio carregado")?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT name, size_bytes, size_str, parent_path FROM files WHERE name LIKE ? OR parent_path LIKE ? ORDER BY size_bytes DESC LIMIT ?").map_err(|e| e.to_string())?;
    let pattern = format!("%{}%", term);
    let file_iter = stmt.query_map(params![pattern, pattern, limit], |row| Ok(FileInfo { name: row.get(0)?, size_bytes: row.get(1)?, size_str: row.get(2)?, parent_path: row.get(3)? })).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    for file in file_iter { files.push(file.map_err(|e| e.to_string())?); }
    Ok(files)
}

#[tauri::command]
async fn get_top_files(limit: i64) -> Result<Vec<FileInfo>, String> {
    let db_opt = DB_PATH.lock().unwrap();
    let db_path = db_opt.as_ref().ok_or("Nenhum relatorio carregado")?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT name, size_bytes, size_str, parent_path FROM files ORDER BY size_bytes DESC LIMIT ?").map_err(|e| e.to_string())?;
    let file_iter = stmt.query_map(params![limit], |row| Ok(FileInfo { name: row.get(0)?, size_bytes: row.get(1)?, size_str: row.get(2)?, parent_path: row.get(3)? })).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    for file in file_iter { files.push(file.map_err(|e| e.to_string())?); }
    Ok(files)
}

#[tauri::command]
 async fn save_discard_list(path: String, content: Vec<String>) -> Result<(), String> {
    let mut file = File::create(Path::new(&path)).map_err(|e| e.to_string())?;
    for line in content { writeln!(file, "{}", line).map_err(|e| e.to_string())?; }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![parse_report, get_dir_content, get_top_files, search_files, save_discard_list])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}