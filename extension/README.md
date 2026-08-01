# AYN Resume Tailor, Chrome extension v3.2.0

Side panel Chrome extension. Reads the job posting off the page, scores your match, writes a cover letter, tailors your resume, and answers questions about the job. Read only: it never writes to, clicks, or types into a page.

## Install (Developer Mode)

1. Download `ayn-extension.zip` from Resume Hub, Extension tab
2. Unzip anywhere
3. Open `chrome://extensions`
4. Toggle **Developer mode** (top right)
5. Click **Load unpacked** and pick the unzipped folder
6. Pin the AYN icon from the puzzle menu

Click the icon on any job posting to open the side panel.

## Assets

Fonts and icons ship inside the extension (`fonts/`), so the panel renders offline and makes no network request to a font or CDN host. Rebuild the package with `node extension/build.mjs`.
