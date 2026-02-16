export interface FileInfo {
  name: string;
  size_bytes: number;
  size_str: string;
  parent_path: string;
}

export interface DirInfo {
  path: string;
  size_bytes: number;
  size_str: string;
}

export interface AnalysisSummary {
  total_size_bytes: number;
  total_dirs: number;
  total_files: number;
  root_path: string;
}

export interface ProgressEvent {
  count: number;
  status: string;
}
