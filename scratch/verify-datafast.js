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

  // Track network requests to see DataFast requests
  page.on('request', request => {
    const url = request.url();
    if (url.includes('datafast') || url.includes('dfid_') || url.includes('datafa.st')) {
      console.log(`[DATAFAST REQUEST] [${request.method()}] ${url}`);
      if (request.postData()) {
        console.log(`[DATAFAST PAYLOAD]`, request.postData());
      }
    }
  });

  try {
    console.log('Navigating to http://localhost:3000 ...');
    await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 10000 });
    console.log('Page loaded completely.');

    console.log('Waiting 3 seconds for initial pageview tracking to fire...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
  } catch (error) {
    console.error('Failed during verification:', error);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

run();
