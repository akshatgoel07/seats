import { describe, expect, it } from 'vitest';

import {
  SeatLayoutEventEmitter,
  type SeatLayoutEvents,
  type SeatLayoutSeatInfo,
} from '../../shared/events';

const seatInfo: SeatLayoutSeatInfo = {
  seatIndex: 7,
  seatId: 'seat-7',
  sectionId: 'section-a',
  sectionName: 'Section A',
  rowId: 'row-b',
  rowLabel: 'B',
  seatLabel: '12',
};

describe('SeatLayoutEventEmitter', () => {
  it('subscribes with on, removes with off, and returns an unsubscribe function', () => {
    const emitter = new SeatLayoutEventEmitter();
    const selections: SeatLayoutEvents['selectionChange'][] = [];
    const listener = (payload: SeatLayoutEvents['selectionChange']) => {
      selections.push(payload);
    };

    const unsubscribe = emitter.on('selectionChange', listener);
    emitter.emit('selectionChange', { selectedIndices: [1, 3] });
    unsubscribe();
    emitter.emit('selectionChange', { selectedIndices: [5] });

    emitter.on('selectionChange', listener);
    emitter.off('selectionChange', listener);
    emitter.emit('selectionChange', { selectedIndices: [8] });

    expect(selections).toEqual([{ selectedIndices: [1, 3] }]);
  });

  it('supports addEventListener-style subscriptions and nullable hover payloads', () => {
    const emitter = new SeatLayoutEventEmitter();
    const hovers: SeatLayoutEvents['seatHover'][] = [];
    const listener = (payload: SeatLayoutEvents['seatHover']) => {
      hovers.push(payload);
    };

    emitter.addEventListener('seatHover', listener);
    emitter.emit('seatHover', seatInfo);
    emitter.emit('seatHover', null);
    emitter.removeEventListener('seatHover', listener);
    emitter.emit('seatHover', seatInfo);

    expect(hovers).toEqual([seatInfo, null]);
  });
});
