export interface CameraBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface CameraPoint {
  x: number;
  y: number;
}

export interface CameraRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Camera2DOptions {
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
  readonly centerX?: number;
  readonly centerY?: number;
  readonly zoom?: number;
  readonly bounds?: CameraBounds;
}

interface TrackedPointer {
  readonly pointerId: number;
  x: number;
  y: number;
}

interface ScreenLikePointerEvent {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  preventDefault(): void;
}

const MIN_VIEWPORT_SIZE = 1;
const MIN_DOCUMENT_SPAN = 1;
const MIN_ZOOM_FIT_MULTIPLIER = 0.125;
const MAX_ZOOM_FIT_MULTIPLIER = 4096;
const WHEEL_ZOOM_EXPONENT = -0.0015;

export class Camera2D {
  private viewportWidth: number;
  private viewportHeight: number;
  private zoom: number;
  private centerX: number;
  private centerY: number;
  private bounds: CameraBounds | null;
  private minZoom = 0.001;
  private maxZoom = 1_000_000;
  private readonly viewProjection = new Float32Array(16);
  private viewProjectionDirty = true;
  private readonly activePointers = new Map<number, TrackedPointer>();

  constructor(options: Camera2DOptions = {}) {
    this.viewportWidth = Math.max(MIN_VIEWPORT_SIZE, options.viewportWidth ?? 1);
    this.viewportHeight = Math.max(MIN_VIEWPORT_SIZE, options.viewportHeight ?? 1);
    this.zoom = options.zoom ?? 1;
    this.centerX = options.centerX ?? 0;
    this.centerY = options.centerY ?? 0;
    this.bounds = options.bounds ?? null;
    this.updateZoomLimits();
    this.zoom = this.clampZoom(this.zoom);
    this.clampCenter();
  }

  getZoom(): number {
    return this.zoom;
  }

  getZoomLimits(): { min: number; max: number } {
    return { min: this.minZoom, max: this.maxZoom };
  }

  getCenter(out: CameraPoint = { x: 0, y: 0 }): CameraPoint {
    out.x = this.centerX;
    out.y = this.centerY;
    return out;
  }

  getViewportSize(): { width: number; height: number } {
    return { width: this.viewportWidth, height: this.viewportHeight };
  }

  setViewportSize(width: number, height: number): boolean {
    const nextWidth = Math.max(MIN_VIEWPORT_SIZE, Math.floor(width));
    const nextHeight = Math.max(MIN_VIEWPORT_SIZE, Math.floor(height));

    if (nextWidth === this.viewportWidth && nextHeight === this.viewportHeight) {
      return false;
    }

    this.viewportWidth = nextWidth;
    this.viewportHeight = nextHeight;
    this.updateZoomLimits();
    this.zoom = this.clampZoom(this.zoom);
    this.clampCenter();
    this.viewProjectionDirty = true;
    return true;
  }

  setDocumentBounds(bounds: CameraBounds): void {
    this.bounds = normalizeBounds(bounds);
    this.updateZoomLimits();
    this.zoom = this.clampZoom(this.zoom);
    this.clampCenter();
    this.viewProjectionDirty = true;
  }

  fitToBounds(bounds: CameraBounds, paddingPixels = 32): void {
    const normalizedBounds = normalizeBounds(bounds);
    this.bounds = normalizedBounds;
    this.updateZoomLimits();

    const contentWidth = Math.max(MIN_DOCUMENT_SPAN, normalizedBounds.maxX - normalizedBounds.minX);
    const contentHeight = Math.max(
      MIN_DOCUMENT_SPAN,
      normalizedBounds.maxY - normalizedBounds.minY,
    );
    const paddedWidth = Math.max(MIN_VIEWPORT_SIZE, this.viewportWidth - paddingPixels * 2);
    const paddedHeight = Math.max(MIN_VIEWPORT_SIZE, this.viewportHeight - paddingPixels * 2);

    this.centerX = (normalizedBounds.minX + normalizedBounds.maxX) * 0.5;
    this.centerY = (normalizedBounds.minY + normalizedBounds.maxY) * 0.5;
    this.zoom = this.clampZoom(Math.min(paddedWidth / contentWidth, paddedHeight / contentHeight));
    this.clampCenter();
    this.viewProjectionDirty = true;
  }

  setView(centerX: number, centerY: number, zoom: number): boolean {
    const previousCenterX = this.centerX;
    const previousCenterY = this.centerY;
    const previousZoom = this.zoom;

    this.centerX = centerX;
    this.centerY = centerY;
    this.zoom = this.clampZoom(zoom);
    this.clampCenter();
    this.viewProjectionDirty = true;

    return (
      previousCenterX !== this.centerX ||
      previousCenterY !== this.centerY ||
      previousZoom !== this.zoom
    );
  }

  panByScreenDelta(deltaX: number, deltaY: number): boolean {
    if (deltaX === 0 && deltaY === 0) {
      return false;
    }

    const previousCenterX = this.centerX;
    const previousCenterY = this.centerY;

    this.centerX -= deltaX / this.zoom;
    this.centerY -= deltaY / this.zoom;
    this.clampCenter();
    this.viewProjectionDirty = true;

    return previousCenterX !== this.centerX || previousCenterY !== this.centerY;
  }

