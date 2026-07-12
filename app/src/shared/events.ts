export interface SeatLayoutSeatInfo {
  readonly seatIndex: number;
  readonly seatId: string;
  readonly sectionId: string;
  readonly sectionName: string;
  readonly rowId: string;
  readonly rowLabel: string;
  readonly seatLabel: string;
}

export type SeatLayoutSeatHoverPayload = SeatLayoutSeatInfo;

export interface SeatLayoutSeatSelectPayload extends SeatLayoutSeatInfo {
  readonly selected: boolean;
}

export interface SeatLayoutSelectionChangePayload {
  readonly selectedIndices: readonly number[];
}

export interface SeatLayoutEvents {
  seatHover: SeatLayoutSeatHoverPayload | null;
  seatSelect: SeatLayoutSeatSelectPayload;
  selectionChange: SeatLayoutSelectionChangePayload;
}

export type SeatLayoutEventName = keyof SeatLayoutEvents;

export type SeatLayoutEventListener<TEvent extends SeatLayoutEventName> = (
  payload: SeatLayoutEvents[TEvent],
) => void;

type ListenerMap = {
  [TEvent in SeatLayoutEventName]?: Set<SeatLayoutEventListener<TEvent>>;
};

export class SeatLayoutEventEmitter {
  private readonly listeners: ListenerMap = {};

  on<TEvent extends SeatLayoutEventName>(
    type: TEvent,
    listener: SeatLayoutEventListener<TEvent>,
  ): () => void {
    let listeners = this.listeners[type] as Set<SeatLayoutEventListener<TEvent>> | undefined;

    if (!listeners) {
      listeners = new Set<SeatLayoutEventListener<TEvent>>();
      this.listeners[type] = listeners as ListenerMap[TEvent];
    }

    listeners.add(listener);
    return () => {
      this.off(type, listener);
    };
  }

  off<TEvent extends SeatLayoutEventName>(
    type: TEvent,
    listener: SeatLayoutEventListener<TEvent>,
  ): void {
    const listeners = this.listeners[type] as Set<SeatLayoutEventListener<TEvent>> | undefined;
    listeners?.delete(listener);
  }

  addEventListener<TEvent extends SeatLayoutEventName>(
    type: TEvent,
    listener: SeatLayoutEventListener<TEvent>,
  ): void {
    this.on(type, listener);
  }

  removeEventListener<TEvent extends SeatLayoutEventName>(
    type: TEvent,
    listener: SeatLayoutEventListener<TEvent>,
  ): void {
    this.off(type, listener);
  }

  emit<TEvent extends SeatLayoutEventName>(type: TEvent, payload: SeatLayoutEvents[TEvent]): void {
    const listeners = this.listeners[type] as Set<SeatLayoutEventListener<TEvent>> | undefined;

    if (!listeners || listeners.size === 0) {
      return;
    }

    for (const listener of [...listeners]) {
      listener(payload);
    }
  }
}
