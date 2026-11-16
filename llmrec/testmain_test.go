package llmrec

import (
	"os"
	"testing"

	"github.com/whyujjwal/superartex/db"
)

// Run against this package's own database (db.SuffixTestDatabase, #80): the
// recorder tests require an isolated SUPERARTEX_PG_DSN, and the suffix gives them
// one even inside a full parallel ./... run.
func TestMain(m *testing.M) {
	db.SuffixTestDatabase("llmrec")
	os.Exit(m.Run())
}
