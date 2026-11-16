import type {Asset, Project} from './types.js';
export interface ImportedMedia {name: string; path: string; kind: Asset['kind']; url: string}
export interface ProjectRecord {id: string; name: string; thumbnail?: string; modified: number}
export interface OpenProject {file: string | null; project: Project; managed: boolean}
export interface ViewState {frame?: number; selected?: string; zoom?: number; [key: string]: unknown}
export interface DesktopApi {
  platform: string;
  onCloseRequest(callback: () => void): void;
  onDevReload(callback: () => void): void;
  reloadForDevelopment(): Promise<void>;
  resolveClose(discard: boolean): Promise<void>;
  importMedia(audioOnly?: boolean): Promise<(ImportedMedia | {error: string})[]>;
  openProject(): Promise<OpenProject | null>;
  saveProject(project: Project, thumbnail?: string): Promise<string>;
  listProjects(): Promise<ProjectRecord[]>;
  createProject(project: Project): Promise<{id: string; file: string}>;
  openManagedProject(id: string): Promise<OpenProject>;
  duplicateProject(id: string): Promise<void>;
  collectProject(id: string): Promise<{folder: string; file: string} | null>;
  deleteProject(id: string): Promise<void>;
  setProjectPath(file: string | null): Promise<void>;
  checkpoint(project: Project | null, view?: ViewState): Promise<void>;
  recover(): Promise<(OpenProject & {view?: ViewState}) | null>;
  relink(name: string): Promise<ImportedMedia | null>;
  relinkFolder(files: {id: string; file: string}[]): Promise<{id: string; replacement: ImportedMedia}[] | null>;
  exportFolder(): Promise<string>;
  chooseExportFolder(): Promise<string | null>;
  beginExport(name: string, extension: string): Promise<string>;
  exportChunk(id: string, bytes: Uint8Array): Promise<void>;
  finishExport(id: string, commit: boolean): Promise<string | void>;
}
declare global {
  interface Window {desktop?: DesktopApi}
  interface HTMLVideoElement {
    audioTracks?: {length: number};
    captureStream?(): MediaStream;
    mozCaptureStream?(): MediaStream;
  }
}
