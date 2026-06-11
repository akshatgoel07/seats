package main

import (
	"context"
	"log/slog"
	"time"
)

// holdExpirer is the slice of the booking store the sweeper needs; narrow so
// tests can fake it.
type holdExpirer interface {
	ExpireDueHolds(ctx context.Context) (int, error)
}

// sweepHolds periodically releases holds whose TTL has lapsed, freeing their
// seats. Without it, abandoned holds block seats forever. It also bumps
// seat_status.updated_at, which makes expiry visible to ETag-polling clients.
func sweepHolds(ctx context.Context, log *slog.Logger, b holdExpirer, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			n, err := b.ExpireDueHolds(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Warn("hold sweep failed", "err", err.Error())
				continue
			}
			if n > 0 {
				log.Info("expired holds released", "count", n)
			}
		}
	}
}
