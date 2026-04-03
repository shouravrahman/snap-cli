#!/usr/bin/env node

/**
 * Snap CLI Tool - Automated Visual Snapshots
 * Professional Refactor for Production/NPM
 * Author: Shourav & Antigravity
 */

const { chromium } = require('playwright');
const { Command } = require('commander');
const fs = require('fs-extra');
const path = require('path');
const pkg = require('./package.json');

// Optional Dependencies
let cliProgress;
let cosmiconfig;
let pLimit;

/**
 * Gracefully load dependencies to ensure robustness
 */
async function loadDependencies() {
  try {
    pLimit = (await import('p-limit')).default;
  } catch (e) {
    console.error('❌ Error: p-limit is required. Please install it.');
    process.exit(1);
  }

  try {
    cliProgress = require('cli-progress');
  } catch (e) {
    cliProgress = null;
  }

  try {
    const { cosmiconfig: cc } = require('cosmiconfig');
    cosmiconfig = cc;
  } catch (e) {
    cosmiconfig = null;
  }
}

const program = new Command();

program
  .version(pkg.version)
  .description('Professional snapshot tool for web applications')
  .option('-u, --url <url>', 'Base URL of the application', 'http://localhost:3000')
  .option('-o, --output <dir>', 'Output directory for snapshots', './snapshots')
  .option('--config <path>', 'Path to a configuration file')
  // Auth
  .option('--login-url <url>', 'URL of the login page')
  .option('--interactive', 'Open a visible browser for manual login')
  .option('--storage-state <path>', 'Path to save/load auth state', 'snap-session.json')
  .option('--username <char>', 'Username (for automated login)')
  .option('--password <char>', 'Password (for automated login)')
  .option('--user-selector <selector>', 'CSS selector for username input', '#username')
  .option('--pass-selector <selector>', 'CSS selector for password input', '#password')
  .option('--submit-selector <selector>', 'CSS selector for login button', 'button[type="submit"]')
  // Advanced Features
  .option('--cookie-selector <selector>', 'CSS selector for "Accept" or "Close" cookie banner button')
  .option('--ignore-selectors <selectors>', 'Comma-separated CSS selectors to hide')
  .option('--exclude-urls <patterns>', 'Comma-separated regex patterns to exclude URLs')
  .option('--max-depth <number>', 'Maximum crawl depth', (val) => parseInt(val, 10), Infinity)
  .option('--delay <ms>', 'Delay before snapshots (ms)', (val) => parseInt(val, 10), 1000)
  .option('-c, --concurrency <number>', 'Number of pages to process in parallel', (val) => parseInt(val, 10), 3)
  .option('--viewports <list>', 'Custom viewports (e.g., "desktop:1920x1080,mobile:375x667")')
  .parse(process.argv);

/**
 * Merges Command-line options with Config File options
 */
async function getMergedOptions() {
  const cliOptions = program.opts();
  let configOptions = {};

  if (cosmiconfig) {
    const explorer = cosmiconfig('snap');
    const result = cliOptions.config 
      ? await explorer.load(path.resolve(cliOptions.config)) 
      : await explorer.search();
    
    if (result && result.config) {
      configOptions = result.config;
      console.log(`⚙️ Loaded configuration from ${result.filepath}`);
    }
  }

  return { ...cliOptions, ...configOptions };
}

/**
 * Normalizes viewport strings into structured objects
 */
function parseViewports(viewportStr) {
  if (!viewportStr) {
    return [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1280, height: 720 },
    ];
  }

  return viewportStr.split(',').map(v => {
    const [name, res] = v.trim().split(':');
    if (!res) return { name, width: 1280, height: 720 };
    const [width, height] = res.split('x').map(n => parseInt(n, 10));
    return { name, width: width || 1280, height: height || 720 };
  });
}

function normalizeUrl(url, baseUrl) {
  try {
    const u = new URL(url, baseUrl);
    u.hash = '';
    u.search = '';
    return u.origin + u.pathname.replace(/\/$/, '') || '/';
  } catch (e) {
    return url;
  }
}

