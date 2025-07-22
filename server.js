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

app.get('/preview', (req, res) => {
  let html = fs.readFileSync('index.html', 'utf8');

  const basicPlaceholders = [
    'project_address', 'sales_rep', 'sales_email', 'sales_phone',
    'customer_name', 'customer_phone', 'customer_email', 'customer_address',
    'quote_id', 'quote_date', 'due_date',
    'subtotal_cost', 'gst_cost', 'total_cost',
    'items_html',
    'frame_colour', 'reveals_for', 'reveals_type', 'bal_required',
    'sales_person', 'frame_finish', 'profile'
  ];


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


app.post('/generate', async (req, res) => {
  const authHeader = req.headers['x-api-key'];
  if (authHeader !== SECRET_KEY) {
    return res.status(401).send('Unauthorized');
  }

  latestData = req.body;

  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const PORT = process.env.PORT || 3000;

    await page.goto(`http://localhost:${PORT}/preview`, {
      waitUntil: 'networkidle0'
    });

    await page.waitForTimeout(500);

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true
    });

    await browser.close();

    const fileName = req.body.file_name || 'quote.pdf';  // ✅ now dynamic

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`
    });

    res.send(pdfBuffer);

  } catch (error) {
    console.error('PDF generation failed:', error.message || error);
    res.status(500).send('Something went wrong.');
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
