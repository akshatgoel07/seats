// Package domain holds the core types and business rules of the seat-layout
// system. It has no knowledge of HTTP or the database.
//
// The "Scene" is the editor's normalized document: a graph of a venue, its
// sections, rows, seats, and free-form canvas elements. The authoritative copy
// of a scene is stored verbatim as JSON (see store.LayoutStore) so the editor
// round-trips losslessly. The typed structs here are used to *read* a scene for
// server-side derivations (chiefly flattening seats), and to expose a stable,
// documented shape to third-party integrators.
package domain

import "encoding/json"

// Point is a 2D coordinate. Coordinates are emitted even when zero, so JSON
// round-trips faithfully (a seat at localX=0 must not lose the field).
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Transform is an optional per-object placement (sections/rows carry one).
type Transform struct {
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Rotation float64 `json:"rotation"`
}

// View is the editor camera state.
type View struct {
	Scale float64 `json:"scale"`
	TX    float64 `json:"tx"`
	TY    float64 `json:"ty"`
}

// Category is a seat type / price tier. The editor's dynamic categories add the
// integration fields (ScreenSeatTypeID etc.); all are optional so both shapes
// parse and re-emit cleanly.
type Category struct {
	ID               string  `json:"id"`
	Name             string  `json:"name"`
	Color            string  `json:"color"`
	Price            float64 `json:"price"`
	ScreenSeatTypeID *int64  `json:"screen_seat_type_id,omitempty"`
	IsOpenSeatingTxt string  `json:"is_open_seating_area,omitempty"`
	SeatCount        *int    `json:"sst_no_of_seats,omitempty"`
}

// Venue is the top-level container.
type Venue struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Sections   []string   `json:"sections"`
	Categories []Category `json:"categories"`
}

// Section groups rows.
type Section struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	CategoryID string     `json:"categoryId"`
	Rows       []string   `json:"rows"`
	Transform  *Transform `json:"transform,omitempty"`
}

// Geometry describes a row's shape: a straight line (p1,p2) or an elliptical
// arc (center,radiusX,radiusY,startAngle,endAngle). Optional fields use
// pointers so a line geometry doesn't emit arc fields and vice versa.
type Geometry struct {
	Kind       string   `json:"kind"`
	P1         *Point   `json:"p1,omitempty"`
	P2         *Point   `json:"p2,omitempty"`
	Center     *Point   `json:"center,omitempty"`
	RadiusX    *float64 `json:"radiusX,omitempty"`
	RadiusY    *float64 `json:"radiusY,omitempty"`
	StartAngle *float64 `json:"startAngle,omitempty"`
	EndAngle   *float64 `json:"endAngle,omitempty"`
	Radius     *float64 `json:"radius,omitempty"` // legacy circular arcs
}

// Row is a line/arc of seats within a section.
type Row struct {
	ID         string     `json:"id"`
	SectionID  string     `json:"sectionId"`
	Geometry   Geometry   `json:"geometry"`
	SeatCount  int        `json:"seatCount"`
	Spacing    float64    `json:"spacing"`
	CategoryID string     `json:"categoryId"`
	Curve      float64    `json:"curve"`
	Transform  *Transform `json:"transform,omitempty"`
}

// Seat is a single addressable seat. RowID is null for standalone/table seats.
// Coordinate and size fields are emitted even when zero for faithful round-trip.
type Seat struct {
	ID          string  `json:"id"`
	RowID       *string `json:"rowId"`
	LocalX      float64 `json:"localX"`
	LocalY      float64 `json:"localY"`
	Width       float64 `json:"width"`
	Height      float64 `json:"height"`
	Radius      float64 `json:"radius,omitempty"`
	Label       string  `json:"label"`
	CategoryID  string  `json:"categoryId"`
	IsAvailable bool    `json:"isAvailable"`
}

