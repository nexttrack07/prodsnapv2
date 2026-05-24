import { chromium } from '@playwright/test';

async function run() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error('[BROWSER EXCEPTION]', err.stack || err.message);
  });

  try {
    console.log('Navigating to http://localhost:3000 ...');
    await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 10000 });
    console.log('Page loaded, waiting 3 seconds for async issues...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const html = await page.content();
    console.log('Page title:', await page.title());
    console.log('Sign in button visible:', await page.getByRole('button', { name: /sign in/i }).isVisible());
  } catch (error) {
    console.error('Failed during navigation:', error);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

run();
