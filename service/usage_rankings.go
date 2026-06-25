package service

import (
	"time"

	"github.com/QuantumNous/new-api/model"
)

const usageRankingLimit = 100

type UsageRankingsResponse struct {
	Period    string                    `json:"period"`
	StartTime int64                     `json:"start_time"`
	EndTime   int64                     `json:"end_time"`
	Summary   model.UsageRankingSummary `json:"summary"`
	Rows      []model.UsageRankingRow   `json:"rows"`
}

func GetTodayUsageRankingsSnapshot(now time.Time) (*UsageRankingsResponse, error) {
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	startTime := start.Unix()
	endTime := now.Unix()

	summary, err := model.GetUsageRankingSummary(startTime, endTime)
	if err != nil {
		return nil, err
	}
	rows, err := model.GetUsageRankingRows(startTime, endTime, usageRankingLimit)
	if err != nil {
		return nil, err
	}

	return &UsageRankingsResponse{
		Period:    "today",
		StartTime: startTime,
		EndTime:   endTime,
		Summary:   summary,
		Rows:      rows,
	}, nil
}
