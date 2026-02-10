// MINIMAL ELECTRON PRINT TEST
// Run with: node tmp_rovodev_simple_test.js
// This will create a simple Electron window and try to print plain text

const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 400,
    height: 600,
    show: true, // Show window to see what's being printed
  });

  // Create minimal HTML with guaranteed visible text
  const testHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        @page { size: 80mm auto; margin: 0; }
        body {
          margin: 0;
          padding: 10px;
          font-family: monospace;
          font-size: 16px;
          font-weight: bold;
          background: white;
        }
        p {
          color: #000000 !important;
          background: white !important;
          margin: 5px 0;
          padding: 5px;
          border: 1px solid black;
        }
      </style>
    </head>
    <body>
      <h1 style="color: black;">PRINT TEST</h1>
      <p>Line 1: This is test text</p>
      <p>Line 2: ABCDEFGHIJKLMNOP</p>
      <p>Line 3: 1234567890</p>
      <p>Line 4: If you see this, printer works!</p>
      <p>Line 5: ████████████████</p>
    </body>
    </html>
  `;

  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(testHtml));

  win.webContents.once('did-finish-load', () => {
    console.log('✅ Page loaded');
    
    setTimeout(() => {
      console.log('🖨️ Attempting to print...');
      
      // Try printing with minimal settings
      win.webContents.print(
        {
          silent: false, // Show print dialog so you can verify printer
          printBackground: true,
          color: false,
          margins: { marginType: 'none' },
        },
        (success, failureReason) => {
          if (success) {
            console.log('✅ Print job sent successfully!');
          } else {
            console.error('❌ Print failed:', failureReason);
          }
          console.log('Window will stay open. Close manually or press Ctrl+C');
        }
      );
    }, 2000);
  });
}

app.whenReady().then(() => {
  console.log('🚀 Starting minimal print test...');
  console.log('📝 This will show a print dialog. Select your thermal printer and print.');
  console.log('📝 If the test page prints blank, the issue is with your printer driver/settings.');
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
