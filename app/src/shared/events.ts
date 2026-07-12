export interface SeatEventMap {
  seatHover: { seatId: string };
  seatSelect: { seatId: string };
  selectionChange: { selectedSeatIds: string[] };
}
