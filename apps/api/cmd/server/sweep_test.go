package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync/atomic"
	"testing"
	"time"
)

type fakeExpirer struct {
	calls atomic.Int64
	err   error
}

func (f *fakeExpirer) ExpireDueHolds(context.Context) (int, error) {
	f.calls.Add(1)
	return 1, f.err
}

func TestSweepHoldsTicksAndStops(t *testing.T) {
	f := &fakeExpirer{}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		sweepHolds(ctx, testLogger(), f, 5*time.Millisecond)
		close(done)
	}()

	deadline := time.After(2 * time.Second)
	for f.calls.Load() < 2 {
		select {
		case <-deadline:
			t.Fatalf("sweeper ticked %d times, want >= 2", f.calls.Load())
		case <-time.After(5 * time.Millisecond):
		}
	}
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("sweeper did not stop after context cancellation")
	}
}

func TestSweepHoldsSurvivesErrors(t *testing.T) {
	f := &fakeExpirer{err: errors.New("db down")}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go sweepHolds(ctx, testLogger(), f, 5*time.Millisecond)

	deadline := time.After(2 * time.Second)
	for f.calls.Load() < 2 {
		select {
		case <-deadline:
			t.Fatalf("sweeper stopped retrying after an error: %d calls, want >= 2", f.calls.Load())
		case <-time.After(5 * time.Millisecond):
		}
	}
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}