  zoomAt(screenX: number, screenY: number, factor: number): boolean {
    if (!Number.isFinite(factor) || factor <= 0) {
      return false;
    }

    return this.setZoomAt(screenX, screenY, this.zoom * factor);
  }

  setZoomAt(screenX: number, screenY: number, nextZoom: number): boolean {
    const previousZoom = this.zoom;
    const worldX = this.screenToWorldX(screenX);
    const worldY = this.screenToWorldY(screenY);

    this.zoom = this.clampZoom(nextZoom);
    this.centerX = worldX - (screenX - this.viewportWidth * 0.5) / this.zoom;
    this.centerY = worldY - (screenY - this.viewportHeight * 0.5) / this.zoom;
    this.clampCenter();
    this.viewProjectionDirty = true;

    return previousZoom !== this.zoom;
  }

  worldToScreen(worldX: number, worldY: number, out: CameraPoint = { x: 0, y: 0 }): CameraPoint {
    out.x = (worldX - this.centerX) * this.zoom + this.viewportWidth * 0.5;
    out.y = (worldY - this.centerY) * this.zoom + this.viewportHeight * 0.5;
    return out;
  }

  screenToWorld(screenX: number, screenY: number, out: CameraPoint = { x: 0, y: 0 }): CameraPoint {
    out.x = this.screenToWorldX(screenX);
    out.y = this.screenToWorldY(screenY);
    return out;
  }

  getVisibleWorldRect(marginWorld = 0, out: CameraRect = createEmptyRect()): CameraRect {
    const halfWidth = this.viewportWidth / (2 * this.zoom);
    const halfHeight = this.viewportHeight / (2 * this.zoom);

    out.minX = this.centerX - halfWidth - marginWorld;
    out.minY = this.centerY - halfHeight - marginWorld;
    out.maxX = this.centerX + halfWidth + marginWorld;
    out.maxY = this.centerY + halfHeight + marginWorld;
    return out;
  }

  getViewProjectionMatrix(): Float32Array {
    if (!this.viewProjectionDirty) {
      return this.viewProjection;
    }

    const scaleX = (2 * this.zoom) / this.viewportWidth;
    const scaleY = (-2 * this.zoom) / this.viewportHeight;
    const matrix = this.viewProjection;

    matrix[0] = scaleX;
    matrix[1] = 0;
    matrix[2] = 0;
    matrix[3] = 0;
    matrix[4] = 0;
    matrix[5] = scaleY;
    matrix[6] = 0;
    matrix[7] = 0;
    matrix[8] = 0;
    matrix[9] = 0;
    matrix[10] = 1;
    matrix[11] = 0;
    matrix[12] = -this.centerX * scaleX;
    matrix[13] = -this.centerY * scaleY;
    matrix[14] = 0;
    matrix[15] = 1;

    this.viewProjectionDirty = false;
    return matrix;
  }

  handleWheel(event: WheelEvent, element: HTMLElement, onChange: () => void): void {
    event.preventDefault();
    const screen = this.eventToScreen(event, element);

    if (this.zoomAt(screen.x, screen.y, Math.exp(event.deltaY * WHEEL_ZOOM_EXPONENT))) {
      onChange();
    }
  }

  handlePointerDown(
    event: ScreenLikePointerEvent,
    element: HTMLElement,
    onChange: () => void,
  ): void {
    event.preventDefault();
    const screen = this.eventToScreen(event, element);
    this.activePointers.set(event.pointerId, {
      pointerId: event.pointerId,
      x: screen.x,
      y: screen.y,
    });
    void onChange;
  }

  handlePointerMove(
    event: ScreenLikePointerEvent,
    element: HTMLElement,
    onChange: () => void,
  ): void {
    const pointer = this.activePointers.get(event.pointerId);

    if (!pointer) {
      return;
    }

    event.preventDefault();

    if (this.activePointers.size >= 2) {
      const before = this.firstTwoPointers();
      const beforeMidX = (before.first.x + before.second.x) * 0.5;
      const beforeMidY = (before.first.y + before.second.y) * 0.5;
      const beforeDistance = distanceBetweenPointers(before.first, before.second);
      const anchorWorldX = this.screenToWorldX(beforeMidX);
      const anchorWorldY = this.screenToWorldY(beforeMidY);
      const screen = this.eventToScreen(event, element);

      pointer.x = screen.x;
      pointer.y = screen.y;

      const after = this.firstTwoPointers();
      const afterMidX = (after.first.x + after.second.x) * 0.5;
      const afterMidY = (after.first.y + after.second.y) * 0.5;
      const afterDistance = distanceBetweenPointers(after.first, after.second);

      if (beforeDistance > 0 && afterDistance > 0) {
        const nextZoom = this.zoom * (afterDistance / beforeDistance);
        this.zoom = this.clampZoom(nextZoom);
        this.centerX = anchorWorldX - (afterMidX - this.viewportWidth * 0.5) / this.zoom;
        this.centerY = anchorWorldY - (afterMidY - this.viewportHeight * 0.5) / this.zoom;
        this.clampCenter();
        this.viewProjectionDirty = true;
        onChange();
      }
      return;
    }

    const screen = this.eventToScreen(event, element);
    const deltaX = screen.x - pointer.x;
    const deltaY = screen.y - pointer.y;
    pointer.x = screen.x;
    pointer.y = screen.y;

    if (this.panByScreenDelta(deltaX, deltaY)) {
      onChange();
    }
  }

