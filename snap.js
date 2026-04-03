#!/usr/bin/env node
const { chromium } = require('playwright');
const { Command } = require('commander');
const fs = require('fs-extra');
const path = require('path');
const pLimit = require('p-limit'); // For concurrency control

const program = new Command();

program
  .version('1.0.0')
  .description('Snapshot a local web application')
  .option('-u, --url <url>', 'The base URL of the local app', 'http://localhost:3000')
  .option('-o, --output <dir>', 'The directory to save snapshots', './snapshots')
  .option('--login-url <url>', 'URL of the login page')
  .option('--username <char>', 'Username for authentication')
  .option('--password <char>', 'Password for authentication')
  .option('--user-selector <selector>', 'CSS selector for username input', '#username')
  .option('--pass-selector <selector>', 'CSS selector for password input', '#password') // Corrected option name
  .option('--submit-selector <selector>', 'CSS selector for login button', 'button[type="submit"]') // Corrected option name
  .option('-c, --concurrency <number>', 'Number of pages to process in parallel', parseInt, 3) // New concurrency option
  .parse(process.argv);

const options = program.opts();

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 720 },
];

// Store data about each snapshot for gallery generation
const snapshotData = [];

/**
 * Normalizes a URL by removing hashes, queries, and trailing slashes.
 */
function normalizeUrl(url) {
  const u = new URL(url);
  u.hash = '';
  u.search = '';
  return u.origin + u.pathname.replace(/\/$/, '') || '/';
}

async function takeSnapshots() {
  const browser = await chromium.launch();
  // Using a single context ensures cookies/storage are shared across pages
  const context = await browser.newContext();
  
  // Initial page for authentication, will be closed after login
  const authPage = await context.newPage(); 
  const visited = new Set();
  const startUrl = normalizeUrl(options.url);
  const urlsToCrawl = new Set([startUrl]); 
  const outputDir = path.resolve(options.output);

  // Ensure output directory exists
  await fs.ensureDir(outputDir);

  // 1. Handle Authentication
  if (options.loginUrl && options.username && options.password) {
    console.log(`🔐 Logging in at ${options.loginUrl}...`);
    try {
      await authPage.goto(options.loginUrl, { waitUntil: 'networkidle' });
      await authPage.fill(options.userSelector, options.username);
      // Corrected option names: pass_selector -> passSelector, submit_selector -> submitSelector
      await authPage.fill(options.passSelector, options.password); 
      await authPage.click(options.submitSelector);
      await authPage.waitForLoadState('networkidle');
      console.log('✅ Login successful.');
    } catch (err) {
      console.error(`❌ Login failed: ${err.message}`);
      process.exit(1);
    }
  }
  await authPage.close(); // Close the auth page, context maintains session

  console.log(`🚀 Starting snapshots for ${options.url} with ${options.concurrency} concurrent workers...`);

  const limit = pLimit(options.concurrency); // Initialize p-limit for concurrency control

  async function crawlAndCapture(url) {
    const normalized = normalizeUrl(url);
    if (visited.has(normalized) || !normalized.startsWith(normalizeUrl(options.url))) {
      return; // Skip if already visited or external
    }
    visited.add(normalized); // Mark as visited early

    console.log(`📸 Capturing: ${normalized}`);
    const page = await context.newPage(); // Each concurrent task gets its own page
    try {
      await page.goto(url, { waitUntil: 'networkidle' });

      // Generate a filename based on the URL path
      const urlObj = new URL(url);
      let pageName = urlObj.pathname === '/' ? 'index' : urlObj.pathname.replace(/\//g, '-');
      if (pageName.startsWith('-')) pageName = pageName.substring(1);
      
      const currentPageSnapshots = { url, pageName, snapshots: [] };

      // 2. Loop through viewports for each page in parallel
      await Promise.all(VIEWPORTS.map(async (vp) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        // Wait a small amount for responsive transitions
        await page.waitForTimeout(500); 
        const imagePath = path.join(outputDir, `${pageName}-${vp.name}.png`);
        await page.screenshot({
          path: imagePath,
          fullPage: true
        });
        // Store relative path for HTML gallery
        currentPageSnapshots.snapshots.push({ viewport: vp.name, path: path.relative(outputDir, imagePath) });
      }));
      snapshotData.push(currentPageSnapshots); // Add page's snapshot data to the global array

      // Find all links on the current page to crawl further
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
          .map(a => a.href)
          .filter(href => {
            return href.startsWith(window.location.origin) && 
                   !href.match(/\.(pdf|zip|jpg|png|gif|svg)$/i);
          });
      });

      for (const link of links) {
        const cleanLink = normalizeUrl(link);
        if (!visited.has(cleanLink)) {
          urlsToCrawl.add(cleanLink); // Add to the set of URLs to be processed
        }
      }
    } catch (err) {
      console.error(`❌ Failed to capture ${url}: ${err.message}`);
    } finally {
      await page.close(); // Close the page after processing
    }
  }

  let previousSize = 0;
  // Keep crawling until no new unique URLs are found in an iteration
  while (urlsToCrawl.size > previousSize || urlsToCrawl.size > visited.size) {
    previousSize = urlsToCrawl.size;
    // Filter out already visited URLs for the current batch
    const currentBatch = Array.from(urlsToCrawl).filter(url => !visited.has(url));
    if (currentBatch.length === 0 && urlsToCrawl.size === visited.size) break; // All processed

    // Process the current batch of URLs concurrently
    await Promise.all(currentBatch.map(url => limit(() => crawlAndCapture(url))));
  }

  // Generate the HTML gallery after all snapshots are taken
  await generateGalleryHtml(snapshotData, outputDir);

  await browser.close();
  console.log(`\n✅ Done! Snapshots saved to: ${outputDir}`);
}

