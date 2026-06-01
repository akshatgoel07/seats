package domain

import (
	"math"
	"sort"
	"strconv"
)

// FlatSeat is a denormalized, queryable representation of a single seat,
// derived from a Scene. It is what gets written to the `seats` table and
// returned by integration endpoints that don't want to parse the scene graph.
//
// SeatUID is the stable per-seat identifier (the editor's seat id, or a derived
// id for standing-section seats). It is the join key between a layout's seats
// and a show's per-seat availability.
type FlatSeat struct {
	SeatUID          string  `json:"seatUid"`
	Label            string  `json:"label"`
	RowLabel         string  `json:"rowLabel"`
	RowNum           int     `json:"rowNum"`
	ColNum           int     `json:"colNum"`
	CategoryID       string  `json:"categoryId"`
	X                float64 `json:"x"`
	Y                float64 `json:"y"`
	Width            float64 `json:"width"`
	Height           float64 `json:"height"`
	IsStanding       bool    `json:"isStanding"`
	StandingSectionID string `json:"standingSectionId,omitempty"`
}

// FlattenResult is the outcome of flattening a scene.
type FlattenResult struct {
	Seats    []FlatSeat
	RowCount int
	ColCount int
}

// FlattenSeats derives the flat seat list from a scene. It mirrors the
// frontend's save logic (app/editor/[screenId]/page.js handleSaveSeatLayout):
//
//   - Seats are grouped by row; within a row they are ordered along the row
//     geometry (by x for lines, by angle for arcs) to assign 1-based column
//     numbers. Rows are ordered by id for stable, deterministic numbering.
//   - Standalone (table) seats — those with a null rowId — are emitted with
//     rowNum 0 and sequential column numbers.
//   - Standing sections are expanded into individual seats laid out on a grid,
//     matching the capacity the operator set.
//
// RowCount/ColCount summarize the seated grid (excludes standing sections),
// matching the legacy sl_row_num_tot / sl_col_num_tot.
func FlattenSeats(s Scene) FlattenResult {
	var out []FlatSeat

	// Group seats by row id ("" key = standalone/table seats).
	byRow := map[string][]Seat{}
	for _, seat := range s.Seats {
		key := ""
		if seat.RowID != nil {
			key = *seat.RowID
		}
		byRow[key] = append(byRow[key], seat)
	}

	// Standalone (table) seats first: rowNum 0, sequential columns.
	for i, seat := range byRow[""] {
		out = append(out, FlatSeat{
			SeatUID:    seat.ID,
			Label:      orDefault(seat.Label, "Table-Seat-"+strconv.Itoa(i+1)),
			RowLabel:   "",
			RowNum:     0,
			ColNum:     i + 1,
			CategoryID: seat.CategoryID,
			X:          seat.LocalX,
			Y:          seat.LocalY,
			Width:      seat.Width,
			Height:     seat.Height,
		})
	}

	// Seated rows: ordered by row id for deterministic numbering.
	rowIDs := make([]string, 0, len(s.Rows))
	for id := range s.Rows {
		rowIDs = append(rowIDs, id)
	}
	sort.Strings(rowIDs)

	rowCount := 0
	colCount := 0
	for _, rowID := range rowIDs {
		seats := byRow[rowID]
		if len(seats) == 0 {
			continue
		}
		row := s.Rows[rowID]
		sortSeatsAlongRow(seats, row.Geometry)

		rowIndex := rowCount // 0-based for labeling
		for col, seat := range seats {
			label := seat.Label
			if label == "" {
				label = SeatLabel(rowIndex, col+1)
			}
			out = append(out, FlatSeat{
				SeatUID:    seat.ID,
				Label:      label,
				RowLabel:   RowLabel(rowIndex),
				RowNum:     rowIndex + 1,
				ColNum:     col + 1,
				CategoryID: seat.CategoryID,
				X:          seat.LocalX,
				Y:          seat.LocalY,
				Width:      seat.Width,
				Height:     seat.Height,
			})
		}
		if len(seats) > colCount {
			colCount = len(seats)
		}
		rowCount++
	}

	// Standing sections: expand into a grid of individual seats.
	for _, el := range s.Elements {
		if el.Type != ElementTypeStandingSection {
			continue
		}
		out = append(out, expandStandingSection(el)...)
	}

	return FlattenResult{Seats: out, RowCount: rowCount, ColCount: colCount}
}

// sortSeatsAlongRow orders seats by position along the row: by x for lines, by
// angle about the arc center for arcs (matching the frontend).
func sortSeatsAlongRow(seats []Seat, g Geometry) {
	switch g.Kind {
	case "arc":
		var cx, cy float64
		if g.Center != nil {
			cx, cy = g.Center.X, g.Center.Y
		}
		sort.SliceStable(seats, func(i, j int) bool {
			ai := math.Atan2(seats[i].LocalY-cy, seats[i].LocalX-cx)
			aj := math.Atan2(seats[j].LocalY-cy, seats[j].LocalX-cx)
			return ai < aj
		})
	default: // line and anything else: sort by x then y
		sort.SliceStable(seats, func(i, j int) bool {
			if seats[i].LocalX == seats[j].LocalX {
				return seats[i].LocalY < seats[j].LocalY
			}
			return seats[i].LocalX < seats[j].LocalX
		})
	}
}

// expandStandingSection turns a standing-section element into individual seats
// laid out on a near-square grid, matching the frontend's expansion.
func expandStandingSection(el Element) []FlatSeat {
	capacity := el.StandingCapacity
	if capacity <= 0 {
		capacity = 100
	}
	width := el.Width
	if width <= 0 {
		width = 150
	}
	height := el.Height
	if height <= 0 {
		height = 100
	}
	perRow := int(math.Ceil(math.Sqrt(float64(capacity))))
	if perRow < 1 {
		perRow = 1
	}
	perCol := int(math.Ceil(float64(capacity) / float64(perRow)))
	spacingX := width / math.Max(float64(perRow-1), 1)
	spacingY := height / math.Max(float64(perCol-1), 1)

	label := orDefault(el.Label, "Standing")
	out := make([]FlatSeat, 0, capacity)
	for i := 0; i < capacity; i++ {
		rowInGrid := i / perRow
		colInGrid := i % perRow
		worldX := el.X + float64(colInGrid)*spacingX - width/2
		worldY := el.Y + float64(rowInGrid)*spacingY - height/2
		out = append(out, FlatSeat{
			SeatUID:           el.ID + "_seat_" + strconv.Itoa(i+1),
			Label:             label + "-" + strconv.Itoa(i+1),
			RowNum:            rowInGrid + 1,
			ColNum:            colInGrid + 1,
			X:                 worldX,
			Y:                 worldY,
			IsStanding:        true,
			StandingSectionID: el.ID,
		})
	}
	return out
}

func orDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}
