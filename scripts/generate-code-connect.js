#!/usr/bin/env node
/**
 * Fetches all components from the Figma file and generates
 * Code Connect (.figma.html) files for each matched component.
 *
 * Usage:
 *   node scripts/generate-code-connect.js
 *
 * Then publish with:
 *   npx figma connect publish --token <your-token>
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const FILE_KEY = 'ZCtxvTK5o0GkIDZFTtx0sL';
const TOKEN = process.env.FIGMA_TOKEN;
if (!TOKEN) {
  console.error('Error: set FIGMA_TOKEN environment variable before running.');
  console.error('  export FIGMA_TOKEN=your_token_here');
  process.exit(1);
}
const BASE_URL = `https://www.figma.com/design/${FILE_KEY}/Contexi-design`;

// Map Figma component names (lowercase, partial match) → local HTML file
const HTML_MAP = [
  { match: ['nav', 'navigace', 'header', 'menu'],          file: '01-nav.html' },
  { match: ['download', 'stažen', 'pdf'],                  file: '02-downloads.html' },
  { match: ['faq', 'topic', 'téma', 'přehled'],            file: '03-faq-topics.html' },
  { match: ['faq', 'detail', 'kategor', 'cat'],            file: '04-faq-detail.html' },
  { match: ['comparison', 'porovn', 'compare', 'vs'],      file: '05-comparison.html' },
  { match: ['checkout', 'objednávk', 'order', 'cart'],     file: '06-checkout.html' },
  { match: ['ke stažení', 'section', 'sekce'],             file: 'ke-stazeni-section.html' },
];

function figmaGet(apiPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.figma.com',
      path: apiPath,
      headers: { 'X-Figma-Token': TOKEN },
    };
    https.get(options, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error(`JSON parse error: ${raw.slice(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

function matchHtmlFile(componentName) {
  const name = componentName.toLowerCase();
  for (const entry of HTML_MAP) {
    if (entry.match.some(keyword => name.includes(keyword))) {
      return entry.file;
    }
  }
  return null;
}

function extractSnippet(htmlFile) {
  const filePath = path.join(__dirname, '..', htmlFile);
  if (!fs.existsSync(filePath)) return `<!-- ${htmlFile} not found -->`;
  const html = fs.readFileSync(filePath, 'utf8');

  // Extract the first meaningful element after <body> (skip back-bar)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!bodyMatch) return '<!-- could not extract body -->';

  let body = bodyMatch[1]
    .replace(/<div class="back-bar">[\s\S]*?<\/div>/i, '')  // remove back link
    .replace(/<!--[\s\S]*?-->/g, '')                          // remove comments
    .trim();

  // Return first top-level element only (trim to reasonable length)
  const firstElement = body.match(/^(<(?:header|section|nav|div|article|aside|main)[^>]*>[\s\S]*)/i);
  const snippet = firstElement ? firstElement[1] : body;

  // Truncate very long snippets with a note
  if (snippet.length > 3000) {
    return snippet.slice(0, 3000) + '\n<!-- ... (truncated, see ' + htmlFile + ') -->';
  }
  return snippet;
}

function writeCodeConnect(component, htmlFile) {
  const nodeId = component.node_id.replace(':', '-');
  const figmaUrl = `${BASE_URL}?node-id=${nodeId}`;
  const snippet = extractSnippet(htmlFile);
  const outName = htmlFile.replace('.html', '.figma.html');
  const outPath = path.join(__dirname, '..', outName);

  const content = `<!-- figma-code-connect
{
  "figmaNode": "${figmaUrl}",
  "imports": []
}
-->
${snippet}
`;

  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`  ✓  ${outName}  ←  "${component.name}" (${nodeId})`);
}

async function main() {
  console.log('Fetching components from Figma…\n');

  const data = await figmaGet(`/v1/files/${FILE_KEY}/components`);

  if (!data.meta?.components) {
    console.error('Unexpected response:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const components = data.meta.components;
  console.log(`Found ${components.length} published component(s):\n`);

  const unmatched = [];

  for (const c of components) {
    const htmlFile = matchHtmlFile(c.name);
    if (htmlFile) {
      writeCodeConnect(c, htmlFile);
    } else {
      unmatched.push(c);
    }
  }

  if (unmatched.length) {
    console.log('\nUnmatched components (no HTML file mapped):');
    unmatched.forEach(c => {
      const nodeId = c.node_id.replace(':', '-');
      console.log(`  -  "${c.name}"  node-id: ${nodeId}`);
    });
    console.log('\nAdd entries to HTML_MAP in this script to connect them.');
  }

  console.log('\nDone. Now publish with:');
  console.log('  npx figma connect publish --token $FIGMA_TOKEN\n');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