  handlePointerUp(event: ScreenLikePointerEvent): void {
    event.preventDefault();
    this.activePointers.delete(event.pointerId);
  }

  attachToElement(element: HTMLElement, onChange: () => void): () => void {
    const pointerDown = (event: PointerEvent) => {
      element.setPointerCapture?.(event.pointerId);
      this.handlePointerDown(event, element, onChange);
    };
    const pointerMove = (event: PointerEvent) => {
      this.handlePointerMove(event, element, onChange);
    };
    const pointerUp = (event: PointerEvent) => {
      element.releasePointerCapture?.(event.pointerId);
      this.handlePointerUp(event);
    };
    const wheel = (event: WheelEvent) => {
      this.handleWheel(event, element, onChange);
    };

    element.addEventListener('pointerdown', pointerDown);
    element.addEventListener('pointermove', pointerMove);
    element.addEventListener('pointerup', pointerUp);
    element.addEventListener('pointercancel', pointerUp);
    element.addEventListener('wheel', wheel, { passive: false });

    return () => {
      element.removeEventListener('pointerdown', pointerDown);
      element.removeEventListener('pointermove', pointerMove);
      element.removeEventListener('pointerup', pointerUp);
      element.removeEventListener('pointercancel', pointerUp);
      element.removeEventListener('wheel', wheel);
      this.activePointers.clear();
    };
  }

  private screenToWorldX(screenX: number): number {
    return this.centerX + (screenX - this.viewportWidth * 0.5) / this.zoom;
  }

  private screenToWorldY(screenY: number): number {
    return this.centerY + (screenY - this.viewportHeight * 0.5) / this.zoom;
  }

  private eventToScreen(
    event: Pick<MouseEvent, 'clientX' | 'clientY'>,
    element: HTMLElement,
  ): CameraPoint {
    const rect = element.getBoundingClientRect();
    const scaleX = rect.width > 0 ? this.viewportWidth / rect.width : 1;
    const scaleY = rect.height > 0 ? this.viewportHeight / rect.height : 1;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  private firstTwoPointers(): { first: TrackedPointer; second: TrackedPointer } {
    const iterator = this.activePointers.values();
    const first = iterator.next().value;
    const second = iterator.next().value;

    if (!first || !second) {
      throw new Error('Expected two active pointers');
    }

    return { first, second };
  }

  private clampZoom(value: number): number {
    if (!Number.isFinite(value)) {
      return this.zoom;
    }

    return Math.min(this.maxZoom, Math.max(this.minZoom, value));
  }

  private updateZoomLimits(): void {
    if (!this.bounds) {
      return;
    }

    const spanX = Math.max(MIN_DOCUMENT_SPAN, this.bounds.maxX - this.bounds.minX);
    const spanY = Math.max(MIN_DOCUMENT_SPAN, this.bounds.maxY - this.bounds.minY);
    const fitZoom = Math.min(this.viewportWidth / spanX, this.viewportHeight / spanY);

    this.minZoom = Math.max(0.000001, fitZoom * MIN_ZOOM_FIT_MULTIPLIER);
    this.maxZoom = Math.max(this.minZoom * 2, fitZoom * MAX_ZOOM_FIT_MULTIPLIER);
  }

  private clampCenter(): void {
    if (!this.bounds) {
      return;
    }

    const halfWidth = this.viewportWidth / (2 * this.zoom);
    const halfHeight = this.viewportHeight / (2 * this.zoom);
    const minCenterX = this.bounds.minX + halfWidth;
    const maxCenterX = this.bounds.maxX - halfWidth;
    const minCenterY = this.bounds.minY + halfHeight;
    const maxCenterY = this.bounds.maxY - halfHeight;

    this.centerX =
      minCenterX <= maxCenterX
        ? Math.min(maxCenterX, Math.max(minCenterX, this.centerX))
        : (this.bounds.minX + this.bounds.maxX) * 0.5;
    this.centerY =
      minCenterY <= maxCenterY
        ? Math.min(maxCenterY, Math.max(minCenterY, this.centerY))
        : (this.bounds.minY + this.bounds.maxY) * 0.5;
  }
}

function normalizeBounds(bounds: CameraBounds): CameraBounds {
  return {
    minX: Math.min(bounds.minX, bounds.maxX),
    minY: Math.min(bounds.minY, bounds.maxY),
    maxX: Math.max(bounds.minX, bounds.maxX),
    maxY: Math.max(bounds.minY, bounds.maxY),
  };
}

function createEmptyRect(): CameraRect {
  return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

function distanceBetweenPointers(first: TrackedPointer, second: TrackedPointer): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
