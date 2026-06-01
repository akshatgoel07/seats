// API client for the seat-layout Go backend (/v1).
//
// The backend uses a consistent envelope: success responses are
// { "data": <payload> } and errors are { "error": { code, message } }.
// This client unwraps `data` and throws an Error carrying the API message on
// failure. Configure the base URL via NEXT_PUBLIC_API_BASE_URL.

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

/**
 * @param {string} path
 * @param {{ method?: string, body?: any, raw?: boolean, headers?: Record<string, string> }} [options]
 * @returns {Promise<any>}
 */
async function request(path, { method = "GET", body, raw = false } = {}) {
  /** @type {{ method: string, headers: Record<string, string>, body?: any }} */
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    opts.body = raw ? body : JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, opts);

  // 204 No Content
  if (res.status === 204) return null;

  let payload = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const msg =
      payload?.error?.message || `HTTP ${res.status} for ${method} ${path}`;
    const err = /** @type {Error & { status?: number, code?: any }} */ (
      new Error(msg)
    );
    err.status = res.status;
    err.code = payload?.error?.code;
    throw err;
  }

  return payload ? payload.data : null;
}

export class ApiService {
  // ---- Venues ----
  static listVenues({ limit = 50, offset = 0 } = {}) {
    return request(`/v1/venues?limit=${limit}&offset=${offset}`);
  }
  static createVenue(name, metadata) {
    return request(`/v1/venues`, { method: "POST", body: { name, metadata } });
  }
  static getVenue(venueId) {
    return request(`/v1/venues/${venueId}`);
  }

  // ---- Categories ----
  static listCategories(venueId) {
    return request(`/v1/venues/${venueId}/categories`);
  }

  // ---- Layouts ----
  static listLayouts(venueId, { limit = 50, offset = 0 } = {}) {
    return request(
      `/v1/venues/${venueId}/layouts?limit=${limit}&offset=${offset}`,
    );
  }
  static createLayout(venueId, name) {
    return request(`/v1/venues/${venueId}/layouts`, {
      method: "POST",
      body: { name },
    });
  }
  // Returns the full layout record, including `scene` (the editor document).
  static getLayout(layoutId) {
    return request(`/v1/layouts/${layoutId}`);
  }
  // Persists the editor scene. The backend flattens seats server-side.
  static saveLayout(layoutId, scene) {
    return request(`/v1/layouts/${layoutId}`, {
      method: "PUT",
      raw: true,
      body: JSON.stringify(scene),
    });
  }
  /**
   * @param {string} layoutId
   * @param {{ name?: string, status?: string }} [meta]
   */
  static updateLayoutMeta(layoutId, { name, status } = {}) {
    return request(`/v1/layouts/${layoutId}`, {
      method: "PATCH",
      body: { name, status },
    });
  }
  static publishLayout(layoutId) {
    return request(`/v1/layouts/${layoutId}/publish`, { method: "POST" });
  }
  // Derived flat seat list (no scene parsing needed) — handy for integrations.
  static getLayoutSeats(layoutId) {
    return request(`/v1/layouts/${layoutId}/seats`);
  }

  // ---- Shows (per-instance availability) ----
  static listShows(layoutId) {
    return request(`/v1/layouts/${layoutId}/shows`);
  }
  /**
   * @param {string} layoutId
   * @param {{ name?: string, startsAt?: string, status?: string, externalRef?: string }} [show]
   */
  static createShow(layoutId, { name, startsAt, status, externalRef } = {}) {
    return request(`/v1/layouts/${layoutId}/shows`, {
      method: "POST",
      body: { name, startsAt, status, externalRef },
    });
  }
  static getShow(showId) {
    return request(`/v1/shows/${showId}`);
  }
  // The customer-render payload: { show, scene, seats[], status[] }.
  static getShowSeats(showId) {
    return request(`/v1/shows/${showId}/seats`);
  }
  static patchShowSeats(showId, updates) {
    return request(`/v1/shows/${showId}/seats`, {
      method: "PATCH",
      body: { updates },
    });
  }

  // ---- Holds & Bookings ----
  static createHold(showId, seatUids, ttlSeconds) {
    return request(`/v1/shows/${showId}/holds`, {
      method: "POST",
      body: { seatUids, ttlSeconds },
    });
  }
  static releaseHold(holdId) {
    return request(`/v1/holds/${holdId}`, { method: "DELETE" });
  }
  /**
   * @param {string} showId
   * @param {{ holdId?: string, seatUids?: string[], customer?: any }} [booking]
   */
  static createBooking(showId, { holdId, seatUids, customer } = {}) {
    return request(`/v1/shows/${showId}/bookings`, {
      method: "POST",
      body: { holdId, seatUids, customer },
    });
  }
  static getBooking(bookingId) {
    return request(`/v1/bookings/${bookingId}`);
  }
}

export default ApiService;
