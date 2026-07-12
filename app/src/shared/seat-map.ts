export interface SeatMapSeat {
  readonly id: string;
}

export interface SeatMapDocument {
  readonly id: string;
  readonly seats: SeatMapSeat[];
}