async function takeSnapshots() {
  await loadDependencies();
  const options = await getMergedOptions();
  const viewports = parseViewports(options.viewports);
  const outputDir = path.resolve(options.output);
  const startUrl = normalizeUrl(options.url);
  const storagePath = path.resolve(options.storageState);
  
  await fs.ensureDir(outputDir);

  // Check for existing session
  let storageState = null;
  if (fs.existsSync(storagePath)) {
    storageState = storagePath;
    console.log(`📦 Loading existing session from ${options.storageState}`);
  }

  // 1. Authentication Stage (Interactive or Automated)
  if (options.interactive) {
    console.log('🖥️ Entering Interactive Login Mode...');
    const authBrowser = await chromium.launch({ headless: false });
    const authContext = await authBrowser.newContext({ storageState: storageState || undefined });
    const authPage = await authContext.newPage();
    
    await authPage.goto(options.loginUrl || options.url);
    
    console.log('\n------------------------------------------------------------');
    console.log('👉 PLEASE LOGIN MANUALLY IN THE OPEN BROWSER WINDOW.');
    console.log('👉 Once logged in, come back here and press ENTER to continue.');
    console.log('------------------------------------------------------------\n');

    await new Promise(resolve => process.stdin.once('data', resolve));
    
    await authContext.storageState({ path: storagePath });
    console.log(`✅ Session saved to ${options.storageState}`);
    await authBrowser.close();
    storageState = storagePath;
  } else if (options.loginUrl && options.username && options.password) {
    // Automated Login (Legacy/Basic)
    console.log(`🔐 Automated login at ${options.loginUrl}...`);
    const authBrowser = await chromium.launch({ args: ['--no-sandbox'] });
    const authContext = await authBrowser.newContext();
    const authPage = await authContext.newPage();
    try {
      await authPage.goto(options.loginUrl, { waitUntil: 'networkidle' });
      await authPage.fill(options.userSelector, options.username);
      await authPage.fill(options.passSelector, options.password); 
      await authPage.click(options.submitSelector);
      await authPage.waitForLoadState('networkidle');
      await authContext.storageState({ path: storagePath });
      storageState = storagePath;
      console.log('✅ Automated login successful. Session saved.');
    } catch (err) {
      console.error(`❌ Automated login failure: ${err.message}`);
    } finally {
      await authBrowser.close();
    }
  }

  // 2. Main Snapshotting Process
  const browser = await chromium.launch({ 
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] 
  });
  
  const context = await browser.newContext({ storageState: storageState || undefined });

  const excludePatterns = options.excludeUrls
    ? options.excludeUrls.split(',').map(p => new RegExp(p.trim()))
    : [];
  const isExcluded = (url) => excludePatterns.some(regex => regex.test(url));

  // 3. Crawler Setup
  const visited = new Set();
  const urlsToCrawl = new Map([[startUrl, 0]]);
  const snapshotData = [];
  const limit = pLimit(options.concurrency);
  
  // Progress Reporting
  let bar;
  if (cliProgress) {
    bar = new cliProgress.SingleBar({
      format: '🚢 Snapshot Progress | {bar} | {percentage}% | {value}/{total} Pages | Current: {url}',
      hideCursor: true
    }, cliProgress.Presets.shades_classic);
    bar.start(1, 0, { url: 'Starting...' });
  }

  async function crawlAndCapture(url, depth) {
    const normalized = normalizeUrl(url);
    if (visited.has(normalized)) return;
    visited.add(normalized);

    if (isExcluded(normalized) || !normalized.startsWith(startUrl) || depth > (options.maxDepth || Infinity)) {
      return;
    }

    if (bar) bar.update(visited.size, { url: normalized.replace(startUrl, '') || '/' });
    else console.log(`📸 Capturing: ${normalized}`);

    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle' });

      // Dismiss Cookie Banner if selector provided
      if (options.cookieSelector) {
        const cookieBtn = await page.$(options.cookieSelector);
        if (cookieBtn) {
          await cookieBtn.click().catch(() => {});
          await page.waitForTimeout(500); // Wait for modal to close
        }
      }

      // Hide Ads/Overlays via ignore-selectors
      if (options.ignoreSelectors) {
        const style = options.ignoreSelectors.split(',').map(s => `${s.trim()} { display: none !important; }`).join(' ');
        await page.addStyleTag({ content: style }).catch(() => {});
      }

      // Allow for dynamic content or transitions to finish
      await page.waitForTimeout(options.delay || 500);

      const urlObj = new URL(url);
      let pageName = urlObj.pathname === '/' ? 'index' : urlObj.pathname.replace(/\//g, '-');
      if (pageName.startsWith('-')) pageName = pageName.substring(1);
      
      const currentPageSnapshots = { url, pageName, snapshots: [] };

      // Iterate through all viewports
      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForTimeout(300); // Small buffer for responsive reflows
        const imagePath = path.join(outputDir, `${pageName}-${vp.name}.png`);
        await page.screenshot({ path: imagePath, fullPage: true });
        currentPageSnapshots.snapshots.push({ 
          viewport: vp.name, 
          path: path.relative(outputDir, imagePath) 
        });
      }
      snapshotData.push(currentPageSnapshots);

      // Discovery Phase - Find new internal links
      const links = await page.evaluate((baseUrl) => {
        return Array.from(document.querySelectorAll('a'))
          .map(a => a.href.split('#')[0]) // Strip anchors
          .filter(href => {
            return href.startsWith(baseUrl) && 
                   !href.match(/\.(pdf|zip|jpg|png|gif|svg|exe|dmg)$/i);
          });
      }, startUrl);

      for (const link of links) {
        const cleanLink = normalizeUrl(link, startUrl);
        if (!visited.has(cleanLink) && !urlsToCrawl.has(cleanLink) && 
            !isExcluded(cleanLink) && (depth + 1) <= (options.maxDepth || Infinity)) {
          urlsToCrawl.set(cleanLink, depth + 1);
          if (bar) bar.setTotal(urlsToCrawl.size);
        }
      }
    } catch (err) {
      if (bar) bar.stop();
      console.error(`❌ Capture failed for ${url}: ${err.message}`);
      if (bar) bar.start(urlsToCrawl.size, visited.size);
    } finally {
      await page.close();
    }
  }

  // 3. Execution Loop
  while (urlsToCrawl.size > visited.size) {
    const currentBatch = Array.from(urlsToCrawl.entries())
      .filter(([url]) => !visited.has(url));
    
    if (currentBatch.length === 0) break;

    // Process using p-limit to respect concurrency setting
    await Promise.all(currentBatch.map(([url, depth]) => limit(() => crawlAndCapture(url, depth))));
  }

  if (bar) bar.stop();

  // 4. Reporting Phase
  await generateGalleryHtml(snapshotData, outputDir, options.url);
  await browser.close();
  console.log(`\n✅ Snapshots successfully saved to: ${outputDir}`);
}

