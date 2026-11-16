package notify

import "testing"

func TestDiscordValidate(t *testing.T) {
	c := discordChannel{}
	if err := c.Validate(map[string]any{}); err == nil {
		t.Fatal("empty config must fail")
	}
	if err := c.Validate(map[string]any{"webhook_url": "http://discord.com/api/webhooks/1/x"}); err == nil {
		t.Fatal("plain http must be rejected")
	}
	if err := c.Validate(map[string]any{"webhook_url": "https://evil.example.com/api/webhooks/1/x"}); err == nil {
		t.Fatal("foreign host must be rejected")
	}
	if err := c.Validate(map[string]any{"webhook_url": "https://discord.com/not-a-webhook"}); err == nil {
		t.Fatal("missing /api/webhooks/ path must be rejected")
	}
	if err := c.Validate(map[string]any{"webhook_url": "https://discord.com/api/webhooks/123/token"}); err != nil {
		t.Fatalf("valid URL rejected: %v", err)
	}
}

func TestDiscordTextPacks(t *testing.T) {
	m := Message{Batch: true, Items: []Item{
		{FindingID: 1, Name: "SQLi", Severity: "high", Assets: []string{"a.example.com"}},
		{FindingID: 2, Name: "XSS", Severity: "medium"},
	}}
	text, kept := discordText(m)
	if kept != 2 || !contains(text, "SQLi") || !contains(text, "XSS") {
		t.Fatalf("kept=%d text=%q", kept, text)
	}
}

func TestSlackValidate(t *testing.T) {
	c := slackChannel{}
	if err := c.Validate(map[string]any{}); err == nil {
		t.Fatal("empty config must fail")
	}
	if err := c.Validate(map[string]any{"webhook_url": "https://discord.com/api/webhooks/1/x"}); err == nil {
		t.Fatal("discord URL must be rejected")
	}
	if err := c.Validate(map[string]any{"webhook_url": "https://hooks.slack.com/services/T000/B000/xxx"}); err != nil {
		t.Fatalf("valid URL rejected: %v", err)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 || indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
