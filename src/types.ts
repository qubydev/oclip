export type MediaKind = 'image' | 'video' | 'audio';
export type ClipKind = MediaKind | 'text';
export type TrackKind = 'video' | 'audio' | 'text';
export interface Asset {
  id: string; name: string; kind: MediaKind; url: string; frames: number;
  path?: string; bundled?: string; width?: number; height?: number;
}
export interface Clip {
  id: string; assetId: string | null; kind: ClipKind; name: string;
  start: number; length: number; in: number; x: number; y: number;
  scale: number; opacity: number; volume: number; text: string;
  fontSize: number; color: string; muted?: boolean; audioFor?: string;
  fadeIn?: number; fadeOut?: number; textWidth?: number; textHeight?: number;
}
export interface Track {
  id: string; kind: TrackKind; name: string; icon: string;
  enabled: boolean; locked: boolean; muted?: boolean; clips: Clip[];
}
export interface Project {
  version: 1; name: string; width: number; height: number; color: string;
  assets: Asset[]; tracks: Track[];
}
export interface ClipContext {clip: Clip; track: Track; asset?: Asset}
export interface Placement {edit: Clip; track?: Track; newIndex: number; kind: TrackKind}
export interface ClipGroup {trackId: string; kind: TrackKind; clips: Clip[]}
export interface ClipMove {clip: Clip; track: Track}
