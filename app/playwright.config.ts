import { defineConfig, devices } from '@playwright/test';

const enableWebGpuE2e = process.env.ENABLE_WEBGPU_E2E === '1';

export default defineConfig({
  testDir: './src/tests/e2e',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: {
          width: 640,
          height: 480,
        },
        deviceScaleFactor: 1,
        launchOptions: {
          args: [
            '--single-process',
            '--no-zygote',
            '--ignore-gpu-blocklist',
            ...(enableWebGpuE2e
              ? ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--disable-features=SkiaGraphite']
              : ['--disable-gpu', '--disable-software-rasterizer']),
          ],
        },
      },
    },
  ],
});
