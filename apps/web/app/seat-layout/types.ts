import type { Dispatch, RefObject, SetStateAction } from "react";

export type Point = { x: number; y: number };

export type ViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ContentBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

export type RendererSeat = {
  sl_id: string;
  sl_seat_name?: string;
  sl_seat_status?: string;
  sl_meta_data?: string;
  seat_reserve_type_id?: number | string | null;
  screen_seat_type_id?: string;
  sst_seat_type?: string;
  is_open_seating_area?: string | null;
  selectStatus?: boolean;
  position: Point & { rotation?: number };
  dimensions?: {
    width?: number;
    height?: number;
  };
};

export type SeatMap = Record<string, RendererSeat>;

export type SeatSpatialIndex = {
  cellSize: number;
  cells: Map<string, string[]>;
};

export type SeatType = {
  sst_id: string;
  sst_seat_type: string;
  sst_seat_color_code: string;
  sst_order?: number;
  is_open_seating_area?: string;
  sst_is_active?: string;
  seat_price?: number;
};

export type LayoutRecord = {
  sl_id: string;
  sl_seat_name?: string;
  sl_seat_status?: string;
  sl_meta_data: string;
  seat_price?: number;
  seat_reserve_type_id?: number | string | null;
  screen_seat_type_id?: string;
  is_open_seating_area?: string | null;
  sst_seat_type?: string;
  [key: string]: unknown;
};

export type LayoutData = {
  status?: boolean;
  Records?: LayoutRecord[];
  screen_seat_type?: SeatType[];
  screenDetails?: Array<{ screen_meta_data?: string; screen_name?: string }>;
};

export type CurveHandle = {
  cp1?: Point;
  cp2?: Point;
};

export type CurveHandles = Record<number, CurveHandle>;

export type RendererElement = {
  type?: string;
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale?: number;
  rotation?: number;
  radius?: number;
  points?: Point[];
  curveHandles?: CurveHandles;
  pathBoundary?: {
    points?: Point[];
    curveHandles?: CurveHandles;
  };
  label?: string;
  sectionName?: string;
  text?: string;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  opacity?: number;
  borderRadius?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  src?: string;
  labelX?: number;
  labelY?: number;
  labelFontSize?: number;
  labelRotation?: number;
  textAlign?: string;
};

export type StandingSectionElement = RendererElement & {
  id: string;
  width: number;
  height: number;
  name?: string;
  price?: number;
};

export type RendererScene = {
  elements?: Record<string, RendererElement>;
  seats?: Record<string, {
    localX?: number;
    localY?: number;
    width?: number;
    height?: number;
    position?: Point;
    dimensions?: { width?: number; height?: number };
  }>;
};

export type ViewBoxSetter = Dispatch<SetStateAction<ViewBox>>;

export type SVGRef = RefObject<SVGSVGElement | null>;
