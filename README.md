# Playwright Composer MVP with Recorder and CI/CD

## Features
- Create suites and tests
- Paste/import Playwright code
- Parse steps
- Add assertions
- Generate Playwright `.spec.js` files
- Run generated tests from UI
- Start Playwright codegen recorder with URL
- Load latest recording into editor
- Daily CI run and on-push/on-PR run using GitHub Actions

## Project Structure
- `client/` React + Vite frontend
- `server/` Node.js + Express backend
- `.github/workflows/` GitHub Actions CI/CD

## Local Setup
### Backend
```bash
cd server
npm install
npm install -D playwright @playwright/test
npx playwright install --with-deps
npm run dev
```
Backend runs on `http://localhost:4000`

### Frontend
```bash
cd client
npm install
npm run dev
```
Frontend runs on `http://localhost:5173`

## How to Use
1. Create a Suite
2. Create a Test
3. Paste or import Playwright code
4. Click `Parse Code`
5. Save steps
6. Add assertions if needed
7. Generate Playwright file
8. Run test
9. Or use `Record` with a URL to open Playwright codegen, then `Load Latest Recording`

## CI/CD
GitHub Actions workflow runs:
- On every push to `main` and `master`
- On every pull request
- Every day at 03:00 UTC

Workflow file:
- `.github/workflows/playwright-ci.yml`

## Notes
- In this MVP, data is stored in-memory on backend.
- Generated tests are saved in `server/generated/`.
- Recordings are saved in `server/recordings/`.
