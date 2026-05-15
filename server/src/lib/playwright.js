export function parsePlaywrightCode(code = '') {
  if (!code || typeof code !== 'string') return [];

  const cleanedCode = stripWrapperCode(code);

  const lines = cleanedCode
    .split('
')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//'));

  const steps = [];

  for (const line of lines) {
    let match;

    match = line.match(/await\s+page\.goto\((['"`])(.*?)\);?/);
    if (match) {
      steps.push({ type: 'navigate', target: match[2], value: '' });
      continue;
    }

    match = line.match(/await\s+page\.click\((['"`])(.*?)\);?/);
    if (match) {
      steps.push({ type: 'click', target: match[2], value: '' });
      continue;
    }

    match = line.match(/await\s+page\.fill\((['"`])(.*?)\s*,\s*(['"`])(.*?)\);?/);
    if (match) {
      steps.push({ type: 'fill', target: match[2], value: match[4] });
      continue;
    }

    match = line.match(/await\s+page\.locator\((['"`])(.*?)\)\.click\(\);?/);
    if (match) {
      steps.push({ type: 'click', target: match[2], value: '' });
      continue;
    }

    match = line.match(/await\s+page\.locator\((['"`])(.*?)\)\.fill\((['"`])(.*?)\);?/);
    if (match) {
      steps.push({ type: 'fill', target: match[2], value: match[4] });
      continue;
    }

    match = line.match(/await\s+page\.locator\((['"`])(.*?)\)\.press\((['"`])(.*?)\);?/);
    if (match) {
      steps.push({ type: 'press', target: match[2], value: match[4] });
      continue;
    }

    match = line.match(/await\s+page\.locator\((['"`])(.*?)\)\.selectOption\((['"`])(.*?)\);?/);
    if (match) {
      steps.push({ type: 'select', target: match[2], value: match[4] });
      continue;
    }

    match = line.match(/await\s+page\.locator\((['"`])(.*?)\)\.check\(\);?/);
    if (match) {
      steps.push({ type: 'check', target: match[2], value: '' });
      continue;
    }

    match = line.match(/await\s+page\.locator\((['"`])(.*?)\)\.uncheck\(\);?/);
    if (match) {
      steps.push({ type: 'uncheck', target: match[2], value: '' });
      continue;
    }

    match = line.match(/await\s+(page\.[\w$]+\(.*\))\.click\(\);?/);
    if (match) {
      steps.push({ type: 'click', target: match[1], value: '' });
      continue;
    }

    match = line.match(/await\s+(page\.[\w$]+\(.*\))\.fill\((['"`])(.*?)\);?/);
    if (match) {
      steps.push({ type: 'fill', target: match[1], value: match[3] });
      continue;
    }

    if (
      line.startsWith('import ') ||
      line.startsWith('test(') ||
      line.startsWith('test.describe(') ||
      line === '});' ||
      line === '})'
    ) {
      continue;
    }

    if (line.includes('await expect(') || line.includes('expect(')) {
      steps.push({ type: 'assertion', target: line, value: '' });
      continue;
    }

    steps.push({ type: 'custom', target: line, value: '' });
  }

  return steps;
}

export function generatePlaywrightTest({ suiteName, testName, steps = [], assertions = [] }) {
  const lines = [];

  for (const step of steps) {
    const target = (step.target || '').trim();

    if (!target || target.startsWith('import ') || target.startsWith('test(') || target.startsWith('test.describe(')) {
      continue;
    }

    switch (step.type) {
      case 'navigate':
        lines.push(`    await page.goto('${escapeText(step.target)}');`);
        break;
      case 'click':
        if ((step.target || '').startsWith('page.')) {
          lines.push(`    await ${step.target}.click();`);
        } else {
          lines.push(`    await page.locator('${escapeText(step.target)}').click();`);
        }
        break;
      case 'fill':
        if ((step.target || '').startsWith('page.')) {
          lines.push(`    await ${step.target}.fill('${escapeText(step.value || '')}');`);
        } else {
          lines.push(`    await page.locator('${escapeText(step.target)}').fill('${escapeText(step.value || '')}');`);
        }
        break;
      case 'press':
        lines.push(`    await page.locator('${escapeText(step.target)}').press('${escapeText(step.value || '')}');`);
        break;
      case 'select':
        lines.push(`    await page.locator('${escapeText(step.target)}').selectOption('${escapeText(step.value || '')}');`);
        break;
      case 'check':
        lines.push(`    await page.locator('${escapeText(step.target)}').check();`);
        break;
      case 'uncheck':
        lines.push(`    await page.locator('${escapeText(step.target)}').uncheck();`);
        break;
      case 'wait':
        lines.push(`    await page.waitForTimeout(${Number(step.value) || 1000});`);
        break;
      case 'assertion':
      case 'custom':
        if (!step.target.startsWith('import ') && !step.target.startsWith('test(') && !step.target.startsWith('test.describe(')) {
          lines.push(`    ${step.target}`);
        }
        break;
      default:
        lines.push(`    // Unsupported step: ${JSON.stringify(step)}`);
    }
  }

  for (const assertion of assertions) {
    switch (assertion.type) {
      case 'toBeVisible':
        lines.push(`    await expect(${assertion.target}).toBeVisible();`);
        break;
      case 'toContainText':
        lines.push(`    await expect(${assertion.target}).toContainText('${escapeText(assertion.expected || '')}');`);
        break;
      case 'toHaveValue':
        lines.push(`    await expect(${assertion.target}).toHaveValue('${escapeText(assertion.expected || '')}');`);
        break;
      case 'toHaveURL':
        lines.push(`    await expect(${assertion.target}).toHaveURL('${escapeText(assertion.expected || '')}');`);
        break;
      default:
        lines.push(`    // Unsupported assertion: ${JSON.stringify(assertion)}`);
    }
  }

  return `import { test, expect } from '@playwright/test';

test.describe('${escapeText(suiteName || 'Generated Suite')}', () => {
  test('${escapeText(testName || 'Generated Test')}', async ({ page }) => {
${lines.join('
')}
  });
});
`;
}

function stripWrapperCode(code = '') {
  return String(code)
    .replace(/^import\s.+$/gm, '')
    .replace(/^test\.describe\(.*$/gm, '')
    .replace(/^test\(.*$/gm, '')
    .replace(/^\}\);?$/gm, '')
    .replace(/^\}$/gm, '')
    .trim();
}

function escapeText(value = '') {
  return String(value).replace(/\/g, '\\').replace(/'/g, "\'");
}
