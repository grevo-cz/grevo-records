export interface MediaDevice {
  deviceId: string;
  label: string;
}

export interface StoredRecording {
  id: string;
  name: string;
  createdAt: number;
  size: number;
  mimeType: string;
  durationMs: number;
  blob: Blob;
  /** CDN URL set after a successful Bunny upload. */
  uploadedUrl?: string;
  uploadedAt?: number;
}
