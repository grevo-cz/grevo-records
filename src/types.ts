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
  /** Email of the user who created this recording. Used to scope library per user. */
  ownerEmail?: string;
  /** Player-page URL set after a successful Bunny Stream upload. */
  uploadedUrl?: string;
  uploadedAt?: number;
  /** Bunny Stream video GUID (for status polling + management). */
  streamGuid?: string;
  /**
   * Last known Bunny encode status: 'processing' right after upload,
   * 'ready' once transcoded (link is safe to send), 'error' on failure.
   */
  streamStatus?: 'processing' | 'ready' | 'error';
}
