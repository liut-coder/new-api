package model

import "gorm.io/gorm"

type UsageRankingSummary struct {
	RequestCount     int64 `json:"request_count"`
	PromptTokens     int64 `json:"prompt_tokens"`
	CompletionTokens int64 `json:"completion_tokens"`
	TotalTokens      int64 `json:"total_tokens"`
}

type UsageRankingRow struct {
	Rank             int    `json:"rank" gorm:"-"`
	UserId           int    `json:"user_id"`
	Username         string `json:"username"`
	TokenId          int    `json:"token_id"`
	TokenName        string `json:"token_name"`
	RequestCount     int64  `json:"request_count"`
	PromptTokens     int64  `json:"prompt_tokens"`
	CompletionTokens int64  `json:"completion_tokens"`
	TotalTokens      int64  `json:"total_tokens"`
}

func GetUsageRankingSummary(startTime int64, endTime int64) (UsageRankingSummary, error) {
	var summary UsageRankingSummary
	query := LOG_DB.Model(&Log{}).
		Select(`
			count(*) as request_count,
			coalesce(sum(prompt_tokens), 0) as prompt_tokens,
			coalesce(sum(completion_tokens), 0) as completion_tokens,
			coalesce(sum(prompt_tokens + completion_tokens), 0) as total_tokens`,
		).
		Where("type = ?", LogTypeConsume)
	query = applyUsageRankingTimeRange(query, startTime, endTime)
	err := query.Scan(&summary).Error
	return summary, err
}

func GetUsageRankingRows(startTime int64, endTime int64, limit int) ([]UsageRankingRow, error) {
	if limit <= 0 {
		limit = 100
	}
	var rows []UsageRankingRow
	query := LOG_DB.Model(&Log{}).
		Select(`
			user_id,
			username,
			token_id,
			token_name,
			count(*) as request_count,
			coalesce(sum(prompt_tokens), 0) as prompt_tokens,
			coalesce(sum(completion_tokens), 0) as completion_tokens,
			coalesce(sum(prompt_tokens + completion_tokens), 0) as total_tokens`,
		).
		Where("type = ?", LogTypeConsume).
		Group("user_id, username, token_id, token_name").
		Having("coalesce(sum(prompt_tokens + completion_tokens), 0) > 0").
		Order("total_tokens DESC").
		Limit(limit)
	query = applyUsageRankingTimeRange(query, startTime, endTime)
	err := query.Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for i := range rows {
		rows[i].Rank = i + 1
	}
	return rows, nil
}

func applyUsageRankingTimeRange(tx *gorm.DB, startTime int64, endTime int64) *gorm.DB {
	if startTime > 0 {
		tx = tx.Where("created_at >= ?", startTime)
	}
	if endTime > 0 {
		tx = tx.Where("created_at <= ?", endTime)
	}
	return tx
}
