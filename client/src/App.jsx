import React, { useEffect, useMemo, useState } from 'react';

const API = 'http://localhost:4000/api';

async function api(url, options = {}) {
  const res = await fetch(`${API}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

const emptyAssertion = {
  type: 'toBeVisible',
  target: 'page.locator("css=selector")',
  expected: ''
};

export default function App() {
  const [suites, setSuites] = useState([]);
  const [suiteName, setSuiteName] = useState('Sample Suite');
  const [testName, setTestName] = useState('Generated Test');
  const [selectedSuiteId, setSelectedSuiteId] = useState('');
  const [selectedTestId, setSelectedTestId] = useState('');
  const [importPath, setImportPath] = useState('');
  const [recordUrl, setRecordUrl] = useState('https://example.com');
  const [code, setCode] = useState(`await page.goto('https://example.com');
await page.getByRole('link', { name: 'More information...' }).click();
await page.locator('#search').fill('playwright');
await expect(page).toHaveURL(/example/);`);
  const [steps, setSteps] = useState([]);
  const [assertion, setAssertion] = useState(emptyAssertion);
  const [generated, setGenerated] = useState('');
  const [runResult, setRunResult] = useState('');
  const [message, setMessage] = useState('');
  const [recorderRunning, setRecorderRunning] = useState(false);
  const [recorderLogs, setRecorderLogs] = useState('');

  const currentSuite = useMemo(() => {
    return suites.find((s) => s.id === selectedSuiteId);
  }, [suites, selectedSuiteId]);

  const currentTest = useMemo(() => {
    return currentSuite?.tests?.find((t) => t.id === selectedTestId);
  }, [currentSuite, selectedTestId]);

  async function refresh() {
    try {
      const data = await api('/suites');
      setSuites(data);

      if (!selectedSuiteId && data[0]) {
        setSelectedSuiteId(data[0].id);
      }
    } catch (err) {
      setMessage(`Refresh failed: ${err.message}`);
    }
  }

  async function refreshRecorderStatus() {
    try {
      const data = await api('/recorder/status');
      setRecorderRunning(Boolean(data.running));
    } catch (err) {
      console.error(err);
      setRecorderRunning(false);
    }
  }

  async function loadRecorderLogs() {
    try {
      const data = await api('/recorder/logs');
      setRecorderLogs((data.logs || []).join('\n'));
    } catch (err) {
      setRecorderLogs(`Failed to load logs: ${err.message}`);
    }
  }

  useEffect(() => {
    refresh();
    refreshRecorderStatus();

    const statusTimer = setInterval(() => {
      refreshRecorderStatus();
    }, 2000);

    return () => clearInterval(statusTimer);
  }, []);

  useEffect(() => {
    if (!recorderRunning) return;

    const timer = setInterval(async () => {
      try {
        const status = await api('/recorder/status');
        setRecorderRunning(Boolean(status.running));

        const data = await api('/recorder/latest');
        if (data.ready && data.code) {
          setCode(data.code);
          setMessage(`Loaded latest recording: ${data.fileName}`);
        }
      } catch (err) {
        console.error(err);
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [recorderRunning]);

  async function createSuite() {
    try {
      const suite = await api('/suites', {
        method: 'POST',
        body: JSON.stringify({ name: suiteName })
      });
      setSelectedSuiteId(suite.id);
      setMessage('Suite created');
      await refresh();
    } catch (err) {
      setMessage(`Create suite failed: ${err.message}`);
    }
  }

  async function createTest() {
    if (!selectedSuiteId) {
      alert('Create/select suite first');
      return;
    }

    try {
      const test = await api('/tests', {
        method: 'POST',
        body: JSON.stringify({
          suiteId: selectedSuiteId,
          name: testName,
          code
        })
      });
      setSelectedTestId(test.id);
      setMessage('Test created');
      await refresh();
    } catch (err) {
      setMessage(`Create test failed: ${err.message}`);
    }
  }

  async function parseCode() {
    try {
      const data = await api('/parse', {
        method: 'POST',
        body: JSON.stringify({ code })
      });

      const parsedSteps = Array.isArray(data.steps) ? data.steps : [];
      setSteps(parsedSteps);
      setMessage(`Parsed ${parsedSteps.length} steps`);
    } catch (err) {
      setSteps([]);
      setMessage(`Parse failed: ${err.message}`);
    }
  }

  async function saveSteps() {
    if (!selectedTestId) {
      alert('Create/select test first');
      return;
    }

    try {
      await api(`/tests/${selectedTestId}/steps`, {
        method: 'PUT',
        body: JSON.stringify({ steps })
      });
      setMessage('Steps saved');
      await refresh();
    } catch (err) {
      setMessage(`Save steps failed: ${err.message}`);
    }
  }

  async function addAssertion() {
    if (!selectedTestId) {
      alert('Create/select test first');
      return;
    }

    try {
      await api(`/tests/${selectedTestId}/assertions`, {
        method: 'POST',
        body: JSON.stringify(assertion)
      });
      setAssertion(emptyAssertion);
      setMessage('Assertion added');
      await refresh();
    } catch (err) {
      setMessage(`Add assertion failed: ${err.message}`);
    }
  }

  async function generate() {
    if (!selectedTestId) {
      alert('Create/select test first');
      return;
    }

    try {
      const data = await api(`/tests/${selectedTestId}/generate`, {
        method: 'POST'
      });
      setGenerated(data.code || '');
      setMessage(`Generated ${data.fileName}`);
    } catch (err) {
      setMessage(`Generate failed: ${err.message}`);
    }
  }

  async function runTest() {
    if (!selectedTestId) {
      alert('Create/select test first');
      return;
    }

    try {
      const data = await api(`/tests/${selectedTestId}/run`, {
        method: 'POST'
      });
      setRunResult(data.stdout || data.stderr || 'Execution finished');
      setMessage('Test executed');
    } catch (err) {
      setRunResult(String(err));
      setMessage(`Execution failed: ${err.message}`);
    }
  }

  function updateStep(index, key, value) {
    setSteps((prev) =>
      prev.map((step, i) => (i === index ? { ...step, [key]: value } : step))
    );
  }

  function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      setCode(content);
      setMessage(`Imported script from file: ${file.name}`);
    };
    reader.onerror = () => {
      setMessage('Failed to read selected file');
    };
    reader.readAsText(file);
  }

  async function handleImportRecordedScript() {
    if (!importPath.trim()) {
      setMessage('Enter import path');
      return;
    }

    try {
      const res = await fetch(importPath.trim());
      if (!res.ok) {
        throw new Error('Could not load script from path');
      }
      const content = await res.text();
      setCode(content);
      setMessage('Imported script from provided path');
    } catch (err) {
      setMessage(`Import failed: ${err.message}`);
    }
  }

  async function startRecorder() {
    try {
      const data = await api('/recorder/start', {
        method: 'POST',
        body: JSON.stringify({ url: recordUrl })
      });

      setRecorderRunning(true);
      setMessage(`Recorder started for ${data.url}`);
      await loadRecorderLogs();
    } catch (err) {
      setMessage(`Recorder start failed: ${err.message}`);
      await loadRecorderLogs();
    }
  }

  async function loadLatestRecording() {
    try {
      const data = await api('/recorder/latest');
      if (data.ready && data.code) {
        setCode(data.code || '');
        setMessage(`Loaded latest recording: ${data.fileName}`);
      } else {
        setMessage('Recording file is not ready yet');
      }
    } catch (err) {
      setMessage(`Load latest recording failed: ${err.message}`);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>No-Code Playwright Test Composer</h1>
        <p>MVP to parse, edit, assert, generate, run, and import Playwright tests.</p>
      </header>

      <div className="grid">
        <section className="card">
          <h2>1. Suites & Tests</h2>

          <div className="row">
            <input value={suiteName} onChange={(e) => setSuiteName(e.target.value)} placeholder="Suite name" />
            <button onClick={createSuite}>Create Suite</button>
          </div>

          <div className="row">
            <select value={selectedSuiteId} onChange={(e) => setSelectedSuiteId(e.target.value)}>
              <option value="">Select suite</option>
              {suites.map((suite) => (
                <option key={suite.id} value={suite.id}>{suite.name}</option>
              ))}
            </select>
          </div>

          <div className="row">
            <input value={testName} onChange={(e) => setTestName(e.target.value)} placeholder="Test name" />
            <button onClick={createTest}>Create Test</button>
          </div>

          {currentSuite && (
            <div className="list">
              <strong>Tests in suite:</strong>
              {currentSuite.tests.map((test) => (
                <button
                  key={test.id}
                  className={selectedTestId === test.id ? 'active item' : 'item'}
                  onClick={() => setSelectedTestId(test.id)}
                >
                  {test.name}
                </button>
              ))}
            </div>
          )}

          {currentTest && (
            <div className="hint">
              Selected test: <strong>{currentTest.name}</strong>
            </div>
          )}
        </section>

        <section className="card">
          <h2>2. Import Playwright Code</h2>

          <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={12} />

          <div className="row">
            <button onClick={parseCode}>Parse Code</button>
            <button onClick={saveSteps}>Save Steps</button>
          </div>

          <hr />

          <h3>Import Recorded Script</h3>

          <div className="row">
            <input type="file" accept=".js,.ts,.txt" onChange={handleImportFile} />
          </div>

          <div className="row">
            <input
              value={importPath}
              onChange={(e) => setImportPath(e.target.value)}
              placeholder="App-served path or URL"
            />
            <button onClick={handleImportRecordedScript}>Import From Path</button>
          </div>

          <hr />

          <h3>Record with Playwright Codegen</h3>

          <div className="row">
            <input
              value={recordUrl}
              onChange={(e) => setRecordUrl(e.target.value)}
              placeholder="Enter URL to record"
            />
            <button onClick={startRecorder}>Record</button>
            <button onClick={loadLatestRecording}>Load Latest Recording</button>
            <button onClick={loadRecorderLogs}>Show Recorder Logs</button>
          </div>

          <div className="hint">
            Enter a URL, click Record, perform actions in the opened Playwright window, then click Load Latest Recording.
          </div>

          <div className="hint">
            Recorder running: <strong>{recorderRunning ? 'Yes' : 'No'}</strong>
          </div>

          <pre>{recorderLogs || '// recorder logs appear here'}</pre>
        </section>

        <section className="card full">
          <h2>3. Parsed Steps</h2>
          <div className="steps">
            {steps.length === 0 && <p>No parsed steps yet.</p>}
            {steps.map((step, idx) => (
              <div className="step" key={idx}>
                <select value={step.type} onChange={(e) => updateStep(idx, 'type', e.target.value)}>
                  {['navigate', 'click', 'fill', 'press', 'select', 'check', 'uncheck', 'wait', 'assertion', 'custom'].map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>

                <input
                  value={step.target || ''}
                  onChange={(e) => updateStep(idx, 'target', e.target.value)}
                  placeholder="target"
                />

                <input
                  value={step.value || ''}
                  onChange={(e) => updateStep(idx, 'value', e.target.value)}
                  placeholder="value"
                />
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>4. Add Assertion</h2>
          <select
            value={assertion.type}
            onChange={(e) => setAssertion({ ...assertion, type: e.target.value })}
          >
            <option value="toBeVisible">toBeVisible</option>
            <option value="toContainText">toContainText</option>
            <option value="toHaveValue">toHaveValue</option>
            <option value="toHaveURL">toHaveURL</option>
          </select>

          <input
            value={assertion.target}
            onChange={(e) => setAssertion({ ...assertion, target: e.target.value })}
            placeholder="target"
          />

          <input
            value={assertion.expected}
            onChange={(e) => setAssertion({ ...assertion, expected: e.target.value })}
            placeholder="expected"
          />

          <button onClick={addAssertion}>Add Assertion</button>
          <div className="hint">Example target: page.locator('#search')</div>
        </section>

        <section className="card">
          <h2>5. Generate & Run Test</h2>
          <div className="row">
            <button onClick={generate}>Generate Playwright File</button>
            <button onClick={runTest}>Run Test</button>
          </div>

          <h3>Generated Script</h3>
          <pre>{generated || '// generated code appears here'}</pre>

          <h3>Execution Result</h3>
          <pre>{runResult || '// execution output appears here'}</pre>
        </section>
      </div>

      <footer>{message}</footer>
    </div>
  );
}
