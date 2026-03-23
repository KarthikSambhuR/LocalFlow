package main

import (
	"database/sql"
	"time"

	_ "modernc.org/sqlite"
)

const dbPath = "localflow.db"

var db *sql.DB

// initDB opens the SQLite database and creates the recordings table if it doesn't exist.
func initDB() error {
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
	return err
}

// saveRecording inserts a completed recording into the database.
// filename: the WAV cache file name (just the base name, not full path)
// timestamp: when recording was taken
// durationMs: length of the audio in milliseconds
// transcription: the text produced by Whisper (empty string if blank/failed)
func saveRecording(filename string, timestamp time.Time, durationMs int64, transcription string) {
	if db == nil {
		return
	}
	db.Exec(
		`INSERT INTO recordings (filename, timestamp, duration_ms, transcription) VALUES (?, ?, ?, ?)`,
		filename, timestamp.UTC().Format(time.RFC3339), durationMs, transcription,
	)
}

// Recording represents a single transcript entry
type Recording struct {
	ID            int    `json:"id"`
	Filename      string `json:"filename"`
	Timestamp     string `json:"timestamp"`
	DurationMs    int64  `json:"duration_ms"`
	Transcription string `json:"transcription"`
}

// GetRecordings fetches all recordings from the database, sorted by latest first.
func GetRecordings() ([]Recording, error) {
	if db == nil {
		return nil, nil
	}
	rows, err := db.Query(`SELECT id, filename, timestamp, duration_ms, transcription FROM recordings ORDER BY timestamp DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Recording
	for rows.Next() {
		var r Recording
		if err := rows.Scan(&r.ID, &r.Filename, &r.Timestamp, &r.DurationMs, &r.Transcription); err != nil {
			continue
		}
		out = append(out, r)
	}
	return out, nil
}

// closeDB closes the database connection (called on shutdown if needed).
func closeDB() {
	if db != nil {
		db.Close()
	}
}
