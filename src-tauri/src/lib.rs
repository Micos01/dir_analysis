use serde::Serialize;
use std::fs::File;
use std::io::{Write};
use std::path::Path;
use rusqlite::{params, Connection};
use std::sync::{Mutex, Arc};
use once_cell::sync::Lazy;
use tempfile::NamedTempFile;
use std::sync::mpsc;
use std::thread;
use tauri::{Emitter, Window};
use memchr::memchr;
use memmap2::Mmap;

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

fn parse_size_bytes(s: &[u8]) -> i64 {
    let s = s.trim_ascii();
    if s.is_empty() { return 0; }

    let mut num_val: f64 = 0.0;
    let mut decimal_place: f64 = 0.1;
    let mut in_decimal = false;
    let mut unit_idx = s.len();

    for (i, &b) in s.iter().enumerate() {
        match b {
            b'0'..=b'9' => {
                let digit = (b - b'0') as f64;
                if in_decimal {
                    num_val += digit * decimal_place;
                    decimal_place *= 0.1;
                } else {
                    num_val = num_val * 10.0 + digit;
                }
            }
            b'.' | b',' => {
                in_decimal = true;
            }
            _ if b.is_ascii_alphabetic() => {
                unit_idx = i;
                break;
            }
            _ => {}
        }
    }

    let unit = &s[unit_idx..].trim_ascii();
    let multiplier = if unit.eq_ignore_ascii_case(b"TB") || unit.eq_ignore_ascii_case(b"T") {
        1099511627776.0
    } else if unit.eq_ignore_ascii_case(b"GB") || unit.eq_ignore_ascii_case(b"G") {
        1073741824.0
    } else if unit.eq_ignore_ascii_case(b"MB") || unit.eq_ignore_ascii_case(b"M") {
        1048576.0
    } else if unit.eq_ignore_ascii_case(b"KB") || unit.eq_ignore_ascii_case(b"K") {
        1024.0
    } else {
        1.0
    };

    (num_val * multiplier) as i64
}

enum ParseItem {
    Directory(String, i64, String),
    File(String, i64, String, Arc<String>),
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
        let mmap = unsafe { Mmap::map(&file).expect("Falha no Memory Map") };
        let bytes = &mmap[..];
        
        let mut current_dir: Option<Arc<String>> = None;
        let mut batch = Vec::with_capacity(10000);
        let mut total_count = 0;
        let mut cursor = 0;

        while cursor < bytes.len() {
            let line_end = memchr(b'\n', &bytes[cursor..]).map(|i| cursor + i).unwrap_or(bytes.len());
            let line = &bytes[cursor..line_end];
            let trimmed = line.trim_ascii();

            if !trimmed.is_empty() {
                if !trimmed.starts_with(b"  [") {
                    if let Some(open_bracket) = line.iter().rposition(|&b| b == b'[') {
                        let path_bytes = line[..open_bracket].trim_ascii();
                        let size_bytes_part = line[open_bracket + 1..].trim_ascii_end();
                        let size_raw = if size_bytes_part.ends_with(b"]") { &size_bytes_part[..size_bytes_part.len()-1] } else { size_bytes_part };
                        
                        let path = String::from_utf8_lossy(path_bytes).into_owned();
                        let size_str = String::from_utf8_lossy(size_raw).into_owned();
                        let size_val = parse_size_bytes(size_raw);
                        
                        let path_arc = Arc::new(path.clone());
                        batch.push(ParseItem::Directory(path, size_val, size_str));
                        current_dir = Some(path_arc);
                    }
                } else if let Some(ref parent_arc) = current_dir {
                    if let Some(close_bracket) = line.iter().position(|&b| b == b']') {
                        let size_raw = &line[3..close_bracket].trim_ascii();
                        let name_raw = &line[close_bracket + 1..].trim_ascii();
                        
                        let name = String::from_utf8_lossy(name_raw).into_owned();
                        let size_str = String::from_utf8_lossy(size_raw).into_owned();
                        let size_val = parse_size_bytes(size_raw);
                        
                        batch.push(ParseItem::File(name, size_val, size_str, Arc::clone(parent_arc)));
                    }
                }

                total_count += 1;
                if total_count % 200000 == 0 {
                    let _ = window_clone.emit("processing-progress", ProgressPayload { 
                        count: total_count, 
                        status: format!("Lendo: {:.1} GB processados", cursor as f64 / 1e9) 
                    });
                }

                if batch.len() >= 10000 {
                    let to_send = std::mem::replace(&mut batch, Vec::with_capacity(10000));
                    if tx_chan.send(to_send).is_err() { return; }
                }
            }
            cursor = line_end + 1;
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
                        ParseItem::File(n, s_b, s_s, p_arc) => { let _ = stmt_file.execute(params![n, s_b, s_s, *p_arc]); }
                    }
                }
            }
            tx.commit().map_err(|e| e.to_string())?;
        }

        let _ = window_for_consumer.emit("processing-progress", ProgressPayload { count: -1, status: "Finalizando banco de dados...".to_string() });
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