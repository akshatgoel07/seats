package service

import (
	"errors"

	"github.com/akshat/seats/api/internal/domain"
	"github.com/akshat/seats/api/internal/httpx"
	"github.com/akshat/seats/api/internal/store"
)

// mapError translates lower-layer errors into client-facing API errors.
// store.ErrNotFound -> 404, store.ErrConflict -> 409, validation -> 422.
// Anything else is returned as-is (handled as a 500 by the transport layer).
func mapError(err error) error {
	if err == nil {
		return nil
	}
	switch {
	case errors.Is(err, store.ErrNotFound):
		return httpx.ErrNotFound(err.Error())
	case errors.Is(err, store.ErrConflict):
		return httpx.ErrConflict(err.Error())
	}
	var verr *domain.ValidationError
	if errors.As(err, &verr) {
		return httpx.ErrValidation(verr.Error())
	}
	return err
}
