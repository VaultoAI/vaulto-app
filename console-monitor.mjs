import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', msg => {
  const type = msg.type().toUpperCase().padEnd(7);
  console.log(`[${type}] ${msg.text()}`);
});

page.on('pageerror', error => {
  console.log(`[ERROR  ] ${error.message}`);
});

page.on('requestfailed', request => {
  console.log(`[NETFAIL] ${request.url()} - ${request.failure()?.errorText}`);
});

console.log('Monitoring console at http://localhost:3000...');
await page.goto('http://localhost:3000');

// Keep the script running
await new Promise(() => {});
