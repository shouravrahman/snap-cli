# Snap CLI Tool

`snap-cli-tool` is a command-line interface designed to automate the process of taking visual snapshots of locally running web applications (Next.js, Vite, etc.). It crawls your application, captures screenshots across multiple viewports (mobile, tablet, desktop), and generates an interactive HTML gallery for easy review.

## Features

- **Automated Page Discovery**: Crawls your application to find all internal links.
- **Responsive Snapshots**: Captures screenshots for mobile, tablet, and desktop viewports for each page.
- **Authentication Support**: Log in to your application once, and the session is maintained for all subsequent page captures.
- **Concurrency**: Speeds up the snapshot process by visiting multiple pages in parallel.
- **HTML Gallery**: Generates a user-friendly `index.html` gallery to browse all captured snapshots.
- **Full Page Screenshots**: Captures the entire scrollable height of each page.

## Installation

You can install the tool globally or run it directly using `npx`.

```bash
npm install -g snap-cli-tool
```

## Usage

Before running the tool, ensure your local application is running (e.g., on `http://localhost:3000`).

### Basic Usage

```bash
snap-cli --url http://localhost:3000 --output ./my-app-snapshots
```

-   `--url`: The base URL of your local application (e.g., `http://localhost:3000`).
-   `--output`: The directory where snapshots and the HTML gallery will be saved.

### With Authentication

If your application requires a login, you can provide credentials and selectors for the login form:

```bash
snap-cli \
  --url http://localhost:3000 \
  --output ./authenticated-snapshots \
  --login-url http://localhost:3000/login \
  --username "your_username" \
  --password "your_password" \
  --user-selector "input#email" \
  --pass-selector "input#password" \
  --submit-selector "button[type='submit']"
```

-   `--login-url`: The URL of your application's login page.
-   `--username`: The username to use for login.
-   `--password`: The password to use for login.
-   `--user-selector`: CSS selector for the username/email input field.
-   `--pass-selector`: CSS selector for the password input field.
-   `--submit-selector`: CSS selector for the login button.

### Controlling Concurrency

You can specify how many pages `snap-cli` processes in parallel using the `--concurrency` (or `-c`) option:

```bash
snap-cli --url http://localhost:5173 --output ./fast-snapshots --concurrency 5
```

### Viewing the Snapshots

After the script completes, navigate to the `index.html` file within your specified output directory (e.g., `./my-app-snapshots/index.html`) in your web browser. This HTML file provides a gallery view of all captured snapshots, organized by page and viewport.
```
