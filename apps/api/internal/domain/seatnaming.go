package domain

import (
	"strconv"
	"strings"
)

// RowLabel converts a zero-based row index to an Excel-style column label:
// 0->A, 25->Z, 26->AA, 701->ZZ, 702->AAA. This scales past 2000+ rows and
// mirrors the frontend's getRowLabel (app/seat-layout/seatNaming.js) so labels
// match what the editor generates.
func RowLabel(index int) string {
	if index < 0 {
		return "A"
	}
	var sb strings.Builder
	// Build least-significant char first, then reverse.
	digits := make([]byte, 0, 4)
	num := index
	for num >= 0 {
		digits = append(digits, byte('A'+(num%26)))
		num = num/26 - 1
	}
	for i := len(digits) - 1; i >= 0; i-- {
		sb.WriteByte(digits[i])
	}
	return sb.String()
}

// ParseRowLabel converts a row label back to a zero-based index (inverse of
// RowLabel). Invalid input yields 0.
func ParseRowLabel(label string) int {
	if label == "" {
		return 0
	}
	idx := 0
	for i := 0; i < len(label); i++ {
		c := label[i]
		if c >= 'a' && c <= 'z' {
			c -= 'a' - 'A'
		}
		if c < 'A' || c > 'Z' {
			return 0
		}
		idx = idx*26 + int(c-'A'+1)
	}
	return idx - 1
}

// SeatLabel builds "{RowLabel}-{seatNumber}", e.g. (0,1)->"A-1", (26,15)->"AA-15".
func SeatLabel(rowIndex, seatNumber int) string {
	return RowLabel(rowIndex) + "-" + strconv.Itoa(seatNumber)
}
