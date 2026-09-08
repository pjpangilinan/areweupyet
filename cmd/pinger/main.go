package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"areweupyet/internal/checker"
)

func main() {
	urlFlag := flag.String("url", "", "URL of endpoint to check")
	timeoutFlag := flag.Int("timeout", 10, "Request timeout in seconds")
	statusFlag := flag.Int("expected-status", 200, "Expected HTTP status code")
	flag.Parse()

	if *urlFlag == "" {
		fmt.Println("Usage: pinger -url https://example.com [-timeout 10] [-expected-status 200]")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(*timeoutFlag+2)*time.Second)
	defer cancel()

	result := checker.CheckEndpoint(ctx, checker.CheckOptions{
		URL:            *urlFlag,
		TimeoutSec:     *timeoutFlag,
		ExpectedStatus: *statusFlag,
	})

	if result.Success {
		fmt.Printf("[UP] Status: %d | Latency: %dms | URL: %s\n", result.StatusCode, result.LatencyMs, *urlFlag)
		os.Exit(0)
	} else {
		fmt.Printf("[DOWN] Error: %s | Status: %d | Latency: %dms | URL: %s\n", result.ErrorMessage, result.StatusCode, result.LatencyMs, *urlFlag)
		os.Exit(2)
	}
}
