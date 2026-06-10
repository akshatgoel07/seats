/**
 * Test Suite for Seat Naming Convention
 *
 * Validates that the seat naming system scales correctly for 2000+ seats
 */

import {
  getRowLabel,
  parseRowLabel,
  generateSeatLabel,
  parseSeatLabel,
  isValidSeatLabel,
  generateRowSeatLabels,
} from '../seatNaming.ts';

describe('Seat Naming Convention', () => {
  describe('getRowLabel', () => {
    test('should convert single-letter rows correctly', () => {
      expect(getRowLabel(0)).toBe('A');
      expect(getRowLabel(1)).toBe('B');
      expect(getRowLabel(25)).toBe('Z');
    });

    test('should convert double-letter rows correctly', () => {
      expect(getRowLabel(26)).toBe('AA');
      expect(getRowLabel(27)).toBe('AB');
      expect(getRowLabel(51)).toBe('AZ');
      expect(getRowLabel(52)).toBe('BA');
      expect(getRowLabel(701)).toBe('ZZ');
    });

    test('should convert triple-letter rows correctly', () => {
      expect(getRowLabel(702)).toBe('AAA');
      expect(getRowLabel(703)).toBe('AAB');
      expect(getRowLabel(727)).toBe('AAZ');
      expect(getRowLabel(728)).toBe('ABA');
    });

    test('should handle negative indices', () => {
      expect(getRowLabel(-1)).toBe('A');
      expect(getRowLabel(-100)).toBe('A');
    });

    test('should scale to 2000+ rows', () => {
      // Row index 2000 should be "BXY"
      const label2000 = getRowLabel(2000);
      expect(label2000).toBe('BXY');
      expect(label2000.length).toBeGreaterThan(0);

      // Row index 5000 (bijective base-26: 5000 -> "GJI")
      const label5000 = getRowLabel(5000);
      expect(label5000).toBe('GJI');
      expect(label5000.length).toBeGreaterThan(0);
    });
  });

  describe('parseRowLabel', () => {
    test('should parse single-letter rows correctly', () => {
      expect(parseRowLabel('A')).toBe(0);
      expect(parseRowLabel('B')).toBe(1);
      expect(parseRowLabel('Z')).toBe(25);
    });

    test('should parse double-letter rows correctly', () => {
      expect(parseRowLabel('AA')).toBe(26);
      expect(parseRowLabel('AB')).toBe(27);
      expect(parseRowLabel('AZ')).toBe(51);
      expect(parseRowLabel('BA')).toBe(52);
      expect(parseRowLabel('ZZ')).toBe(701);
    });

    test('should parse triple-letter rows correctly', () => {
      expect(parseRowLabel('AAA')).toBe(702);
      expect(parseRowLabel('AAB')).toBe(703);
      expect(parseRowLabel('BXY')).toBe(2000);
      expect(parseRowLabel('GJI')).toBe(5000);
    });

    test('should be case-insensitive', () => {
      expect(parseRowLabel('a')).toBe(0);
      expect(parseRowLabel('aa')).toBe(26);
      expect(parseRowLabel('bxy')).toBe(2000);
    });

    test('should handle invalid inputs', () => {
      expect(parseRowLabel('')).toBe(0);
      expect(parseRowLabel(null)).toBe(0);
      expect(parseRowLabel('123')).toBe(0);
      expect(parseRowLabel('A1B')).toBe(0);
    });
  });

  describe('generateSeatLabel', () => {
    test('should generate labels correctly', () => {
      expect(generateSeatLabel(0, 1)).toBe('A-1');
      expect(generateSeatLabel(0, 50)).toBe('A-50');
      expect(generateSeatLabel(1, 1)).toBe('B-1');
      expect(generateSeatLabel(25, 10)).toBe('Z-10');
    });

    test('should handle double-letter rows', () => {
      expect(generateSeatLabel(26, 1)).toBe('AA-1');
      expect(generateSeatLabel(26, 100)).toBe('AA-100');
      expect(generateSeatLabel(701, 50)).toBe('ZZ-50');
    });

    test('should handle triple-letter rows', () => {
      expect(generateSeatLabel(702, 1)).toBe('AAA-1');
      expect(generateSeatLabel(2000, 200)).toBe('BXY-200');
    });

    test('should scale to 2000+ seats per row', () => {
      expect(generateSeatLabel(0, 2500)).toBe('A-2500');
      expect(generateSeatLabel(100, 3000)).toBe('CW-3000');
    });
  });

  describe('parseSeatLabel', () => {
    test('should parse labels correctly', () => {
      expect(parseSeatLabel('A-1')).toEqual({ rowIndex: 0, seatNumber: 1 });
      expect(parseSeatLabel('B-50')).toEqual({ rowIndex: 1, seatNumber: 50 });
      expect(parseSeatLabel('Z-100')).toEqual({ rowIndex: 25, seatNumber: 100 });
    });

    test('should parse double-letter rows', () => {
      expect(parseSeatLabel('AA-1')).toEqual({ rowIndex: 26, seatNumber: 1 });
      expect(parseSeatLabel('ZZ-500')).toEqual({ rowIndex: 701, seatNumber: 500 });
    });

    test('should parse triple-letter rows', () => {
      expect(parseSeatLabel('AAA-1')).toEqual({ rowIndex: 702, seatNumber: 1 });
      expect(parseSeatLabel('BXY-200')).toEqual({ rowIndex: 2000, seatNumber: 200 });
    });

    test('should handle invalid inputs', () => {
      expect(parseSeatLabel('')).toEqual({ rowIndex: 0, seatNumber: 1 });
      expect(parseSeatLabel(null)).toEqual({ rowIndex: 0, seatNumber: 1 });
      expect(parseSeatLabel('A')).toEqual({ rowIndex: 0, seatNumber: 1 });
      expect(parseSeatLabel('A-')).toEqual({ rowIndex: 0, seatNumber: 1 });
      expect(parseSeatLabel('-1')).toEqual({ rowIndex: 0, seatNumber: 1 });
      expect(parseSeatLabel('A-0')).toEqual({ rowIndex: 0, seatNumber: 1 });
    });
  });

  describe('isValidSeatLabel', () => {
    test('should validate correct labels', () => {
      expect(isValidSeatLabel('A-1')).toBe(true);
      expect(isValidSeatLabel('Z-100')).toBe(true);
      expect(isValidSeatLabel('AA-1')).toBe(true);
      expect(isValidSeatLabel('ZZ-500')).toBe(true);
      expect(isValidSeatLabel('AAA-1')).toBe(true);
      expect(isValidSeatLabel('BXY-2500')).toBe(true);
    });

    test('should reject invalid labels', () => {
      expect(isValidSeatLabel('')).toBe(false);
      expect(isValidSeatLabel(null)).toBe(false);
      expect(isValidSeatLabel('A')).toBe(false);
      expect(isValidSeatLabel('A-')).toBe(false);
      expect(isValidSeatLabel('-1')).toBe(false);
      expect(isValidSeatLabel('1-A')).toBe(false);
      expect(isValidSeatLabel('A1')).toBe(false);
      expect(isValidSeatLabel('a-1')).toBe(false); // lowercase not valid
    });
  });

  describe('generateRowSeatLabels', () => {
    test('should generate all labels for a row', () => {
      const labels = generateRowSeatLabels(0, 5);
      expect(labels).toEqual(['A-1', 'A-2', 'A-3', 'A-4', 'A-5']);
    });

    test('should work for any row', () => {
      const labels = generateRowSeatLabels(26, 3);
      expect(labels).toEqual(['AA-1', 'AA-2', 'AA-3']);
    });

    test('should handle large seat counts', () => {
      const labels = generateRowSeatLabels(0, 100);
      expect(labels.length).toBe(100);
      expect(labels[0]).toBe('A-1');
      expect(labels[99]).toBe('A-100');
    });
  });

  describe('Round-trip conversions', () => {
    test('should convert row index -> label -> index correctly', () => {
      for (let i = 0; i < 1000; i++) {
        const label = getRowLabel(i);
        const parsed = parseRowLabel(label);
        expect(parsed).toBe(i);
      }
    });

    test('should convert seat label -> parse -> generate correctly', () => {
      const testCases = [
        [0, 1],
        [25, 100],
        [26, 1],
        [701, 500],
        [702, 1],
        [2000, 2500],
      ];

      testCases.forEach(([rowIndex, seatNumber]) => {
        const label = generateSeatLabel(rowIndex, seatNumber);
        const parsed = parseSeatLabel(label);
        expect(parsed.rowIndex).toBe(rowIndex);
        expect(parsed.seatNumber).toBe(seatNumber);
      });
    });
  });

  describe('Scalability for 2000+ seats', () => {
    test('should handle venue with 100 rows and 50 seats each', () => {
      const totalSeats = 100 * 50;
      expect(totalSeats).toBe(5000);

      // Last row (index 99) should be "CV"
      const lastRowLabel = getRowLabel(99);
      expect(lastRowLabel).toBe('CV');

      // Last seat should be "CV-50"
      const lastSeatLabel = generateSeatLabel(99, 50);
      expect(lastSeatLabel).toBe('CV-50');
    });

    test('should handle venue with 50 rows and 100 seats each', () => {
      const totalSeats = 50 * 100;
      expect(totalSeats).toBe(5000);

      // Last row (index 49) should be "AX"
      const lastRowLabel = getRowLabel(49);
      expect(lastRowLabel).toBe('AX');

      // Last seat should be "AX-100"
      const lastSeatLabel = generateSeatLabel(49, 100);
      expect(lastSeatLabel).toBe('AX-100');
    });

    test('should handle stadium with 200 rows and 20 seats each', () => {
      const totalSeats = 200 * 20;
      expect(totalSeats).toBe(4000);

      // Row 200 (index 199) is bijective base-26 column 200 -> "GR"
      const row200Label = getRowLabel(199);
      expect(row200Label).toBe('GR');

      // Last seat should be "GR-20"
      const lastSeatLabel = generateSeatLabel(199, 20);
      expect(lastSeatLabel).toBe('GR-20');
    });

    test('should handle arena with 26 rows and 100 seats each', () => {
      const totalSeats = 26 * 100;
      expect(totalSeats).toBe(2600);

      // Rows should go from A to Z (indices 0-25)
      expect(getRowLabel(0)).toBe('A');
      expect(getRowLabel(25)).toBe('Z');

      // Generate all seat labels
      const allLabels = [];
      for (let row = 0; row < 26; row++) {
        for (let seat = 1; seat <= 100; seat++) {
          allLabels.push(generateSeatLabel(row, seat));
        }
      }

      expect(allLabels.length).toBe(2600);
      expect(allLabels[0]).toBe('A-1');
      expect(allLabels[2599]).toBe('Z-100');

      // All labels should be unique
      const uniqueLabels = new Set(allLabels);
      expect(uniqueLabels.size).toBe(2600);
    });
  });
});
