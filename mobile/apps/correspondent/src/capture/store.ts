import * as FileSystem from "expo-file-system";
import * as SQLite from "expo-sqlite";
import type { EngineStore, PendingSegment, Track } from "@elongo/domain";

/**
 * The segment store: paths in SQLite, bytes on disk.
 *
 * THE ORDER OF OPERATIONS IS THE PRODUCT. A chunk is written to durable storage
 * *before* any network attempt, and the row is only deleted once the server has
 * acknowledged it. That single ordering is what converts "the moment is gone
 * forever" into "everything arrives, some of it late" — and it is why this is
 * SQLite and a file, not an in-memory array. The app will be killed mid-
 * ceremony: Android's Doze, a manufacturer's battery optimiser, or simply a
 * phone that runs out of RAM because someone opened WhatsApp.
 *
 * Never hold media in memory. A three-hour event at 800 kbps is a gigabyte.
 */

const DB_NAME = "elongo-capture.db";

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS segment (
  presence_id TEXT NOT NULL,
  track       TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  captured_at REAL NOT NULL,
  covers_sec  REAL NOT NULL,
  bytes       INTEGER NOT NULL,
  rung        INTEGER NOT NULL,
  path        TEXT NOT NULL,
  sha256      TEXT,
  sent_at     REAL,
  PRIMARY KEY (presence_id, track, seq)
);
CREATE INDEX IF NOT EXISTS segment_pending
  ON segment (presence_id, sent_at, captured_at);
`;

export type StoredSegment = PendingSegment & {
  readonly path: string;
  readonly sha256: string | null;
};

export class SqliteSegmentStore implements EngineStore {
  private readonly db: SQLite.SQLiteDatabase;
  private readonly presenceId: string;
  private readonly dir: string;
  /**
   * A synchronous mirror of the pending rows.
   *
   * The engine's tick is synchronous by design — it must not await the disk
   * while deciding what quality to encode — so the queue is held in memory and
   * SQLite is the durable copy behind it. The mirror is rebuilt from the
   * database on open, which is what makes a crash survivable.
   */
  private mirror: StoredSegment[] = [];

  private constructor(db: SQLite.SQLiteDatabase, presenceId: string, dir: string) {
    this.db = db;
    this.presenceId = presenceId;
    this.dir = dir;
  }

  static async open(presenceId: string): Promise<SqliteSegmentStore> {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(SCHEMA);
    const dir = `${FileSystem.documentDirectory}segments/${presenceId}/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const store = new SqliteSegmentStore(db, presenceId, dir);
    await store.reload();
    return store;
  }

  /** Rebuild the in-memory queue from disk. Called on open — i.e. after a crash. */
  async reload(): Promise<void> {
    const rows = await this.db.getAllAsync<{
      track: string;
      seq: number;
      captured_at: number;
      covers_sec: number;
      bytes: number;
      rung: number;
      path: string;
      sha256: string | null;
    }>(
      `SELECT track, seq, captured_at, covers_sec, bytes, rung, path, sha256
         FROM segment WHERE presence_id = ? AND sent_at IS NULL
         ORDER BY captured_at, seq`,
      this.presenceId,
    );
    this.mirror = rows.map((r) => ({
      track: r.track as Track,
      seq: r.seq,
      capturedAt: r.captured_at,
      coversSec: r.covers_sec,
      bytes: r.bytes,
      rung: r.rung,
      path: r.path,
      sha256: r.sha256,
    }));
  }

  path(track: Track, seq: number): string {
    return `${this.dir}${track}-${String(seq).padStart(6, "0")}.mp4`;
  }

  /**
   * Record a chunk that is already on disk.
   *
   * `capturedAt` is the start of the window the chunk *covers*, never the
   * moment it was handed over. Timestamping at delivery puts a twenty-minute
   * backfill at the wrong place in the recording; the browser client shipped
   * that way and left a permanent hole at the start of every event.
   */
  async record(segment: Omit<StoredSegment, "path"> & { path?: string }): Promise<StoredSegment> {
    const path = segment.path ?? this.path(segment.track, segment.seq);
    await this.db.runAsync(
      `INSERT OR REPLACE INTO segment
         (presence_id, track, seq, captured_at, covers_sec, bytes, rung, path, sha256, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      this.presenceId,
      segment.track,
      segment.seq,
      segment.capturedAt,
      segment.coversSec,
      segment.bytes,
      segment.rung,
      path,
      segment.sha256 ?? null,
    );
    const stored: StoredSegment = { ...segment, path };
    this.mirror.push(stored);
    return stored;
  }

  pending(): readonly StoredSegment[] {
    return this.mirror;
  }

  /**
   * The server has it. Drop it from the queue and free the file.
   *
   * Synchronous on the mirror, asynchronous on disk: the engine must be able to
   * stop offering a segment immediately, and a slow unlink must never hold up
   * the next tick.
   */
  acknowledge(track: Track, seq: number): void {
    const index = this.mirror.findIndex((s) => s.track === track && s.seq === seq);
    if (index === -1) return;
    const [segment] = this.mirror.splice(index, 1);
    void this.db
      .runAsync(
        `UPDATE segment SET sent_at = ? WHERE presence_id = ? AND track = ? AND seq = ?`,
        Date.now() / 1000,
        this.presenceId,
        track,
        seq,
      )
      .then(() => FileSystem.deleteAsync(segment.path, { idempotent: true }))
      .catch(() => {
        // A failed unlink costs disk, never content. The next open() sweeps it.
      });
  }

  /** Segments the server has already acknowledged, for a post-event sweep. */
  async sweepDelivered(): Promise<void> {
    await this.db.runAsync(
      `DELETE FROM segment WHERE presence_id = ? AND sent_at IS NOT NULL`,
      this.presenceId,
    );
  }

  async close(): Promise<void> {
    await this.db.closeAsync();
  }
}
