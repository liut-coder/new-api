package ratio_setting

import "testing"

func TestFormatMatchingModelNameNormalizesOpenRouterAnthropicClaudeOpus(t *testing.T) {
	tests := []struct {
		name string
		want string
	}{
		{name: "openrouter/anthropic/claude-opus-4.6", want: "claude-opus-4-6"},
		{name: "anthropic/claude-opus-4.7-high", want: "claude-opus-4-7-high"},
		{name: "openrouter/anthropic/claude-opus-4.8-thinking", want: "claude-opus-4-8-thinking"},
		{name: "openai/gpt-oss-120b", want: "openai/gpt-oss-120b"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := FormatMatchingModelName(tt.name); got != tt.want {
				t.Fatalf("FormatMatchingModelName(%q) = %q, want %q", tt.name, got, tt.want)
			}
		})
	}
}

func TestOpenRouterAnthropicClaudeOpusUsesDefaultPricing(t *testing.T) {
	InitRatioSettings()

	ratio, ok, matchName := GetModelRatio("openrouter/anthropic/claude-opus-4.6")
	if !ok {
		t.Fatalf("GetModelRatio returned ok=false, matchName=%q", matchName)
	}
	if ratio != 2.5 {
		t.Fatalf("GetModelRatio returned %v, want 2.5", ratio)
	}
	if matchName != "claude-opus-4-6" {
		t.Fatalf("GetModelRatio matchName = %q, want claude-opus-4-6", matchName)
	}

	thinkingRatio, ok, matchName := GetModelRatio("openrouter/anthropic/claude-opus-4.8-thinking")
	if !ok {
		t.Fatalf("GetModelRatio for thinking alias returned ok=false, matchName=%q", matchName)
	}
	if thinkingRatio != 2.5 {
		t.Fatalf("GetModelRatio for thinking alias returned %v, want 2.5", thinkingRatio)
	}

	if completionRatio := GetCompletionRatio("openrouter/anthropic/claude-opus-4.6"); completionRatio != 5 {
		t.Fatalf("GetCompletionRatio returned %v, want 5", completionRatio)
	}

	cacheRatio, ok := GetCacheRatio("openrouter/anthropic/claude-opus-4.6")
	if !ok {
		t.Fatal("GetCacheRatio returned ok=false")
	}
	if cacheRatio != 0.1 {
		t.Fatalf("GetCacheRatio returned %v, want 0.1", cacheRatio)
	}

	createCacheRatio, ok := GetCreateCacheRatio("openrouter/anthropic/claude-opus-4.6")
	if !ok {
		t.Fatal("GetCreateCacheRatio returned ok=false")
	}
	if createCacheRatio != 1.25 {
		t.Fatalf("GetCreateCacheRatio returned %v, want 1.25", createCacheRatio)
	}
}

func TestUnknownModelFallsBackToDefaultRatio(t *testing.T) {
	InitRatioSettings()

	ratio, ok, matchName := GetModelRatio("totally-unknown-model-x1")
	if !ok {
		t.Fatalf("GetModelRatio returned ok=false, matchName=%q", matchName)
	}
	if ratio != 37.5 {
		t.Fatalf("GetModelRatio returned %v, want 37.5", ratio)
	}
	if matchName != "totally-unknown-model-x1" {
		t.Fatalf("GetModelRatio matchName = %q, want totally-unknown-model-x1", matchName)
	}
}
