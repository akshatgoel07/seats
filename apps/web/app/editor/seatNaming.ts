/**
 * Seat Naming Utilities
 *
 * Provides scalable seat naming conventions that can handle 2000+ seats.
 * Uses Excel-style column naming: A, B, C, ... Z, AA, AB, ... ZZ, AAA, etc.
 *
 * Seat format: {RowLabel}-{SeatNumber}
 * Examples: A-1, A-2, B-1, Z-50, AA-1, AB-5, ZZ-100
 */

/**
 * Converts a row index (0-based) to an Excel-style column letter.
 *
 * Examples:
 *   0 -> A
 *   1 -> B
 *   25 -> Z
 *   26 -> AA
 *   27 -> AB
 *   701 -> ZZ
 *   702 -> AAA
 *
 * This supports up to 18,278 rows (A-ZZZ) which is more than enough for any venue.
 *
 * @param {number} index - Zero-based row index
 * @returns {string} Row letter(s)
 */
export function getRowLabel(index: number): string {
  if (index < 0) {
    return 'A';
  }

  let label = '';
  let num = index;

  // Convert to base-26 with A=0, B=1, ..., Z=25
  while (num >= 0) {
    label = String.fromCharCode(65 + (num % 26)) + label;
    num = Math.floor(num / 26) - 1;
  }

  return label;
}

/**
 * Converts a row label back to a zero-based index.
 *
 * Examples:
 *   A -> 0
 *   B -> 1
 *   Z -> 25
 *   AA -> 26
 *   AB -> 27
 *   ZZ -> 701
 *   AAA -> 702
 *
 * @param {string} label - Row label (e.g., "A", "AA", "ZZ")
 * @returns {number} Zero-based row index
 */
export function parseRowLabel(label: string | null | undefined): number {
  if (!label || typeof label !== 'string') {
    return 0;
  }

  const normalized = label.toUpperCase();
  let index = 0;

  for (let i = 0; i < normalized.length; i++) {
    const charCode = normalized.charCodeAt(i);

    // Validate character is A-Z
    if (charCode < 65 || charCode > 90) {
      return 0;
    }

    index = index * 26 + (charCode - 64);
  }

  return index - 1; // Convert to zero-based
}

/**
 * Generates a complete seat label with row and seat number.
 *
 * Format: {RowLabel}-{SeatNumber}
 *
 * Examples:
 *   (0, 1) -> A-1
 *   (0, 50) -> A-50
 *   (25, 1) -> Z-1
 *   (26, 15) -> AA-15
 *   (100, 200) -> CW-200
 *
 * @param {number} rowIndex - Zero-based row index
 * @param {number} seatNumber - One-based seat number (typically 1, 2, 3, ...)
 * @returns {string} Complete seat label
 */
export function generateSeatLabel(rowIndex: number, seatNumber: number): string {
  const rowLabel = getRowLabel(rowIndex);
  return `${rowLabel}-${seatNumber}`;
}

/**
 * Parses a complete seat label back to row index and seat number.
 *
 * Examples:
 *   "A-1" -> { rowIndex: 0, seatNumber: 1 }
 *   "AA-15" -> { rowIndex: 26, seatNumber: 15 }
 *   "ZZ-100" -> { rowIndex: 701, seatNumber: 100 }
 *
 * @param {string} label - Complete seat label (e.g., "A-1", "AA-15")
 * @returns {{rowIndex: number, seatNumber: number}} Parsed components
 */
export function parseSeatLabel(
  label: string | null | undefined,
): { rowIndex: number; seatNumber: number } {
  if (!label || typeof label !== 'string') {
    return { rowIndex: 0, seatNumber: 1 };
  }

  const parts = label.split('-');
  if (parts.length !== 2) {
    return { rowIndex: 0, seatNumber: 1 };
  }

  const rowLabel = parts[0];
  const seatNumber = parseInt(parts[1]);

  if (isNaN(seatNumber) || seatNumber < 1) {
    return { rowIndex: 0, seatNumber: 1 };
  }

  const rowIndex = parseRowLabel(rowLabel);

  return { rowIndex, seatNumber };
}

/**
 * Gets the row letter for a given row ID within a scene context.
 * This looks up the actual row index from the rows object.
 *
 * @param {Object} rows - Scene rows object (keyed by row ID)
 * @param {string} rowId - The row ID to look up
 * @returns {string} Row label (e.g., "A", "B", "AA")
 */
export function getRowLabelForRowId(
  rows: Record<string, unknown>,
  rowId: string,
): string {
  const rowIds = Object.keys(rows);
  const rowIndex = rowIds.indexOf(rowId);

  if (rowIndex === -1) {
    return 'A'; // Default fallback
  }

  return getRowLabel(rowIndex);
}

/**
 * Validates a seat label format.
 *
 * @param {string} label - Seat label to validate
 * @returns {boolean} True if valid format
 */
export function isValidSeatLabel(label: string | null | undefined): boolean {
  if (!label || typeof label !== 'string') {
    return false;
  }

  const pattern = /^[A-Z]+\-\d+$/;
  return pattern.test(label);
}

/**
 * Generates labels for all seats in a row.
 *
 * @param {number} rowIndex - Zero-based row index
 * @param {number} seatCount - Number of seats in the row
 * @returns {string[]} Array of seat labels
 */
export function generateRowSeatLabels(rowIndex: number, seatCount: number): string[] {
  const labels: string[] = [];
  for (let i = 1; i <= seatCount; i++) {
    labels.push(generateSeatLabel(rowIndex, i));
  }
  return labels;
}
