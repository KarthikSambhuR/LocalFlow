package main

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

var dbPath = "localflow.db"

var db *sql.DB

// initDB opens the SQLite database, creates the recordings and analytics tables, and performs migrations.
func initDB() error {
	cfg := loadConfig()
	dataDir := "."
	if cfg.DataFolder != "" && cfg.DataFolder != "Default" {
		dataDir = cfg.DataFolder
	}
	dbPath = filepath.Join(dataDir, "localflow.db")
	audioCacheDir = filepath.Join(dataDir, "audio_cache")

	if dataDir != "." {
		_ = os.MkdirAll(dataDir, 0755)
	}

	var err error
	db, err = sql.Open("sqlite", dbPath)
	if err != nil {
		return err
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS recordings (
			id            INTEGER PRIMARY KEY AUTOINCREMENT,
			filename      TEXT    NOT NULL,
			timestamp     DATETIME NOT NULL,
			duration_ms   INTEGER,
			transcription TEXT
		);
	`)
	if err != nil {
		return err
	}

	// Schema migration: add word_count column if it does not exist
	_, _ = db.Exec(`ALTER TABLE recordings ADD COLUMN word_count INTEGER DEFAULT 0;`)

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS analytics (
			id            INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp     DATETIME NOT NULL,
			duration_ms   INTEGER DEFAULT 0,
			word_count    INTEGER DEFAULT 0
		);
	`)
	if err != nil {
		return err
	}

	// Perform background migration for legacy records that have empty/0 word_count but non-empty transcription
	go migrateLegacyWordCounts()

	return nil
}

func migrateLegacyWordCounts() {
	if db == nil {
		return
	}
	rows, err := db.Query(`SELECT id, transcription FROM recordings WHERE (word_count = 0 OR word_count IS NULL) AND transcription IS NOT NULL AND transcription != ''`)
	if err != nil {
		return
	}
	defer rows.Close()

	type legacyRec struct {
		id   int
		text string
	}
	var legacy []legacyRec
	for rows.Next() {
		var r legacyRec
		if err := rows.Scan(&r.id, &r.text); err == nil {
			legacy = append(legacy, r)
		}
	}

	if len(legacy) > 0 {
		tx, err := db.Begin()
		if err == nil {
			stmt, err := tx.Prepare(`UPDATE recordings SET word_count = ? WHERE id = ?`)
			if err == nil {
				for _, r := range legacy {
					wc := len(strings.Fields(r.text))
					_, _ = stmt.Exec(wc, r.id)
				}
				_ = tx.Commit()
			} else {
				tx.Rollback()
			}
		}
	}

	// Populate analytics if empty
	var count int
	_ = db.QueryRow("SELECT COUNT(*) FROM analytics").Scan(&count)
	if count == 0 {
		_, _ = db.Exec("INSERT INTO analytics (timestamp, duration_ms, word_count) SELECT timestamp, duration_ms, word_count FROM recordings")
	}
}

// saveRecording inserts a completed recording into the database.
func saveRecording(filename string, timestamp time.Time, durationMs int64, transcription string) {
	if db == nil {
		return
	}
	wc := len(strings.Fields(transcription))
	tsStr := timestamp.UTC().Format(time.RFC3339)
	db.Exec(
		`INSERT INTO recordings (filename, timestamp, duration_ms, transcription, word_count) VALUES (?, ?, ?, ?, ?)`,
		filename, tsStr, durationMs, transcription, wc,
	)
	db.Exec(
		`INSERT INTO analytics (timestamp, duration_ms, word_count) VALUES (?, ?, ?)`,
		tsStr, durationMs, wc,
	)
}

// Recording represents a single transcript entry
type Recording struct {
	ID            int    `json:"id"`
	Filename      string `json:"filename"`
	Timestamp     string `json:"timestamp"`
	DurationMs    int64  `json:"duration_ms"`
	Transcription string `json:"transcription"`
	WordCount     int    `json:"word_count"`
}

// GetRecordings fetches all recordings from the database, sorted by latest first.
func GetRecordings() ([]Recording, error) {
	if db == nil {
		return nil, nil
	}
	rows, err := db.Query(`SELECT id, filename, timestamp, duration_ms, transcription, word_count FROM recordings ORDER BY timestamp DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Recording
	for rows.Next() {
		var r Recording
		if err := rows.Scan(&r.ID, &r.Filename, &r.Timestamp, &r.DurationMs, &r.Transcription, &r.WordCount); err != nil {
			continue
		}
		// If word count is 0 but we have transcription text, calculate it on the fly
		if r.WordCount == 0 && r.Transcription != "" {
			r.WordCount = len(strings.Fields(r.Transcription))
		}
		out = append(out, r)
	}
	return out, nil
}

// Analytics represents stats metadata saved permanently
type Analytics struct {
	Timestamp  string `json:"timestamp"`
	DurationMs int64  `json:"duration_ms"`
	WordCount  int    `json:"word_count"`
}

// GetAnalytics fetches all historical analytics entries
func GetAnalytics() ([]Analytics, error) {
	if db == nil {
		return nil, nil
	}
	rows, err := db.Query(`SELECT timestamp, duration_ms, word_count FROM analytics ORDER BY timestamp DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Analytics
	for rows.Next() {
		var a Analytics
		if err := rows.Scan(&a.Timestamp, &a.DurationMs, &a.WordCount); err != nil {
			continue
		}
		out = append(out, a)
	}
	return out, nil
}

// pruneRecordings completely deletes recordings and their physical WAV audio files older than retentionDays.
func pruneRecordings(retentionDays int) {
	if db == nil || retentionDays <= 0 {
		return
	}
	cutoff := time.Now().UTC().AddDate(0, 0, -retentionDays).Format(time.RFC3339)

	// 1. Get physical audio filenames to delete
	rows, err := db.Query(`SELECT filename FROM recordings WHERE timestamp < ? AND filename != ''`, cutoff)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var filename string
			if err := rows.Scan(&filename); err == nil && filename != "" {
				path := filepath.Join(audioCacheDir, filename)
				os.Remove(path)
			}
		}
	}

	// 2. Completely delete recording entries
	_, _ = db.Exec(`DELETE FROM recordings WHERE timestamp < ?`, cutoff)
}

// closeDB closes the database connection.
func closeDB() {
	if db != nil {
		db.Close()
	}
}
