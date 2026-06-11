package domain

import (
	"errors"
	"strings"
)

// ValidationError describes an input validation failure. It is mapped to an
// HTTP 422 by the transport layer.
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string {
	if e.Field == "" {
		return e.Message
	}
	return e.Field + ": " + e.Message
}

// NewValidationError builds a ValidationError.
func NewValidationError(field, message string) *ValidationError {
	return &ValidationError{Field: field, Message: message}
}

// ErrSceneInvalid is returned when scene JSON cannot be understood.
var ErrSceneInvalid = errors.New("scene is not valid JSON")

// ValidateVenueName checks a venue name.
func ValidateVenueName(name string) error {
	if strings.TrimSpace(name) == "" {
		return NewValidationError("name", "must not be empty")
	}
	if len(name) > 200 {
		return NewValidationError("name", "must be at most 200 characters")
	}
	return nil
}

// ValidateScene ensures the raw scene is a JSON object and parses into the
// typed Scene. It returns the parsed scene for downstream use.
func ValidateScene(raw []byte) (Scene, error) {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return Scene{}, NewValidationError("scene", "must not be empty")
	}
	// ParseScene's json.Unmarshal already rejects malformed JSON, so a separate
	// json.Valid pass over the whole (multi-MB) payload would be redundant.
	s, err := ParseScene(raw)
	if err != nil {
		return Scene{}, NewValidationError("scene", "must match the scene shape: "+err.Error())
	}
	return s, nil
}
