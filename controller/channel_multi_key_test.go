package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestParseSubmittedChannelKeysCleansPlainKeys(t *testing.T) {
	channel := &model.Channel{
		Key: " key-a \n\nkey-b\n ",
	}

	keys, err := parseSubmittedChannelKeys(channel)

	require.NoError(t, err)
	require.Equal(t, []string{"key-a", "key-b"}, keys)
}

func TestParseSubmittedChannelKeysParsesVertexArray(t *testing.T) {
	channel := &model.Channel{
		Type: constant.ChannelTypeVertexAi,
		Key:  `[{"client_email":"a@example.com"},{"client_email":"b@example.com"}]`,
	}

	keys, err := parseSubmittedChannelKeys(channel)

	require.NoError(t, err)
	require.Equal(t, []string{
		`{"client_email":"a@example.com"}`,
		`{"client_email":"b@example.com"}`,
	}, keys)
}

func TestParseStoredChannelKeysKeepsSingleVertexJsonWhole(t *testing.T) {
	channel := &model.Channel{
		Type: constant.ChannelTypeVertexAi,
		Key:  "{\n  \"client_email\": \"a@example.com\"\n}",
	}

	keys := parseStoredChannelKeys(channel)

	require.Equal(t, []string{"{\n  \"client_email\": \"a@example.com\"\n}"}, keys)
}

func TestParseStoredChannelKeysCleansMultiKeyLines(t *testing.T) {
	channel := &model.Channel{
		Key: " key-a \n\nkey-b\n ",
		ChannelInfo: model.ChannelInfo{
			IsMultiKey: true,
		},
	}

	keys := parseStoredChannelKeys(channel)

	require.Equal(t, []string{"key-a", "key-b"}, keys)
}
