// Detect silent ranges from a downsampled peak array (output of useWaveform).
// Returns time ranges in seconds where the audio is below `threshold` for at
// least `minDurationSec`. Useful for suggesting cuts in screen recordings.

export interface SilentRange {
  start: number;
  end: number;
}

interface Options {
  /** Peak amplitude (0..1) below which a sample is "quiet". */
  threshold?: number;
  /** Minimum duration in seconds for a range to count. */
  minDurationSec?: number;
  /** Padding (sec) to leave at the start of each detected gap (keep some breath). */
  padStart?: number;
  /** Padding (sec) to leave at the end. */
  padEnd?: number;
}

export function detectSilentRanges(
  peaks: number[],
  totalDurationSec: number,
  opts: Options = {}
): SilentRange[] {
  const {
    threshold = 0.07,
    minDurationSec = 0.6,
    padStart = 0.15,
    padEnd = 0.15,
  } = opts;

  if (peaks.length < 2 || totalDurationSec <= 0) return [];

  const stepSec = totalDurationSec / peaks.length;
  const ranges: SilentRange[] = [];
  let runStart: number | null = null;

  for (let i = 0; i < peaks.length; i++) {
    const quiet = peaks[i] < threshold;
    if (quiet && runStart === null) {
      runStart = i;
    } else if (!quiet && runStart !== null) {
      const startSec = runStart * stepSec;
      const endSec = i * stepSec;
      if (endSec - startSec >= minDurationSec) {
        ranges.push({
          start: startSec + padStart,
          end: Math.max(startSec + padStart + 0.1, endSec - padEnd),
        });
      }
      runStart = null;
    }
  }
  // Trailing silence
  if (runStart !== null) {
    const startSec = runStart * stepSec;
    const endSec = totalDurationSec;
    if (endSec - startSec >= minDurationSec) {
      ranges.push({
        start: startSec + padStart,
        end: Math.max(startSec + padStart + 0.1, endSec - padEnd),
      });
    }
  }

  // Filter out invalid / too short after padding
  return ranges.filter((r) => r.end - r.start >= 0.2);
}
