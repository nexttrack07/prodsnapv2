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

  // Track network requests to see Sentry envelopes
  page.on('request', request => {
    if (request.url().includes('sentry.io') || request.url().includes('sentry')) {
      console.log(`[SENTRY REQUEST] [${request.method()}] ${request.url()}`);
      if (request.postData()) {
        console.log(`[SENTRY PAYLOAD]`, request.postData().substring(0, 500));
      }
    }
  });

  try {
    console.log('Navigating to http://localhost:3000 ...');
    await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Accept dialogs automatically (like alert)
    page.on('dialog', async dialog => {
      console.log(`[DIALOG] ${dialog.type()}: ${dialog.message()}`);
      await dialog.accept();
    });

    console.log('Clicking "Break the world" button...');
    const button = page.getByRole('button', { name: /break the world/i });
    if (await button.isVisible()) {
      await button.click();
    } else {
      console.error('Button not found!');
    }

    console.log('Waiting 5 seconds for Sentry request to fire...');
    await new Promise(resolve => setTimeout(resolve, 5000));

  } catch (error) {
    console.error('Failed during test:', error);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

run();
