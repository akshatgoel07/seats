// Package httpx contains HTTP transport concerns: response helpers, the error
// envelope, middleware, and the router. It depends on domain/service packages
// but never the other way around.
package httpx

import (
	"errors"
	"fmt"
	"net/http"
)

// APIError is a client-facing error carrying a machine-readable code, a safe
// message, and the HTTP status to return. Internal details are never embedded.
type APIError struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *APIError) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// Constructors for the common cases. Each returns *APIError so callers can wrap
// or return them directly; WriteError understands them.

// NewAPIError builds an APIError with an explicit status and code.
func NewAPIError(status int, code, message string) *APIError {
	return &APIError{Status: status, Code: code, Message: message}
}

// ErrBadRequest is for malformed input the client can fix.
func ErrBadRequest(message string) *APIError {
	return &APIError{Status: http.StatusBadRequest, Code: "bad_request", Message: message}
}

// ErrValidation is for input that parsed but failed validation rules.
func ErrValidation(message string) *APIError {
	return &APIError{Status: http.StatusUnprocessableEntity, Code: "validation_failed", Message: message}
}

// ErrNotFound is for a missing resource.
func ErrNotFound(message string) *APIError {
	if message == "" {
		message = "resource not found"
	}
	return &APIError{Status: http.StatusNotFound, Code: "not_found", Message: message}
}

// ErrConflict is for state conflicts (e.g. seat already held/booked).
func ErrConflict(message string) *APIError {
	return &APIError{Status: http.StatusConflict, Code: "conflict", Message: message}
}

// ErrUnauthorized is for missing/invalid credentials.
func ErrUnauthorized(message string) *APIError {
	if message == "" {
		message = "authentication required"
	}
	return &APIError{Status: http.StatusUnauthorized, Code: "unauthorized", Message: message}
}

// ErrInternal is for unexpected server failures; the message stays generic.
func ErrInternal() *APIError {
	return &APIError{Status: http.StatusInternalServerError, Code: "internal_error", Message: "an unexpected error occurred"}
}

// asAPIError extracts an *APIError from err if present.
func asAPIError(err error) (*APIError, bool) {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr, true
	}
	return nil, false
}
