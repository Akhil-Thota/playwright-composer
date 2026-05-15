import { exec } from 'child_process';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import { parsePlaywrightCode, generatePlaywrightTest } from './lib/playwright.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const db = { suites: [], tests: [] };
const generatedDir = path.join(__dirname, '..', 'generated');
if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true });
const recordingsDir = path.join(__dirname, '..', 'recordings');
if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });

let recorderRunning = false;
let latestRecordingFile = null;
let recorderLogs = [];

function addRecorderLog(message) {
  const entry = `[${new Date().toISOString()}] ${message}`;
  recorderLogs.push(entry);
  if (recorderLogs.length > 200) recorderLogs = recorderLogs.slice(-200);
  console.log(entry);
}

function quoteForCmd(value) {
  return `"${String(value).replace(/"/g, '\"')}"`;
}

app.get('/api/health', (_, res) => res.json({ ok: true, service: 'playwright-composer-server' }));

app.get('/api/suites', (_, res) => {
  const suites = db.suites.map((suite) => ({ ...suite, tests: db.tests.filter((test) => test.suiteId === suite.id) }));
  res.json(suites);
});

app.post('/api/suites', (req, res) => {
  const { name, description = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const suite = { id: nanoid(), name, description, createdAt: new Date().toISOString() };
  db.suites.push(suite);
  res.status(201).json(suite);
});

app.post('/api/tests', (req, res) => {
  const { suiteId, name, code = '' } = req.body;
  if (!suiteId || !name) return res.status(400).json({ error: 'suiteId and name are required' });
  const test = { id: nanoid(), suiteId, name, code, steps: [], assertions: [], createdAt: new Date().toISOString() };
  db.tests.push(test);
  res.status(201).json(test);
});

app.post('/api/parse', (req, res) => {
  const { code = '' } = req.body;
  res.json({ steps: parsePlaywrightCode(code) });
});

app.put('/api/tests/:id/steps', (req, res) => {
  const test = db.tests.find((t) => t.id === req.params.id);
  if (!test) return res.status(404).json({ error: 'test not found' });
  test.steps = req.body.steps || [];
  res.json(test);
});

app.post('/api/tests/:id/assertions', (req, res) => {
  const test = db.tests.find((t) => t.id === req.params.id);
  if (!test) return res.status(404).json({ error: 'test not found' });
  const assertion = { id: nanoid(), ...req.body };
  test.assertions.push(assertion);
  res.status(201).json(assertion);
});

app.post('/api/tests/:id/generate', (req, res) => {
  const test = db.tests.find((t) => t.id === req.params.id);
  if (!test) return res.status(404).json({ error: 'test not found' });
  const suite = db.suites.find((s) => s.id === test.suiteId);
  const code = generatePlaywrightTest({ suiteName: suite?.name || 'Generated Suite', testName: test.name, steps: test.steps, assertions: test.assertions });
  const safeName = test.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const fileName = `${safeName || 'test'}.spec.js`;
  const filePath = path.join(generatedDir, fileName);
  fs.writeFileSync(filePath, code, 'utf-8');
  res.json({ fileName, code, path: filePath });
});

app.post('/api/tests/:id/run', (req, res) => {
  const test = db.tests.find((t) => t.id === req.params.id);
  if (!test) return res.status(404).json({ error: 'test not found' });
  const suite = db.suites.find((s) => s.id === test.suiteId);
  const code = generatePlaywrightTest({ suiteName: suite?.name || 'Generated Suite', testName: test.name, steps: test.steps, assertions: test.assertions });
  const safeName = test.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const fileName = `${safeName || 'test'}.spec.js`;
  const filePath = path.join(generatedDir, fileName);
  fs.writeFileSync(filePath, code, 'utf-8');

  exec(`npx playwright test "generated/${fileName}"`, { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ success: false, message: 'Execution failed', error: error.message, stdout, stderr });
    }
    res.json({ success: true, message: 'Test executed successfully', stdout, stderr });
  });
});

app.post('/api/recorder/start', (req, res) => {
  try {
    const { url = 'https://example.com' } = req.body;
    if (recorderRunning) return res.status(400).json({ success: false, message: 'Recorder is already running' });
    const fileName = `recording-${Date.now()}.js`;
    const outputPath = path.join(recordingsDir, fileName);
    latestRecordingFile = outputPath;
    recorderRunning = true;
    const command = `npx playwright codegen ${quoteForCmd(url)} --output ${quoteForCmd(outputPath)}`;
    addRecorderLog(`Starting recorder with command: ${command}`);
    addRecorderLog(`Working directory: ${path.join(__dirname, '..')}`);
    exec(command, { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
      if (stdout) addRecorderLog(`stdout: ${stdout}`);
      if (stderr) addRecorderLog(`stderr: ${stderr}`);
      if (error) addRecorderLog(`recorder failed: ${error.message}`); else addRecorderLog('recorder completed successfully');
      recorderRunning = false;
    });
    res.json({ success: true, message: 'Recorder started successfully', fileName, path: outputPath, url });
  } catch (error) {
    recorderRunning = false;
    addRecorderLog(`start failed: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to start recorder', error: error.message });
  }
});

app.get('/api/recorder/status', (_, res) => {
  res.json({ success: true, running: recorderRunning, latestRecordingFile });
});

app.get('/api/recorder/latest', (_, res) => {
  try {
    if (!latestRecordingFile) return res.json({ success: true, fileName: '', code: '', ready: false });
    if (!fs.existsSync(latestRecordingFile)) return res.json({ success: true, fileName: path.basename(latestRecordingFile), code: '', ready: false });
    const code = fs.readFileSync(latestRecordingFile, 'utf-8');
    res.json({ success: true, fileName: path.basename(latestRecordingFile), code, ready: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to read latest recording', error: error.message });
  }
});

app.get('/api/recorder/logs', (_, res) => {
  res.json({ success: true, logs: recorderLogs });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
