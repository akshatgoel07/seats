// API client for the seat-layout Go backend (/v1).
//
// The backend uses a consistent envelope: success responses are
// { "data": <payload> } and errors are { "error": { code, message } }.
// This client unwraps `data` and throws an Error carrying the API message on
// failure. Configure the base URL via NEXT_PUBLIC_API_BASE_URL.

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export type JSONObject = { [key: string]: JSONValue };

export interface ApiEnvelope<T> {
  data: T;
  meta?: unknown;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

type APIClientError = Error & {
  status?: number;
  code?: string;
};

type RequestOptions = {
  method?: string;
  body?: unknown;
  raw?: boolean;
};

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface Venue {
  id: string;
  name: string;
  metadata?: JSONObject;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  venueId: string;
  name: string;
  color: string;
  priceCents: number;
  isStanding: boolean;
  externalRef?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SceneCategory {
  id: string;
  name: string;
  color: string;
  price: number;
  screen_seat_type_id?: number;
  is_open_seating_area?: string;
  sst_no_of_seats?: number;
}

export interface SceneVenue {
  id: string;
  name: string;
  sections: string[];
  categories: SceneCategory[];
}

export interface Scene {
  venue: SceneVenue;
  sections: Record<string, unknown>;
  rows: Record<string, unknown>;
  seats: Record<string, unknown>;
  elements: Record<string, unknown>;
  view?: unknown;
  showSectionBoundaryInRenderer?: boolean;
}

export interface Layout {
  id: string;
  venueId: string;
  name: string;
  status: string;
  scene: Scene;
  rowCount: number;
  colCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlatSeat {
  seatUid: string;
  label: string;
  rowLabel: string;
  rowNum: number;
  colNum: number;
  categoryId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isStanding: boolean;
  standingSectionId?: string;
}

export interface Show {
  id: string;
  layoutId: string;
  name: string;
  startsAt?: string;
  status: string;
  externalRef?: string;
  createdAt: string;
}

export interface SeatStatus {
  seatUid: string;
  state: number;
  reserveType: number;
  priceCents: number;
  holdId?: string;
  bookingId?: string;
}

export interface Hold {
  id: string;
  showId: string;
  status: string;
  seatUids: string[];
  expiresAt: string;
  createdAt: string;
}

export interface Booking {
  id: string;
  showId: string;
  holdId?: string;
  status: string;
  seatUids: string[];
  customer?: JSONObject;
  createdAt: string;
}

export interface ShowSeatsPayload {
  show: Show;
  scene: Scene;
  seats: FlatSeat[];
  status: SeatStatus[];
}

export interface LayoutMetaUpdate {
  name?: string;
  status?: string;
}

export interface CreateShowInput {
  name?: string;
  startsAt?: string;
  status?: string;
  externalRef?: string;
}

export interface SeatStateUpdate {
  seatUid: string;
  state?: number;
  reserveType?: number;
  priceCents?: number;
}

export interface BookingInput {
  holdId?: string;
  seatUids?: string[];
  customer?: JSONObject;
}

async function request<T>(
  path: string,
  { method = "GET", body, raw = false }: RequestOptions = {},
): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    opts.body = raw ? (body as BodyInit) : JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, opts);

  if (res.status === 204) return null as T;

  let payload: ApiEnvelope<T> | ApiErrorBody | null = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text) as ApiEnvelope<T> | ApiErrorBody;
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const apiError = payload && "error" in payload ? payload.error : null;
    const msg = apiError?.message || `HTTP ${res.status} for ${method} ${path}`;
    const err = new Error(msg) as APIClientError;
    err.status = res.status;
    err.code = apiError?.code;
    throw err;
  }

  return payload && "data" in payload ? payload.data : (null as T);
}

export class ApiService {
  static listVenues({
    limit = 50,
    offset = 0,
  }: PaginationOptions = {}): Promise<Venue[]> {
    return request(`/v1/venues?limit=${limit}&offset=${offset}`);
  }

  static createVenue(
    name: string,
    metadata?: JSONObject,
  ): Promise<Venue> {
    return request(`/v1/venues`, { method: "POST", body: { name, metadata } });
  }

  static getVenue(venueId: string): Promise<Venue> {
    return request(`/v1/venues/${venueId}`);
  }

  static listCategories(venueId: string): Promise<Category[]> {
    return request(`/v1/venues/${venueId}/categories`);
  }

  static listLayouts(
    venueId: string,
    { limit = 50, offset = 0 }: PaginationOptions = {},
  ): Promise<Layout[]> {
    return request(
      `/v1/venues/${venueId}/layouts?limit=${limit}&offset=${offset}`,
    );
  }

  static createLayout(venueId: string, name: string): Promise<Layout> {
    return request(`/v1/venues/${venueId}/layouts`, {
      method: "POST",
      body: { name },
    });
  }

  static getLayout(layoutId: string): Promise<Layout> {
    return request(`/v1/layouts/${layoutId}`);
  }

  static saveLayout(layoutId: string, scene: unknown): Promise<Layout> {
    return request(`/v1/layouts/${layoutId}`, {
      method: "PUT",
      raw: true,
      body: JSON.stringify(scene),
    });
  }

  static updateLayoutMeta(
    layoutId: string,
    { name, status }: LayoutMetaUpdate = {},
  ): Promise<Layout> {
    return request(`/v1/layouts/${layoutId}`, {
      method: "PATCH",
      body: { name, status },
    });
  }

  static publishLayout(layoutId: string): Promise<Layout> {
    return request(`/v1/layouts/${layoutId}/publish`, { method: "POST" });
  }

  static getLayoutSeats(layoutId: string): Promise<FlatSeat[]> {
    return request(`/v1/layouts/${layoutId}/seats`);
  }

  static listShows(layoutId: string): Promise<Show[]> {
    return request(`/v1/layouts/${layoutId}/shows`);
  }

  static createShow(
    layoutId: string,
    { name, startsAt, status, externalRef }: CreateShowInput = {},
  ): Promise<Show> {
    return request(`/v1/layouts/${layoutId}/shows`, {
      method: "POST",
      body: { name, startsAt, status, externalRef },
    });
  }

  static getShow(showId: string): Promise<Show> {
    return request(`/v1/shows/${showId}`);
  }

  static getShowSeats(showId: string): Promise<ShowSeatsPayload> {
    return request(`/v1/shows/${showId}/seats`);
  }

  static patchShowSeats(
    showId: string,
    updates: SeatStateUpdate[],
  ): Promise<{ updated: number }> {
    return request(`/v1/shows/${showId}/seats`, {
      method: "PATCH",
      body: { updates },
    });
  }

  static createHold(
    showId: string,
    seatUids: string[],
    ttlSeconds?: number,
  ): Promise<Hold> {
    return request(`/v1/shows/${showId}/holds`, {
      method: "POST",
      body: { seatUids, ttlSeconds },
    });
  }

  static releaseHold(holdId: string): Promise<null> {
    return request(`/v1/holds/${holdId}`, { method: "DELETE" });
  }

  static createBooking(
    showId: string,
    { holdId, seatUids, customer }: BookingInput = {},
  ): Promise<Booking> {
    return request(`/v1/shows/${showId}/bookings`, {
      method: "POST",
      body: { holdId, seatUids, customer },
    });
  }

  static getBooking(bookingId: string): Promise<Booking> {
    return request(`/v1/bookings/${bookingId}`);
  }
}

export default ApiService;
