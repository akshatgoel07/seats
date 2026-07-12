import { DemoApp } from './app/DemoApp';

const canvas = document.querySelector<HTMLCanvasElement>('#seat-canvas');

if (!canvas) {
  throw new Error('Expected #seat-canvas in index.html');
}

const app = new DemoApp(canvas);
app.mount();
