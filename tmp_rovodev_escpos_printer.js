// ESC/POS RAW PRINTER - Alternative to HTML Printing
// This sends raw ESC/POS commands directly to thermal printers
// Use this if HTML printing continues to fail

const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const path = require('path');

/**
 * ESC/POS Command Builder
 * Creates raw byte commands that thermal printers understand
 */
class ESCPOSPrinter {
  constructor() {
    this.buffer = [];
    
    // ESC/POS commands
    this.ESC = 0x1B;
    this.GS = 0x1D;
    this.LF = 0x0A;
    this.CR = 0x0D;
  }

  // Initialize printer
  init() {
    this.buffer.push(this.ESC, 0x40); // ESC @ - Initialize
    return this;
  }

  // Set text alignment (0=left, 1=center, 2=right)
  align(mode) {
    this.buffer.push(this.ESC, 0x61, mode);
    return this;
  }

  // Set text size (0=normal, 1=double width, 2=double height, 3=double both)
  textSize(size) {
    const value = (size & 0x0F) | ((size & 0x0F) << 4);
    this.buffer.push(this.GS, 0x21, value);
    return this;
  }

  // Set bold on/off
  bold(on = true) {
    this.buffer.push(this.ESC, 0x45, on ? 1 : 0);
    return this;
  }

  // Add text
  text(str) {
    const encoded = Buffer.from(str, 'utf8');
    this.buffer.push(...encoded);
    return this;
  }

  // New line
  newLine(count = 1) {
    for (let i = 0; i < count; i++) {
      this.buffer.push(this.LF);
    }
    return this;
  }

  // Dashed line separator
  dashedLine() {
    this.text('--------------------------------').newLine();
    return this;
  }

  // Feed paper
  feed(lines = 3) {
    this.buffer.push(this.ESC, 0x64, lines);
    return this;
  }

  // Cut paper (if cutter available)
  cut() {
    this.buffer.push(this.GS, 0x56, 0x00);
    return this;
  }

  // Get raw bytes
  getBytes() {
    return Buffer.from(this.buffer);
  }

  // Print receipt from invoice data
  printReceipt(invoice, store) {
    this.init();
    
    // Store header (centered, bold, large)
    this.align(1).textSize(1).bold(true);
    this.text(store?.name || 'GREENHOUSE').newLine();
    
    // Address lines (centered, normal size)
    this.textSize(0).bold(false);
    if (store?.address_lines) {
      store.address_lines.forEach(line => {
        this.text(line).newLine();
      });
    }
    
    // Invoice info
    this.newLine();
    this.text(`Invoice: ${invoice.invoice_no || invoice.id || '-'}`).newLine();
    
    // Date
    let dt = null;
    try {
      dt = new Date(invoice.created_at);
      const dateStr = dt.toLocaleDateString('en-IN', { 
        timeZone: 'Asia/Kolkata', 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      });
      const timeStr = dt.toLocaleTimeString('en-IN', { 
        timeZone: 'Asia/Kolkata', 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true 
      });
      this.text(`${dateStr}, ${timeStr}`).newLine();
    } catch (e) {
      this.text(invoice.created_at || '').newLine();
    }
    
    this.newLine().dashedLine();
    
    // Items header (left aligned)
    this.align(0);
    this.text('Item              Qty  Rate   Amount').newLine();
    this.dashedLine();
    
    // Items
    const items = invoice.items || [];
    items.forEach(item => {
      const name = (item.name || '').substring(0, 16).padEnd(16);
      const qty = Number(item.qty || 0).toFixed(1).padStart(4);
      const rate = Number(item.rate || 0).toFixed(0).padStart(5);
      const amt = Number(item.amount || 0).toFixed(0).padStart(7);
      
      this.text(`${name} ${qty} ${rate} ${amt}`).newLine();
    });
    
    this.dashedLine();
    
    // Totals
    const subtotal = Number(invoice.subtotal ?? invoice.total ?? 0);
    const tax = Number(invoice.tax ?? 0);
    const total = Number(invoice.total ?? subtotal ?? 0);
    
    this.text(`Subtotal:${subtotal.toFixed(2).padStart(24)}`).newLine();
    this.text(`Tax:${tax.toFixed(2).padStart(30)}`).newLine();
    
    this.bold(true).textSize(1);
    this.text(`TOTAL:${total.toFixed(2).padStart(20)}`).newLine();
    
    this.bold(false).textSize(0);
    this.dashedLine();
    
    // Footer (centered)
    this.align(1).newLine();
    this.text('Thank you for shopping!').newLine();
    this.text('Powered by Greenhouse POS').newLine();
    
    // Feed and cut
    this.feed(4);
    this.cut();
    
    return this;
  }
}

/**
 * Print using different methods based on OS
 */
async function printRaw(printerName, data) {
  const platform = os.platform();
  
  if (platform === 'win32') {
    return printWindows(printerName, data);
  } else if (platform === 'darwin') {
    return printMac(printerName, data);
  } else if (platform === 'linux') {
    return printLinux(printerName, data);
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
}

// Windows: Use built-in print command
function printWindows(printerName, data) {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(os.tmpdir(), `receipt_${Date.now()}.prn`);
    
    fs.writeFileSync(tempFile, data);
    
    const printer = printerName || 'default'; // Use default if not specified
    const command = `type "${tempFile}" > "${printer}"`;
    
    exec(command, (error) => {
      fs.unlinkSync(tempFile); // Clean up
      
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

// macOS: Use lp command
function printMac(printerName, data) {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(os.tmpdir(), `receipt_${Date.now()}.prn`);
    
    fs.writeFileSync(tempFile, data);
    
    const command = printerName 
      ? `lp -d "${printerName}" "${tempFile}"`
      : `lp "${tempFile}"`;
    
    exec(command, (error) => {
      fs.unlinkSync(tempFile);
      
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

// Linux: Use lp command (similar to macOS)
function printLinux(printerName, data) {
  return printMac(printerName, data);
}

// Example usage
function testPrint() {
  const testInvoice = {
    invoice_no: 'TEST-001',
    created_at: new Date().toISOString(),
    items: [
      { name: 'Potato (1kg)', qty: 2, rate: 25, amount: 50 },
      { name: 'Tomato (1kg)', qty: 1.5, rate: 30, amount: 45 },
      { name: 'Onion (1kg)', qty: 3, rate: 20, amount: 60 },
    ],
    subtotal: 155,
    tax: 0,
    total: 155,
  };

  const testStore = {
    name: 'GREENHOUSE',
    address_lines: ['123 Main Street', 'City, State 12345'],
  };

  const printer = new ESCPOSPrinter();
  printer.printReceipt(testInvoice, testStore);
  
  const data = printer.getBytes();
  
  console.log('Generated ESC/POS data:', data.length, 'bytes');
  console.log('Printing to default printer...');
  
  printRaw(null, data)
    .then(() => {
      console.log('✅ Print successful!');
    })
    .catch(err => {
      console.error('❌ Print failed:', err.message);
    });
}

// Export for use in main.js
module.exports = {
  ESCPOSPrinter,
  printRaw,
  testPrint,
};

// Run test if executed directly
if (require.main === module) {
  console.log('🖨️  ESC/POS Printer Test');
  console.log('========================\n');
  testPrint();
}
