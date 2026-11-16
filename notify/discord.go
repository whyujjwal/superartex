package notify

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
)

// discordTextLimit is Discord's per-message character limit for the content field.
const discordTextLimit = 2000

// discordChannel posts to a Discord incoming webhook (channel Settings →
// Integrations → Webhooks → Copy Webhook URL). The URL itself carries the
// webhook token, so the whole URL is the credential — same model as WeCom.
type discordChannel struct{}

func (discordChannel) Kind() string { return KindDiscord }

// Discord allows roughly 30 webhook requests per minute per channel.
func (discordChannel) DefaultRatePerMin() int { return 30 }

func (discordChannel) SecretKeys() []string      { return []string{"webhook_url"} }
func (discordChannel) DestinationKeys() []string { return []string{"webhook_url"} }

func (c discordChannel) Validate(cfg map[string]any) error {
	raw := cfgString(cfg, "webhook_url")
	if raw == "" {
		return errors.New("missing Webhook URL")
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host != "discord.com" && u.Host != "discordapp.com" {
		return errors.New("Webhook URL must be an https://discord.com (or discordapp.com) webhook URL")
	}
	if !strings.Contains(u.Path, "/api/webhooks/") {
		return errors.New("Webhook URL does not look like a Discord webhook (missing /api/webhooks/)")
	}
	return nil
}

func (c discordChannel) Send(ctx context.Context, cfg map[string]any, m Message) (int, error) {
	if err := c.Validate(cfg); err != nil {
		return 0, Permanent(err)
	}
	text, kept := discordText(m)
	payload := map[string]any{"content": text}
	raw, err := doJSON(ctx, "POST", cfgString(cfg, "webhook_url"), nil, payload)
	if err != nil {
		return 0, err
	}
	// Discord returns 204 on success; anything else carries a JSON error object.
	var res struct {
		Message string `json:"message"`
		Code    int    `json:"code"`
	}
	if len(raw) > 0 && json.Unmarshal(raw, &res) == nil && res.Code != 0 {
		return 0, Permanent(fmt.Errorf("Discord rejected the message (code %d): %s", res.Code, res.Message))
	}
	return kept, nil
}

// discordText renders plain text (Discord renders markdown; the renderer keeps
// to bold + lines that are safe without escaping) and returns how many items fit.
func discordText(m Message) (string, int) {
	lim := m.limits()
	var b strings.Builder
	b.WriteString("**" + markdownTitle(m) + "**")
	if m.Batch {
		footer := ""
		if m.HomeURL != "" {
			footer = "\n\n<" + m.HomeURL + ">"
		}
		kept := packItemCount(m.Items, discordTextLimit, 200, footer, runeSize, func(it Item, idx int) string {
			return discordLine(it, idx+1, lim)
		})
		items := m.Items[:kept]
		b.Reset()
		b.WriteString("**" + markdownTitle(m) + "**")
		for i, it := range items {
			b.WriteString("\n" + discordLine(it, i+1, lim))
		}
		b.WriteString(footer)
		return b.String(), kept
	}
	if len(m.Items) == 0 {
		return b.String(), 0
	}
	it := m.Items[0]
	if it.IsStatusChange() {
		b.WriteString("\n**Status**: " + StatusLabel(it.FromStatus) + " → " + StatusLabel(it.ToStatus))
	}
	if it.VulnClass != "" && it.VulnClass != it.Title() {
		b.WriteString("\n**Type**: " + it.VulnClass)
	}
	if a := assetLine(it.Assets, lim.AssetsShown); a != "" {
		b.WriteString("\n**Assets**: " + a)
	}
	if s := OneLine(it.Summary, lim.SummaryRunes); s != "" {
		b.WriteString("\n**Summary**: " + s)
	}
	if it.DetailURL != "" {
		b.WriteString("\n\n<" + it.DetailURL + ">")
	}
	return b.String(), 1
}

func discordLine(it Item, idx int, lim Limits) string {
	if a := assetLine(it.Assets, lim.AssetsShown); a != "" {
		return fmt.Sprintf("%d. **%s** · %s — %s", idx, SeverityLabel(it.Severity), it.Title(), a)
	}
	return fmt.Sprintf("%d. **%s** · %s", idx, SeverityLabel(it.Severity), it.Title())
}
