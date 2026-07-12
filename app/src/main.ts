import { DemoApp } from './app/DemoApp';

const canvas = document.querySelector<HTMLCanvasElement>('#seat-canvas');

if (!canvas) {
  throw new Error('Expected #seat-canvas in index.html');
}

const resizeCanvas = () => {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(window.innerWidth * dpr));
  const height = Math.max(1, Math.floor(window.innerHeight * dpr));
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
};

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const app = new DemoApp(canvas);
app.mount();
