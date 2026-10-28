/** Types for the subset of the rclone remote control (rc) API that Alto uses. */

/** One entry from `operations/list` / `operations/stat` (lsjson format). */
export interface RcloneListItem {
  Path: string;
  Name: string;
  Size: number;
  MimeType?: string;
  ModTime: string;
  IsDir: boolean;
  Hashes?: Record<string, string>;
  ID?: string;
  OrigID?: string;
}

export interface RcloneListOptions {
  recurse?: boolean;
  noModTime?: boolean;
  showHash?: boolean;
  hashTypes?: string[];
  noMimeType?: boolean;
  dirsOnly?: boolean;
  filesOnly?: boolean;
  metadata?: boolean;
}

export interface RcloneVersion {
  version: string;
  decomposed: number[];
  isGit: boolean;
  isBeta: boolean;
  os: string;
  arch: string;
  goVersion: string;
  linking?: string;
  goTags?: string;
}

export interface RcloneFsInfo {
  Name: string;
  Root: string;
  String: string;
  /** Precision of modification times in nanoseconds. */
  Precision: number;
  Hashes: string[];
  Features: Record<string, boolean>;
}

export interface RcloneAbout {
  total?: number;
  used?: number;
  trashed?: number;
  other?: number;
  free?: number;
  objects?: number;
}

export interface RcloneJobStatus {
  id: number;
  group: string;
  finished: boolean;
  success: boolean;
  error: string;
  duration: number;
  startTime: string;
  endTime: string;
  output: unknown;
  progress?: unknown;
}

export interface RcloneTransferring {
  bytes: number;
  eta: number | null;
  group?: string;
  name: string;
  percentage: number;
  size: number;
  speed: number;
  speedAvg: number;
}

export interface RcloneStats {
  bytes: number;
  checks: number;
  deletes: number;
  elapsedTime: number;
  errors: number;
  eta: number | null;
  fatalError: boolean;
  lastError?: string;
  renames: number;
  speed: number;
  totalBytes: number;
  totalChecks: number;
  totalTransfers: number;
  transferTime: number;
  transfers: number;
  transferring?: RcloneTransferring[];
}

export interface RcloneOAuthStatus {
  status?: 'running' | 'stopped';
  authUrl?: string;
}

/** A provider (backend) as reported by `config/providers`. */
export interface RcloneProviderInfo {
  Name: string;
  Description: string;
  Prefix: string;
  Options: Array<{ Name: string; Help: string; Required?: boolean; IsPassword?: boolean }>;
}

export interface RcloneConfigCreateOptions {
  /** Passwords in `parameters` are plain text and need obscuring. */
  obscure?: boolean;
  noObscure?: boolean;
  nonInteractive?: boolean;
  continue?: boolean;
  all?: boolean;
  state?: string;
  result?: string;
}

/** Shape of the error body rclone returns for failed calls. */
export interface RcloneErrorBody {
  error: string;
  input?: unknown;
  path?: string;
  status?: number;
}
