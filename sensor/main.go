package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"slices"
	"strconv"
	"sync"
	"time"

	"strasboard/sensor/dht22"

	"github.com/joho/godotenv"
)

const maxBuf = 5

// config holds values loaded from environment variables.
type config struct {
	Pin          string
	Location     string
	Port         string
	ReadInterval time.Duration
	MaxRetries   int
}

func loadConfig() config {
	godotenv.Load()
	return config{
		Pin:          env("GPIO_PIN", "GPIO18"),
		Location:     env("LOCATION", ""),
		Port:         env("PORT", "8080"),
		ReadInterval: time.Duration(envInt("READ_INTERVAL", 5)) * time.Second,
		MaxRetries:   envInt("MAX_RETRIES", 11),
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v, err := strconv.Atoi(os.Getenv(key)); err == nil {
		return v
	}
	return fallback
}

// buffer holds the last maxBuf sensor readings.
type buffer struct {
	mu  sync.RWMutex
	buf []dht22.Reading
}

func (b *buffer) push(r dht22.Reading) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.buf = append(b.buf, r)
	if len(b.buf) > maxBuf {
		b.buf = b.buf[1:]
	}
}

// median returns a representative reading:
//   - 5 values: median of all 5
//   - 3–4 values: median of last 3
//   - 1–2 values: most recent value
//   - 0 values: ok is false
func (b *buffer) median() (dht22.Reading, bool) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	n := len(b.buf)
	if n == 0 {
		return dht22.Reading{}, false
	}
	if n <= 2 {
		return b.buf[n-1], true
	}

	var window []dht22.Reading
	if n == 5 {
		window = slices.Clone(b.buf)
	} else {
		window = slices.Clone(b.buf[n-3:])
	}

	temps := make([]float64, len(window))
	hums := make([]float64, len(window))
	for i, v := range window {
		temps[i] = v.Temperature
		hums[i] = v.Humidity
	}
	slices.Sort(temps)
	slices.Sort(hums)

	mid := len(window) / 2
	return dht22.Reading{
		Temperature: temps[mid],
		Humidity:    hums[mid],
	}, true
}

func main() {
	cfg := loadConfig()

	sensor, err := dht22.New(cfg.Pin)
	if err != nil {
		log.Fatalf("sensor init: %v", err)
	}

	var buf buffer
	go poll(sensor, &buf, cfg)

	mux := http.NewServeMux()
	mux.HandleFunc("/", handle(&buf, cfg.Location))

	log.Printf("listening on :%s", cfg.Port)
	log.Fatal(http.ListenAndServe(":"+cfg.Port, mux))
}

// poll reads the sensor in a loop and pushes results into buf.
func poll(sensor *dht22.Sensor, buf *buffer, cfg config) {
	for {
		r, err := sensor.ReadWithRetry(cfg.MaxRetries)
		if err != nil {
			log.Printf("poll: %v", err)
		} else {
			buf.push(r)
		}
		time.Sleep(cfg.ReadInterval)
	}
}

// handle returns an HTTP handler that serves the median reading as JSON.
func handle(buf *buffer, location string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		reading, ok := buf.median()
		if !ok {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "no data available",
			})
			return
		}

		json.NewEncoder(w).Encode(map[string]any{
			"temperature": reading.Temperature,
			"humidity":    reading.Humidity,
			"location":    location,
		})
	}
}
