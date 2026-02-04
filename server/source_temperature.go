package main

import "time"

type TemperatureSource struct {
	endpoint string
}

type TemperatureData struct {
	Temperature float64 `json:"temperature"`
	Humidity    int     `json:"humidity"`
	Location    string  `json:"location"`
}

func NewTemperatureSource(cfg *Config) *TemperatureSource {
	return &TemperatureSource{
		endpoint: cfg.TemperatureSensorURL,
	}
}

func (s *TemperatureSource) Name() string               { return "temperature" }
func (s *TemperatureSource) DegradedTTL() time.Duration { return 4 * time.Hour }

func (s *TemperatureSource) Fetch() *Response {
	// TODO: implement actual sensor fetch
	return NewResponse(TemperatureData{
		Temperature: 21.5,
		Humidity:    45,
		Location:    "Living Room",
	}, 24*time.Hour)
}
