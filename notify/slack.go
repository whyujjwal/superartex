package notify

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
)

// slackTextLimit is Slack's practical per-message limit for incoming webhooks
// (the API documents 40k for chat.postMessage; incoming webhooks truncate
// display far earlier, so keep the headroom conservative).
const slackTextLimit = 35000

// slackChannel posts to a Slack incoming webhook (app Settings → Incoming
// Webhooks). The URL carries the webhook credential, same model as WeCom/Discord.
type slackChannel struct{}

func (slackChannel) Kind() string { return KindSlack }

// Slack publishes no per-webhook rate limit; 0 = no default cap.
func (slackChannel) DefaultRatePerMin() int { return 0 }

func (slackChannel) SecretKeys() []string      { return []string{"webhook_url"} }
func (slackChannel) DestinationKeys() []string { return []string{"webhook_url"} }

func (c slackChannel) Validate(cfg map[string]any) error {
	raw := cfgString(cfg, "webhook_url")
	if raw == "" {
		return errors.New("missing Webhook URL")
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host != "hooks.slack.com" {
		return errors.New("Webhook URL must be an https://hooks.slack.com/services/... URL")
	}
	if !strings.Contains(u.Path, "/services/") {
		return errors.New("Webhook URL does not look like a Slack incoming webhook (missing /services/)")
	}
	return nil
}

func (c slackChannel) Send(ctx context.Context, cfg map[string]any, m Message) (int, error) {
	if err := c.Validate(cfg); err != nil {
		return 0, Permanent(err)
	}
	text, kept := slackText(m)
	payload := map[string]any{"text": text}
	raw, err := doJSON(ctx, "POST", cfgString(cfg, "webhook_url"), nil, payload)
	if err != nil {
		return 0, err
	}
	// Slack answers 200 with the literal body "ok"; anything else is a plain-text
	// error ("invalid_payload", "channel_not_found", ...). Retries cannot fix those.
	if len(raw) > 0 && strings.TrimSpace(string(raw)) != "ok" {
		var e struct {
			Error string `json:"error"`
		}
		if json.Unmarshal(raw, &e) == nil && e.Error != "" {
			return 0, Permanent(fmt.Errorf("Slack rejected the message: %s", e.Error))
		}
		return 0, Permanent(fmt.Errorf("Slack rejected the message: %s", snippet(raw)))
	}
	return kept, nil
}

func slackText(m Message) (string, int) {
	lim := m.limits()
	var b strings.Builder
	b.WriteString("*" + markdownTitle(m) + "*")
	if m.Batch {
		footer := ""
		if m.HomeURL != "" {
			footer = "\n\n<" + m.HomeURL + ">"
		}
		kept := packItemCount(m.Items, slackTextLimit, 200, footer, runeSize, func(it Item, idx int) string {
			return slackLine(it, idx+1, lim)
		})
		items := m.Items[:kept]
		b.Reset()
		b.WriteString("*" + markdownTitle(m) + "*")
		for i, it := range items {
			b.WriteString("\n" + slackLine(it, i+1, lim))
		}
		b.WriteString(footer)
		return b.String(), kept
	}
	if len(m.Items) == 0 {
		return b.String(), 0
	}
	it := m.Items[0]
	if it.IsStatusChange() {
		b.WriteString("\n*Status*: " + StatusLabel(it.FromStatus) + " → " + StatusLabel(it.ToStatus))
	}
	if it.VulnClass != "" && it.VulnClass != it.Title() {
		b.WriteString("\n*Type*: " + it.VulnClass)
	}
	if a := assetLine(it.Assets, lim.AssetsShown); a != "" {
		b.WriteString("\n*Assets*: " + a)
	}
	if s := OneLine(it.Summary, lim.SummaryRunes); s != "" {
		b.WriteString("\n*Summary*: " + s)
	}
	if it.DetailURL != "" {
		b.WriteString("\n\n<" + it.DetailURL + ">")
	}
	return b.String(), 1
}

func slackLine(it Item, idx int, lim Limits) string {
	if a := assetLine(it.Assets, lim.AssetsShown); a != "" {
		return fmt.Sprintf("%d. *%s* · %s — %s", idx, SeverityLabel(it.Severity), it.Title(), a)
	}
	return fmt.Sprintf("%d. *%s* · %s", idx, SeverityLabel(it.Severity), it.Title())
}
