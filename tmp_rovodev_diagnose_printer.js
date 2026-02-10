#!/usr/bin/env node
// COMPREHENSIVE PRINTER DIAGNOSTIC TOOL
// This script will help identify why your thermal printer prints blank

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

let diagWin;
let testNumber = 0;

function log(msg) {
  console.log(`[TEST ${testNumber}] ${msg}`);
}

function createDiagnosticWindow() {
  diagWin = new BrowserWindow({
    width: 800,
    height: 1000,
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  const menuHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 20px;
          background: #f5f5f5;
        }
        h1 { color: #333; }
        .test-card {
          background: white;
          padding: 20px;
          margin: 15px 0;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        button {
          background: #10b981;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          margin: 5px;
        }
        button:hover { background: #059669; }
        .warning { background: #fef3c7; padding: 10px; border-radius: 4px; margin: 10px 0; }
        pre { background: #1f2937; color: #10b981; padding: 10px; border-radius: 4px; overflow-x: auto; }
      </style>
    </head>
    <body>
      <h1>🖨️ Thermal Printer Diagnostic Tool</h1>
      
      <div class="warning">
        <strong>⚠️ Important:</strong> Each test will open a print dialog. Select your thermal printer and check the preview before printing.
      </div>

      <div class="test-card">
        <h2>Test 1: Ultra Simple Text</h2>
        <p>Simplest possible HTML with just text. If this doesn't print, your printer driver has issues.</p>
        <button onclick="runTest(1)">Run Test 1</button>
        <pre id="test1-result">Not run yet</pre>
      </div>

      <div class="test-card">
        <h2>Test 2: Black Text with Borders</h2>
        <p>Text with visible borders to ensure rendering is happening.</p>
        <button onclick="runTest(2)">Run Test 2</button>
        <pre id="test2-result">Not run yet</pre>
      </div>

      <div class="test-card">
        <h2>Test 3: Receipt-Style Layout</h2>
        <p>Mimics actual receipt structure with flexbox layout.</p>
        <button onclick="runTest(3)">Run Test 3</button>
        <pre id="test3-result">Not run yet</pre>
      </div>

      <div class="test-card">
        <h2>Test 4: Actual Receipt HTML (From App)</h2>
        <p>Uses the exact same HTML structure as your POS app.</p>
        <button onclick="runTest(4)">Run Test 4</button>
        <pre id="test4-result">Not run yet</pre>
      </div>

      <div class="test-card">
        <h2>📊 Diagnostic Results</h2>
        <div id="results">
          <p>Run tests above to see results...</p>
        </div>
      </div>

      <script>
        let testResults = {};

        function runTest(num) {
          fetch('http://localhost:39275/run-test/' + num)
            .then(r => r.json())
            .then(data => {
              document.getElementById('test' + num + '-result').textContent = 
                JSON.stringify(data, null, 2);
              testResults[num] = data;
              updateDiagnostic();
            })
            .catch(err => {
              document.getElementById('test' + num + '-result').textContent = 
                'Error: ' + err.message;
            });
        }

        function updateDiagnostic() {
          const resultsDiv = document.getElementById('results');
          let html = '<h3>Analysis:</h3><ul>';
          
          if (testResults[1]?.printed) {
            html += '<li>✅ Test 1 passed - Basic printing works</li>';
          } else if (testResults[1]) {
            html += '<li>❌ Test 1 failed - Printer driver issue or hardware problem</li>';
          }

          if (testResults[2]?.printed) {
            html += '<li>✅ Test 2 passed - Black text and borders render</li>';
          } else if (testResults[2]) {
            html += '<li>❌ Test 2 failed - Text rendering issue</li>';
          }

          if (testResults[3]?.printed) {
            html += '<li>✅ Test 3 passed - Flexbox layouts work</li>';
          } else if (testResults[3]) {
            html += '<li>❌ Test 3 failed - CSS layout issue</li>';
          }

          if (testResults[4]?.printed) {
            html += '<li>✅ Test 4 passed - Receipt HTML works!</li>';
          } else if (testResults[4]) {
            html += '<li>❌ Test 4 failed - Receipt-specific issue</li>';
          }

          html += '</ul>';
          resultsDiv.innerHTML = html;
        }
      </script>
    </body>
    </html>
  `;

  diagWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(menuHtml));
}

// Simple HTTP server to handle test requests
const http = require('http');
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const match = req.url.match(/\/run-test\/(\d+)/);
  if (match) {
    const testNum = parseInt(match[1]);
    runPrintTest(testNum).then(result => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    }).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

async function runPrintTest(num) {
  testNumber = num;
  log('Starting test...');

  return new Promise((resolve) => {
    const printWin = new BrowserWindow({
      width: 400,
      height: 600,
      show: true, // Show window for debugging
    });

    let html = '';

    switch (num) {
      case 1:
        html = `
          <!DOCTYPE html>
          <html>
          <head><meta charset="UTF-8"></head>
          <body style="margin:20px; font-family:monospace; font-size:20px;">
            <h1 style="color:black;">TEST 1</h1>
            <p style="color:black;">Line 1</p>
            <p style="color:black;">Line 2</p>
            <p style="color:black;">Line 3</p>
          </body>
          </html>
        `;
        break;

      case 2:
        html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              * { -webkit-print-color-adjust: exact !important; }
              body { margin: 10px; font-family: monospace; font-size: 16px; }
              p { 
                color: #000000 !important; 
                border: 2px solid black;
                padding: 10px;
                margin: 10px 0;
                background: white;
              }
            </style>
          </head>
          <body>
            <h1 style="color:black; border:3px solid black; padding:10px;">TEST 2</h1>
            <p>This text has a black border</p>
            <p>████████████████████</p>
            <p>If you see borders, rendering works</p>
          </body>
          </html>
        `;
        break;

      case 3:
        html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              * { -webkit-print-color-adjust: exact !important; }
              @page { size: 80mm auto; margin: 0; }
              body {
                width: 80mm;
                margin: 0;
                padding: 5mm;
                font-family: 'Courier New', monospace;
                font-size: 12px;
              }
              .row {
                display: flex;
                justify-content: space-between;
                margin: 2mm 0;
                color: #000000;
              }
              .divider {
                border-top: 1px dashed #000;
                margin: 3mm 0;
              }
            </style>
          </head>
          <body>
            <div style="text-align:center; font-weight:bold; font-size:14px; color:black;">
              TEST RECEIPT 3
            </div>
            <div class="divider"></div>
            <div class="row">
              <span>Item A</span>
              <span>₹50.00</span>
            </div>
            <div class="row">
              <span>Item B</span>
              <span>₹75.00</span>
            </div>
            <div class="divider"></div>
            <div class="row" style="font-weight:bold;">
              <span>TOTAL</span>
              <span>₹125.00</span>
            </div>
          </body>
          </html>
        `;
        break;

      case 4:
        html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              * { -webkit-print-color-adjust: exact !important; }
              @page { size: 80mm auto; margin: 0; }
              body {
                width: 80mm;
                margin: 0;
                padding: 3mm 2mm;
                font-family: 'Courier New', Courier, monospace;
                font-size: 12px;
                line-height: 1.4;
                color: #000000;
                background: #ffffff;
              }
              .receipt-preview { width: 100%; }
              .receipt-store { text-align: center; margin-bottom: 5mm; }
              .receipt-store-name { 
                font-size: 16px; 
                font-weight: bold; 
                margin-bottom: 2mm; 
                text-transform: uppercase; 
              }
              .receipt-store-sub { font-size: 10px; margin: 1mm 0; }
              .receipt-divider {
                border-top: 2px dashed #000000;
                margin: 3mm 0;
                width: 100%;
              }
              .receipt-items { width: 100%; margin: 3mm 0; }
              .receipt-items-header,
              .receipt-item-row {
                display: flex;
                justify-content: space-between;
                width: 100%;
              }
              .receipt-items-header {
                font-weight: bold;
                font-size: 10px;
                margin-bottom: 2mm;
                padding-bottom: 1mm;
                border-bottom: 1px solid #000000;
              }
              .receipt-item-row {
                margin: 2mm 0;
                font-size: 10px;
              }
              .r-col-name { flex: 0 0 40%; text-align: left; }
              .r-col-qty { flex: 0 0 18%; text-align: right; }
              .r-col-rate { flex: 0 0 21%; text-align: right; }
              .r-col-amt { flex: 0 0 21%; text-align: right; font-weight: bold; }
              .receipt-totals {
                margin-top: 3mm;
                padding-top: 2mm;
                border-top: 1px solid #000000;
              }
              .receipt-total-row {
                display: flex;
                justify-content: space-between;
                margin: 2mm 0;
                font-size: 11px;
              }
              .receipt-total-row-strong {
                font-weight: bold;
                font-size: 14px;
                margin-top: 2mm;
                padding-top: 2mm;
                border-top: 2px solid #000000;
              }
              .receipt-footer {
                margin-top: 5mm;
                text-align: center;
                font-size: 10px;
              }
            </style>
          </head>
          <body>
            <div class="receipt-preview">
              <div class="receipt-store">
                <div class="receipt-store-name">GREENHOUSE</div>
                <div class="receipt-store-sub">Test Store Address</div>
                <div class="receipt-store-sub">Invoice: TEST-004</div>
                <div class="receipt-store-sub">10/02/2026, 4:24 PM</div>
              </div>
              <div class="receipt-divider"></div>
              <div class="receipt-items">
                <div class="receipt-items-header">
                  <span class="r-col-name">Item</span>
                  <span class="r-col-qty">Qty</span>
                  <span class="r-col-rate">Rate</span>
                  <span class="r-col-amt">Amount</span>
                </div>
                <div class="receipt-item-row">
                  <span class="r-col-name">Potato (1kg)</span>
                  <span class="r-col-qty">2.000</span>
                  <span class="r-col-rate">₹25.00</span>
                  <span class="r-col-amt">₹50.00</span>
                </div>
                <div class="receipt-item-row">
                  <span class="r-col-name">Tomato (1kg)</span>
                  <span class="r-col-qty">1.500</span>
                  <span class="r-col-rate">₹30.00</span>
                  <span class="r-col-amt">₹45.00</span>
                </div>
              </div>
              <div class="receipt-divider"></div>
              <div class="receipt-totals">
                <div class="receipt-total-row">
                  <span>Subtotal</span>
                  <span>₹95.00</span>
                </div>
                <div class="receipt-total-row">
                  <span>Tax / Adjustments</span>
                  <span>₹0.00</span>
                </div>
                <div class="receipt-total-row receipt-total-row-strong">
                  <span>Grand total</span>
                  <span>₹95.00</span>
                </div>
              </div>
              <div class="receipt-footer">
                <div>Thank you for shopping with us 🌿</div>
              </div>
            </div>
          </body>
          </html>
        `;
        break;
    }

    printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    printWin.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        log('Sending to printer...');
        
        printWin.webContents.print(
          {
            silent: false, // Show dialog
            printBackground: true,
            color: false,
            margins: { marginType: 'none' },
          },
          (success, failureReason) => {
            log(`Print result: ${success ? 'SUCCESS' : 'FAILED - ' + failureReason}`);
            
            setTimeout(() => {
              printWin.close();
              resolve({
                test: num,
                printed: success,
                error: failureReason || null,
                timestamp: new Date().toISOString(),
              });
            }, 1000);
          }
        );
      }, 1000);
    });
  });
}

app.whenReady().then(() => {
  console.log('🚀 Printer Diagnostic Tool Starting...');
  console.log('📝 This tool will help identify why your thermal printer prints blank.\n');
  
  server.listen(39275, () => {
    console.log('✅ Test server listening on http://localhost:39275');
  });
  
  createDiagnosticWindow();
});

app.on('window-all-closed', () => {
  server.close();
  app.quit();
});
