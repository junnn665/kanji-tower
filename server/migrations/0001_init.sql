-- ランキングの記録
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  strokes INTEGER NOT NULL,
  height INTEGER NOT NULL,
  count INTEGER NOT NULL,
  play_ms INTEGER NOT NULL,
  drops INTEGER NOT NULL,
  device_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scores_strokes ON scores (strokes DESC, height DESC, count DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_scores_height ON scores (height DESC, strokes DESC, count DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_scores_count ON scores (count DESC, strokes DESC, height DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_scores_device ON scores (device_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_scores_created ON scores (created_at);