/**
 * Generates an HTML gallery page from the collected snapshot data.
 * @param {Array} data - Array of objects containing page URL, name, and snapshot details.
 * @param {string} outputDir - The directory where the HTML file will be saved.
 */
async function generateGalleryHtml(data, outputDir) {
  let galleryContent = '';

  for (const pageData of data) {
    galleryContent += `
      <div class="page-section">
          <div class="page-header">
              <h2>${pageData.pageName.replace(/-/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</h2>
              <a href="${pageData.url}" target="_blank" rel="noopener noreferrer">(${pageData.url})</a>
          </div>
          <div class="snapshots-container">
    `;
    for (const snapshot of pageData.snapshots) {
      galleryContent += `
              <div class="snapshot-item">
                  <p>${snapshot.viewport.charAt(0).toUpperCase() + snapshot.viewport.slice(1)}</p>
                  <img src="${snapshot.path}" alt="${pageData.pageName} - ${snapshot.viewport}">
              </div>
      `;
    }
    galleryContent += `
          </div>
      </div>
    `;
  }

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Snapshots Gallery</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"; margin: 20px; background-color: #f4f4f4; color: #333; }
        h1 { color: #0056b3; text-align: center; margin-bottom: 30px; }
        p.generation-info { text-align: center; color: #666; margin-bottom: 40px; }
        .gallery-container { max-width: 1200px; margin: 0 auto; padding: 0 15px; }
        .page-section {
            background-color: #fff;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            margin-bottom: 40px;
            padding: 25px;
            border: 1px solid #e0e0e0;
        }
        .page-header {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            margin-bottom: 25px;
            border-bottom: 1px solid #eee;
            padding-bottom: 15px;
        }
        .page-header h2 {
            margin: 0;
            color: #2c3e50;
            font-size: 1.8em;
            flex-grow: 1;
        }
        .page-header a {
            margin-left: 20px;
            text-decoration: none;
            color: #007bff;
            font-size: 1em;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 300px; /* Limit width for long URLs */
        }
        .page-header a:hover {
            text-decoration: underline;
        }
        .snapshots-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 30px;
            justify-content: center;
        }
        .snapshot-item {
            border: 1px solid #ddd;
            border-radius: 6px;
            overflow: hidden;
            background-color: #fcfcfc;
            text-align: center;
            box-shadow: 0 1px 4px rgba(0,0,0,0.08);
            transition: transform 0.2s ease-in-out;
        }
        .snapshot-item:hover {
            transform: translateY(-3px);
        }
        .snapshot-item img {
            max-width: 100%;
            height: auto;
            display: block;
            border-bottom: 1px solid #eee;
            background-color: #fff; /* Ensure white background for transparent images */
        }
        .snapshot-item p {
            margin: 12px 0;
            font-weight: bold;
            color: #555;
            font-size: 1.1em;
        }
        @media (max-width: 768px) {
            .page-header {
                flex-direction: column;
                align-items: flex-start;
            }
            .page-header a {
                margin-left: 0;
                margin-top: 5px;
                max-width: 100%;
            }
            .snapshots-container {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="gallery-container">
        <h1>Snapshots Gallery</h1>
        <p class="generation-info">Generated on: ${new Date().toLocaleString()}</p>
        <div id="gallery">
            ${galleryContent}
        </div>
    </div>
</body>
</html>
  `;

  const galleryPath = path.join(outputDir, 'index.html');
  await fs.writeFile(galleryPath, htmlContent);
  console.log(`\n🖼️ HTML gallery generated at: ${galleryPath}`);
}

takeSnapshots();