async function generateGalleryHtml(data, outputDir, appUrl) {
  let galleryContent = '';
  for (const pageData of data) {
    galleryContent += `
      <div class="page-section">
          <div class="page-header">
              <h2>${pageData.pageName.replace(/-/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</h2>
              <a href="${pageData.url}" target="_blank" rel="noopener noreferrer">${pageData.url}</a>
          </div>
          <div class="snapshots-container">
    `;
    for (const snapshot of pageData.snapshots) {
      galleryContent += `
              <div class="snapshot-item">
                  <p>${snapshot.viewport.toUpperCase()}</p>
                  <img src="${snapshot.path}" alt="${pageData.pageName} - ${snapshot.viewport}" loading="lazy">
              </div>
      `;
    }
    galleryContent += `</div></div>`;
  }

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Visual Review Gallery | ${appUrl}</title>
    <style>
        :root { --surface: #f8fafc; --card: #ffffff; --text: #0f172a; --muted: #64748b; --primary: #2563eb; --border: #e2e8f0; }
        body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; background: var(--surface); color: var(--text); line-height: 1.5; }
        h1 { font-size: 2.25rem; font-weight: 800; text-align: center; margin-bottom: 8px; }
        .generation-info { text-align: center; color: var(--muted); margin-bottom: 48px; font-size: 0.95rem; }
        .gallery-container { max-width: 1400px; margin: 0 auto; }
        .page-section { background: var(--card); border-radius: 16px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); margin-bottom: 64px; padding: 40px; border: 1px solid var(--border); }
        .page-header { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 32px; }
        .page-header h2 { margin: 0; font-size: 1.5rem; letter-spacing: -0.025em; }
        .page-header a { font-size: 0.875rem; color: var(--primary); text-decoration: none; font-weight: 500; }
        .page-header a:hover { text-decoration: underline; }
        .snapshots-container { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 40px; }
        .snapshot-item { background: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid var(--border); transition: transform 0.2s ease-in-out; }
        .snapshot-item:hover { transform: translateY(-4px); }
        .snapshot-item img { width: 100%; height: auto; display: block; border-bottom: 1px solid var(--border); background: white; }
        .snapshot-item p { margin: 16px; font-weight: 700; text-align: center; color: var(--muted); font-size: 0.75rem; letter-spacing: 0.1em; }
    </style>
</head>
<body>
    <div class="gallery-container">
        <h1>Snap Review Gallery</h1>
        <p class="generation-info">Snapshot of <strong>${appUrl}</strong> • Generated on ${new Date().toLocaleString()}</p>
        <div id="gallery">${galleryContent}</div>
    </div>
</body>
</html>`;

  await fs.writeFile(path.join(outputDir, 'index.html'), htmlContent);
}

takeSnapshots().catch(err => {
  console.error('💥 Terminal Failure:', err);
  process.exit(1);
});
