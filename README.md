# Snap CLI Tool 📸

`snap-cli-tool` is a powerful, production-ready command-line interface designed to automate visual regression testing and snapshotting for web applications. It recursively crawls your application, captures responsive screenshots across multiple viewports, and generates an interactive, high-fidelity HTML gallery.

---

## 🌟 Features

- **Automated Page Discovery**: Crawls your application to find all internal links.
- **Interactive Authentication**: Support for modern auth providers (Google, Clerk, Supabase, Auth0) via a visible browser login session.
- **Session Persistence**: Save and reuse authentication states (`storageState`) to skip the login process.
- **Configuration File Support**: Manage all settings via `snap.config.js` or `snap.json`.
- **Responsive Snapshots**: Define custom viewports (Mobile, Tablet, Desktop, or Ultra-wide).
- **Real-time Progress**: Visual feedback via a sleek progress bar during the crawling process.
- **Cookie Banner Handling**: Automatically dismiss cookie consent modals or specify selectors to hide/click.
- **Crawl Depth Control**: Limit how deep the crawler goes into your site structure.
- **Concurrency Control**: Lightning-fast captures with configurable parallel processing.
- **HTML Gallery**: Generates a premium, searchable gallery for visual review.
- **Full Page Screenshots**: Captures the entire scrollable height of each page.
- **Selector Exclusion**: Hide dynamic elements (like chat widgets or banners) before capturing.
- **URL Filtering**: Exclude specific routes using regex patterns.
- **Customizable Delays**: Adjust wait times for animations or transitions to complete.

---

## 🚀 Installation

Install globally via NPM:

```bash
npm install -g snap-cli-tool
```

Or run instantly without installation:

```bash
npx snap-cli-tool --url http://localhost:3000
```

---

## ⚙️ Configuration

For professional workflows, create a `snap.config.js` in your project root:

```javascript
module.exports = {
  url: 'http://localhost:5173',
  output: './snapshots',
  interactive: true,             // Manually log in via a visible browser
  storageState: 'session.json', // Persist auth state
  concurrency: 5,               // Parallel workers
  delay: 1000,                  // ms to wait before snapshot
  viewports: 'desktop:1920x1080,tablet:1024x768,mobile:375x667',
  cookieSelector: 'button:has-text("Accept All")', // Auto-click cookie buttons
  ignoreSelectors: '.ads, #banner'              // Hide elements before capture
};
```

Run using the config:
```bash
snap-cli --config ./snap.config.js
```

---

## 🔐 Authentication Modes

### 1. Interactive Mode (Recommended)
Best for complex authentication like Google, MFA, or Clerk. The tool opens a visible browser window for you to log in manually. Once logged in, the session is saved and reused across all captured pages.

```bash
snap-cli --url http://localhost:3000 --interactive --storage-state auth.json
```

### 2. Automated Mode
For simple email/password forms:

```bash
snap-cli \
  --url http://localhost:3000 \
  --login-url http://localhost:3000/login \
  --username "admin@example.com" \
  --password "secret" \
  --user-selector "input#email" \
  --pass-selector "input#password" \
  --submit-selector "button[type='submit']"
```

---

## 📖 Usage Examples

### Basic Usage
Before running, ensure your local application is running.

```bash
snap-cli --url http://localhost:3000 --output ./my-snapshots
```

### Controlling Concurrency
Speed up processed by visiting multiple pages in parallel (default is 3):

```bash
snap-cli --url http://localhost:3000 --concurrency 5
```

### Custom Viewports
Specify exactly which resolutions to capture:

```bash
snap-cli --url http://localhost:3000 --viewports "mobile:375x667,ultra:2560x1440"
```

---

## 📑 CLI Options Reference

| Option | Description | Default |
| :--- | :--- | :--- |
| `-u, --url` | Base URL of the application | `http://localhost:3000` |
| `-o, --output` | Directory to save snapshots | `./snapshots` |
| `--config` | Path to a configuration file | `None` |
| `--interactive` | Open visible browser for manual login | `false` |
| `--storage-state` | Path to save/load auth session | `snap-session.json` |
| `-c, --concurrency` | Number of parallel pages to process | `3` |
| `--viewports` | List of viewports (name:WxH) | `Mobile, Tablet, Desktop` |
| `--cookie-selector` | Selector for cookie button to click | `None` |
| `--max-depth` | Maximum crawl depth | `Infinity` |
| `--delay` | Delay in ms before taking screenshots | `1000` |
| `--ignore-selectors` | CSS selectors to hide | `None` |
| `--exclude-urls` | Regex patterns to ignore URLs | `None` |

---

## 🖼️ Reviewing results

After the script completes, navigate to the `index.html` file within your specified output directory (e.g., `./snapshots/index.html`) using any browser. It provides a structured, searchable gallery organized by page and viewport.

---

## 🛠️ Requirements

- **Node.js**: >= 14.0.0
- **Playwright**: Installed as a dependency

---

**Built with ❤️ for Developers**
