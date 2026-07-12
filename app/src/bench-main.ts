import { BenchApp } from './app/BenchApp';

const canvas = document.querySelector<HTMLCanvasElement>('#seat-canvas');

if (!canvas) {
  throw new Error('Expected #seat-canvas in bench.html');
}

const app = new BenchApp(canvas);
app.mount();
