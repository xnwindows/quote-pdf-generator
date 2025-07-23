const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const app = express();

// Parse incoming JSON
app.use(bodyParser.json());

// Serve static files (CSS, logo, etc.)
app.use(express.static(path.join(__dirname)));

// Store latest request data for preview rendering
let latestData = {};

// Secure the endpoint with an API key
const SECRET_KEY = process.env.SECRET_KEY || 'changeme';

// GET /preview — render HTML with current data
app.get('/preview', (req, res) => {
  let html = fs.readFileSync('index.html', 'utf8');

  const basicPlaceholders = [
    'project_address',
    'customer_name', 'customer_phone', 'customer_email', 'customer_address',
    'quote_id', 'quote_date', 'due_date',
    'subtotal_cost', 'gst_cost', 'total_cost',
    'items_html',
    'reveals_type', 'bal_required',
    'sales_person', 'frame_finish', 'profile'
  ];

  // Replace all simple placeholders
  basicPlaceholders.forEach(key => {
    html = html.replace(new RegExp(`{{${key}}}`, 'g'), latestData[key] || '');
  });

  // Handle conditional cost rows
  const row = (label, value) => `<tr><td>${label}</td><td>${value}</td></tr>`;

  html = html.replace('{{delivery_fee_row}}', latestData.delivery_fee ? row('Delivery Fee', latestData.delivery_fee) : '');
  html = html.replace('{{demolition_fee_row}}', latestData.demolition_fee ? row('Demolition / Rubbish Removal', latestData.demolition_fee) : '');
  html = html.replace('{{installation_fee_row}}', latestData.installation_fee ? row('Installation Fee', latestData.installation_fee) : '');
  html = html.replace('{{disposal_fee_row}}', latestData.disposal_fee ? row('Waste Disposal Fee', latestData.disposal_fee) : '');
  html = html.replace('{{gst_cost_row}}', latestData.gst_cost ? row('GST (10%)', latestData.gst_cost) : '');

  res.send(html);
});

// POST /generate — generate the PDF
app.post('/generate', async (req, res) => {
  const authHeader = req.headers['x-api-key'];
  if (authHeader !== SECRET_KEY) {
    return res.status(401).send('Unauthorized');
  }

  const data = req.body;

  // Validate payload
  if (!data || typeof data !== 'object') {
    return res.status(400).send('Invalid payload');
  }

  // Sanitize: prevent nulls/undefined breaking things
  for (const key in data) {
    if (data[key] === null || data[key] === undefined) {
      data[key] = '';
    }
  }

  // Required fields check (allow "", but not undefined/null)
  const requiredFields = ['quote_id', 'items_html', 'total_cost'];
  const missingFields = requiredFields.filter(field => data[field] === undefined || data[field] === null);

  if (missingFields.length) {
    return res.status(400).send(`Missing required fields: ${missingFields.join(', ')}`);
  }

  latestData = data;

  try {
    const chromiumPath = fs.existsSync('/usr/bin/chromium')
      ? '/usr/bin/chromium'
      : '/usr/bin/chromium-browser';

    const browser = await puppeteer.launch({
      headless: 'new',
      executablePath: chromiumPath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const PORT = process.env.PORT || 3000;

    await page.goto(`http://localhost:${PORT}/preview`, { waitUntil: 'networkidle0' });

    await page.waitForTimeout(300); // Give CSS/images a moment

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true
    });

    await browser.close();

    const fileName = data.file_name || 'quote.pdf';

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`
    });

    res.send(pdfBuffer);

  } catch (error) {
    console.error('PDF generation failed:', error.message || error);
    res.status(500).send('Something went wrong generating the PDF.');
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
