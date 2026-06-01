package domain

import (
	"encoding/json"
	"testing"
)

func TestRowLabel(t *testing.T) {
	cases := []struct {
		in   int
		want string
	}{
		{0, "A"}, {1, "B"}, {25, "Z"}, {26, "AA"}, {27, "AB"}, {701, "ZZ"}, {702, "AAA"}, {-1, "A"},
	}
	for _, c := range cases {
		if got := RowLabel(c.in); got != c.want {
			t.Errorf("RowLabel(%d) = %q, want %q", c.in, got, c.want)
		}
		if c.in >= 0 {
			if got := ParseRowLabel(c.want); got != c.in {
				t.Errorf("ParseRowLabel(%q) = %d, want %d", c.want, got, c.in)
			}
		}
	}
}

func strptr(s string) *string { return &s }

func TestFlattenSeats_LineRowsNumbering(t *testing.T) {
	// Two rows, each on a line. Seats given out of order to verify sorting.
	s := Scene{
		Rows: map[string]Row{
			"r1": {ID: "r1", Geometry: Geometry{Kind: "line"}},
			"r2": {ID: "r2", Geometry: Geometry{Kind: "line"}},
		},
		Seats: map[string]Seat{
			"a": {ID: "a", RowID: strptr("r1"), LocalX: 30},
			"b": {ID: "b", RowID: strptr("r1"), LocalX: 10},
			"c": {ID: "c", RowID: strptr("r1"), LocalX: 20},
			"d": {ID: "d", RowID: strptr("r2"), LocalX: 5},
		},
	}
	res := FlattenSeats(s)
	if res.RowCount != 2 {
		t.Errorf("RowCount = %d, want 2", res.RowCount)
	}
	if res.ColCount != 3 {
		t.Errorf("ColCount = %d, want 3", res.ColCount)
	}
	// Find seat b: leftmost in row r1 -> A-1
	got := map[string]FlatSeat{}
	for _, fs := range res.Seats {
		got[fs.SeatUID] = fs
	}
	if got["b"].Label != "A-1" || got["b"].ColNum != 1 || got["b"].RowNum != 1 {
		t.Errorf("seat b = %+v, want A-1 col1 row1", got["b"])
	}
	if got["a"].Label != "A-3" {
		t.Errorf("seat a label = %q, want A-3", got["a"].Label)
	}
	if got["d"].Label != "B-1" {
		t.Errorf("seat d label = %q, want B-1", got["d"].Label)
	}
}

func TestFlattenSeats_StandaloneTableSeats(t *testing.T) {
	s := Scene{
		Seats: map[string]Seat{
			"t1": {ID: "t1", RowID: nil, LocalX: 0, LocalY: 0},
			"t2": {ID: "t2", RowID: nil, LocalX: 50, LocalY: 0},
		},
	}
	res := FlattenSeats(s)
	if len(res.Seats) != 2 {
		t.Fatalf("got %d seats, want 2", len(res.Seats))
	}
	for _, fs := range res.Seats {
		if fs.RowNum != 0 {
			t.Errorf("standalone seat RowNum = %d, want 0", fs.RowNum)
		}
	}
}

func TestFlattenSeats_StandingSectionExpansion(t *testing.T) {
	elJSON := `{"id":"sec1","type":"standing-section","x":100,"y":100,"width":200,"height":150,"standingCapacity":9,"label":"GA"}`
	var el Element
	if err := json.Unmarshal([]byte(elJSON), &el); err != nil {
		t.Fatalf("unmarshal element: %v", err)
	}
	s := Scene{Elements: map[string]Element{"sec1": el}}
	res := FlattenSeats(s)
	if len(res.Seats) != 9 {
		t.Fatalf("standing expansion got %d seats, want 9", len(res.Seats))
	}
	for _, fs := range res.Seats {
		if !fs.IsStanding || fs.StandingSectionID != "sec1" {
			t.Errorf("seat %+v not marked standing for sec1", fs)
		}
	}
}

func TestFlattenSeats_ManyRowsExcelLabels(t *testing.T) {
	// 28 rows -> labels A..Z, AA, AB
	rows := map[string]Row{}
	seats := map[string]Seat{}
	for i := 0; i < 28; i++ {
		// zero-pad row id so sort order matches creation order
		id := "row" + pad(i)
		rows[id] = Row{ID: id, Geometry: Geometry{Kind: "line"}}
		sid := "s" + pad(i)
		seats[sid] = Seat{ID: sid, RowID: strptr(id), LocalX: 0}
	}
	res := FlattenSeats(Scene{Rows: rows, Seats: seats})
	if res.RowCount != 28 {
		t.Fatalf("RowCount = %d, want 28", res.RowCount)
	}
	labels := map[int]string{}
	for _, fs := range res.Seats {
		labels[fs.RowNum] = fs.RowLabel
	}
	if labels[1] != "A" || labels[26] != "Z" || labels[27] != "AA" || labels[28] != "AB" {
		t.Errorf("labels: row1=%q row26=%q row27=%q row28=%q", labels[1], labels[26], labels[27], labels[28])
	}
}

func pad(i int) string {
	const digits = "0123456789"
	return string([]byte{digits[i/10], digits[i%10]})
}

func TestElementRoundTripPreservesUnknownFields(t *testing.T) {
	elJSON := `{"id":"e1","type":"path","x":1,"y":2,"width":3,"height":4,"points":[{"x":0,"y":0}],"curveHandles":{"0":{"cp1":{"x":1,"y":1}}},"strokeColor":"#000","customField":"keepme"}`
	var el Element
	if err := json.Unmarshal([]byte(elJSON), &el); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	out, err := json.Marshal(el)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(out, &got); err != nil {
		t.Fatalf("re-unmarshal: %v", err)
	}
	if got["customField"] != "keepme" {
		t.Errorf("customField lost: %v", got["customField"])
	}
	if got["strokeColor"] != "#000" {
		t.Errorf("strokeColor lost: %v", got["strokeColor"])
	}
	if _, ok := got["points"]; !ok {
		t.Error("points lost")
	}
	if _, ok := got["curveHandles"]; !ok {
		t.Error("curveHandles lost")
	}
}
