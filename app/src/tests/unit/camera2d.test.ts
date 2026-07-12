import { describe, expect, it } from 'vitest';

import { Camera2D } from '../../renderer/camera/Camera2D';

describe('Camera2D', () => {
  it('round-trips world and screen coordinates', () => {
    const camera = new Camera2D({
      viewportWidth: 800,
      viewportHeight: 600,
      centerX: 125,
      centerY: -40,
      zoom: 4,
    });
    const screen = camera.worldToScreen(175, 35);
    const world = camera.screenToWorld(screen.x, screen.y);

    expect(world.x).toBeCloseTo(175);
    expect(world.y).toBeCloseTo(35);
  });

  it('keeps the world point under the cursor fixed during cursor-anchored zoom', () => {
    const camera = new Camera2D({
      viewportWidth: 1000,
      viewportHeight: 700,
      centerX: 40,
      centerY: 60,
      zoom: 3,
    });
    const cursor = { x: 733, y: 281 };
    const before = camera.screenToWorld(cursor.x, cursor.y);

    camera.zoomAt(cursor.x, cursor.y, 2.5);
    const after = camera.screenToWorld(cursor.x, cursor.y);

    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('fits bounds inside the viewport padding', () => {
    const camera = new Camera2D({
      viewportWidth: 1000,
      viewportHeight: 500,
    });

    camera.fitToBounds({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, 50);

    expect(camera.getZoom()).toBeCloseTo(8);
    expect(camera.getCenter()).toEqual({ x: 50, y: 25 });
    expect(camera.worldToScreen(0, 0).y).toBeCloseTo(50);
    expect(camera.worldToScreen(100, 50).y).toBeCloseTo(450);
    expect(camera.worldToScreen(0, 0).x).toBeGreaterThanOrEqual(50);
    expect(camera.worldToScreen(100, 50).x).toBeLessThanOrEqual(950);
  });

  it('clamps zoom and center to document-derived limits', () => {
    const camera = new Camera2D({
      viewportWidth: 400,
      viewportHeight: 400,
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
    });
    const limits = camera.getZoomLimits();

    camera.setZoomAt(200, 200, limits.min / 100);
    expect(camera.getZoom()).toBeCloseTo(limits.min);

    camera.setZoomAt(200, 200, limits.max * 100);
    expect(camera.getZoom()).toBeCloseTo(limits.max);

    camera.setView(-10_000, -10_000, 20);
    const center = camera.getCenter();
    expect(center.x).toBeGreaterThanOrEqual(10);
    expect(center.y).toBeGreaterThanOrEqual(10);
  });

  it('produces a view-projection matrix matching screen-space transforms', () => {
    const camera = new Camera2D({
      viewportWidth: 800,
      viewportHeight: 400,
      centerX: 20,
      centerY: 10,
      zoom: 5,
    });
    const matrix = camera.getViewProjectionMatrix();
    const world = { x: 60, y: 30 };
    const screen = camera.worldToScreen(world.x, world.y);
    const clipX = matrix[0] * world.x + matrix[12];
    const clipY = matrix[5] * world.y + matrix[13];

    expect(clipX).toBeCloseTo((screen.x / 800) * 2 - 1);
    expect(clipY).toBeCloseTo(1 - (screen.y / 400) * 2);
  });
});