// Element is a free-form canvas element (shapes, text, images, standing/seating
// sections, paths, groups). Only the fields the backend needs to interpret
// (chiefly to expand standing sections into seats) are typed; the rest are
// preserved verbatim via Extra so storage and re-emission are lossless.
type Element struct {
	ID    string `json:"id"`
	Type  string `json:"type"`
	X     float64
	Y     float64
	Width  float64
	Height float64
	Label  string

	// StandingCapacity drives standing-section seat expansion.
	StandingCapacity int

	// APIData may carry an external seat-type reference for standing sections.
	APIData map[string]json.RawMessage

	// Extra holds every other field verbatim.
	Extra map[string]json.RawMessage
}

// Element types we interpret. Others are passed through untouched.
const (
	ElementTypeStandingSection = "standing-section"
	ElementTypeCircle          = "circle"
)

// elementKnown lists keys Element promotes to typed fields; everything else
// lands in Extra.
var elementKnown = map[string]bool{
	"id": true, "type": true, "x": true, "y": true, "width": true,
	"height": true, "label": true, "standingCapacity": true, "apiData": true,
}

// UnmarshalJSON parses an element, promoting known fields and capturing the
// rest in Extra so re-marshaling is lossless.
func (e *Element) UnmarshalJSON(b []byte) error {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(b, &raw); err != nil {
		return err
	}
	e.Extra = map[string]json.RawMessage{}
	for k, v := range raw {
		if !elementKnown[k] {
			e.Extra[k] = v
			continue
		}
		switch k {
		case "id":
			_ = json.Unmarshal(v, &e.ID)
		case "type":
			_ = json.Unmarshal(v, &e.Type)
		case "x":
			_ = json.Unmarshal(v, &e.X)
		case "y":
			_ = json.Unmarshal(v, &e.Y)
		case "width":
			_ = json.Unmarshal(v, &e.Width)
		case "height":
			_ = json.Unmarshal(v, &e.Height)
		case "label":
			_ = json.Unmarshal(v, &e.Label)
		case "standingCapacity":
			_ = json.Unmarshal(v, &e.StandingCapacity)
		case "apiData":
			_ = json.Unmarshal(v, &e.APIData)
		}
	}
	return nil
}

// MarshalJSON re-emits the element with known fields plus Extra, byte-faithful
// to what was parsed.
func (e Element) MarshalJSON() ([]byte, error) {
	out := map[string]json.RawMessage{}
	for k, v := range e.Extra {
		out[k] = v
	}
	put := func(k string, val any) {
		b, _ := json.Marshal(val)
		out[k] = b
	}
	put("id", e.ID)
	put("type", e.Type)
	put("x", e.X)
	put("y", e.Y)
	put("width", e.Width)
	put("height", e.Height)
	if e.Label != "" || hasKey(e.Extra, "label") {
		put("label", e.Label)
	}
	if e.Type == ElementTypeStandingSection {
		put("standingCapacity", e.StandingCapacity)
	}
	if e.APIData != nil {
		put("apiData", e.APIData)
	}
	return json.Marshal(out)
}

func hasKey(m map[string]json.RawMessage, k string) bool {
	_, ok := m[k]
	return ok
}

// Scene is the editor document. Elements and View are read-and-preserved; the
// rest is fully typed. The persisted copy is the raw JSON; this struct is used
// for derivations and as a documented integration shape.
type Scene struct {
	Venue    Venue              `json:"venue"`
	Sections map[string]Section `json:"sections"`
	Rows     map[string]Row     `json:"rows"`
	Seats    map[string]Seat    `json:"seats"`
	Elements map[string]Element `json:"elements"`
	View     *View              `json:"view,omitempty"`

	// ShowSectionBoundaryInRenderer is an occasional top-level flag the editor
	// adds on save.
	ShowSectionBoundaryInRenderer *bool `json:"showSectionBoundaryInRenderer,omitempty"`
}

// ParseScene unmarshals raw scene JSON into the typed Scene.
func ParseScene(raw []byte) (Scene, error) {
	var s Scene
	if err := json.Unmarshal(raw, &s); err != nil {
		return Scene{}, err
	}
	return s, nil
}
