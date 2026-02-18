package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"strasboard/sensor/dht22"

	"github.com/joho/godotenv"
)

type config struct {
	Pin          string
	Location     string
	ServerURL    string
	AuthToken    string
	ReadInterval time.Duration
	MaxRetries   int
	Debug        bool
}

func loadConfig() config {
	godotenv.Load()
	cfg := config{
		Pin:          getEnv("GPIO_PIN", ""),
		Location:     getEnv("LOCATION", ""),
		ServerURL:    getEnv("SERVER_URL", ""),
		AuthToken:    getEnv("AUTH_TOKEN", ""),
		ReadInterval: time.Duration(getEnvInt("READ_INTERVAL", 5)) * time.Second,
		MaxRetries:   getEnvInt("MAX_RETRIES", 11),
		Debug:        os.Getenv("DEBUG") == "1",
	}
	if cfg.ServerURL == "" {
		log.Fatal("config: SERVER_URL not set")
	}
	if cfg.Pin == "" {
		log.Fatal("config: GPIO_PIN not set")
	}
	return cfg
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v, err := strconv.Atoi(os.Getenv(key)); err == nil {
		return v
	}
	return fallback
}

type payload struct {
	Temperature float64 `json:"temperature"`
	Humidity    float64 `json:"humidity"`
	Location    string  `json:"location"`
}

var client = &http.Client{Timeout: 10 * time.Second}

func main() {
	cfg := loadConfig()

	sensor, err := dht22.New(cfg.Pin)
	if err != nil {
		log.Fatalf("sensor init: %v", err)
	}

	log.Printf("polling DHT22 every %v, posting to %s", cfg.ReadInterval, cfg.ServerURL)

	for {
		r, err := sensor.ReadWithRetry(cfg.MaxRetries)
		if err != nil {
			log.Printf("read: %v", err)
			time.Sleep(cfg.ReadInterval)
			continue
		}

		p := payload{
			Temperature: r.Temperature,
			Humidity:    r.Humidity,
			Location:    cfg.Location,
		}

		if err := post(cfg, p); err != nil {
			log.Printf("post: %v", err)
		} else if cfg.Debug {
			log.Printf("sent: %.1f °C, %.1f %%, %s", p.Temperature, p.Humidity, p.Location)
		}

		time.Sleep(cfg.ReadInterval)
	}
}

func post(cfg config, p payload) error {
	body, err := json.Marshal(p)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	req, err := http.NewRequest("POST", cfg.ServerURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if cfg.AuthToken != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.AuthToken)
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("send: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("server returned %d", resp.StatusCode)
	}
	return nil
}
