# 🖨️ Thermal Printer Debug Guide - Blank Receipt Fix

## Problem
Thermal printer is printing blank sheets with no text/ink.

## Root Causes Fixed

### 1. ❌ CSS Hiding All Content
**Location:** `greenhouse-pos/src/App.css` lines 1404-1417

**Problem:** The `@media print` rule had:
```css
body * {
  display: none !important; /* Hides EVERYTHING */
}
```

**Fix:** Changed to target only non-receipt elements:
```css
body > *:not(.receipt-preview) {
  display: none !important; /* Only hide non-receipt elements */
}
```

### 2. ❌ Wrong Color Mode for Thermal Printer
**Location:** `greenhouse-pos-desktop/main.js` line 403

**Problem:** Had `color: true` which some thermal printers don't handle well

**Fix:** Changed to `color: false` (grayscale/black mode - standard for thermal)

### 3. ❌ Insufficient Rendering Time
**Problem:** Hidden window wasn't fully rendered before printing

**Fix:** 
- Added `win.showInactive()` to force Chromium paint
- Increased timeout from 500ms to 800ms
- Added layout calculation trigger

### 4. ❌ Missing Forced Visibility
**Location:** `greenhouse-pos-desktop/main.js` wrapped HTML styles

**Fix:** Added aggressive visibility rules:
```css
body, body * {
  color: #000000 !important;
  background: transparent !important;
}

.receipt-preview,
.receipt-preview * {
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
}
```

## How to Test

### Step 1: View the Electron Console Logs
When you print a receipt, you should now see diagnostic output like:

```
PRINT HTML LENGTH: 2435
PRINT HTML PREVIEW: <div class="receipt-preview">...
🖨️ PRINT CONTENT PREVIEW: GREENHOUSE
                          123 Main Street
                          Invoice: INV-001
                          ...
🖨️ Receipt element found: true
🖨️ Total text characters: 456
🖨️ Print options: {
  "silent": true,
  "deviceName": "Your Printer Name",
  "printBackground": true,
  "color": false,
  ...
}
✅ Print job sent successfully
```

### Step 2: Check for Errors
If you see:
- `❌ WARNING: No text content detected in receipt!` - The HTML is not rendering
- `❌ Print job failed: [reason]` - Printer driver issue

### Step 3: Rebuild and Test

#### For Desktop App:
```bash
cd greenhouse-pos-desktop
npm install
# Run the app in dev mode to see console logs
npm start
# Or build for production
npm run build
```

#### For Web App (if testing browser print):
```bash
cd greenhouse-pos
npm install
npm run dev
```

## Diagnostic Checklist

### ✅ Pre-Print Checks
- [ ] Console shows "PRINT HTML LENGTH: [number]" > 0
- [ ] Console shows "Receipt element found: true"
- [ ] Console shows "Total text characters: [number]" > 0
- [ ] Console shows "✅ Print job sent successfully"

### ✅ Printer Settings
- [ ] Printer is set as default or specified in `printer-config.json`
- [ ] Thermal printer driver is installed and working
- [ ] Test page from printer settings works (Control Panel → Printers)
- [ ] Paper is loaded correctly
- [ ] Printer is online (not offline/error state)

### ✅ Receipt Content
- [ ] Receipt has items in the cart
- [ ] Store name is showing ("GREENHOUSE")
- [ ] Invoice number is generated
- [ ] Totals are calculated

## Advanced Troubleshooting

### If Still Printing Blank:

#### 1. Test with Simple HTML
Create a minimal test file to isolate the issue:

```html
<!DOCTYPE html>
<html>
<head><style>
  body { font-family: monospace; font-size: 14px; }
  * { color: #000000 !important; }
</style></head>
<body>
  <h1>TEST PRINT</h1>
  <p>If you can read this, text rendering works.</p>
  <p>Line 1</p>
  <p>Line 2</p>
  <p>Line 3</p>
</body>
</html>
```

Save as `test-simple-print.html` and try printing from browser.

#### 2. Check Printer Spooler
On Windows:
```powershell
# Restart print spooler
net stop spooler
net start spooler
```

#### 3. Update Printer Driver
- Check manufacturer website for latest thermal printer driver
- Some thermal printers need ESC/POS mode enabled

#### 4. Try Different DPI Settings
Edit `main.js` line ~408:
```javascript
dpi: { horizontal: 203, vertical: 203 }, // Try: 300, 180, or 96
```

#### 5. Check Thermal Printer Head
- Physical issue: Thermal print head might be dirty or broken
- Run printer self-test (usually by holding feed button while turning on)
- If self-test prints blank → Hardware issue

## Files Modified

1. ✅ `greenhouse-pos/src/App.css` - Fixed CSS hiding rules
2. ✅ `greenhouse-pos-desktop/main.js` - Fixed print settings and added diagnostics

## Next Steps

1. **Rebuild the desktop app** to apply the fixes
2. **Run the app and check console logs** when printing
3. **Test print a receipt** and check the paper
4. **Share the console output** if still having issues

## Quick Commands

```bash
# Navigate to desktop app
cd greenhouse-pos-desktop

# Install dependencies (if needed)
npm install

# Run in development mode (see console logs)
npm start

# After testing, build for production
npm run build
```

## Expected Result

✅ **Before:** Blank thermal paper comes out
✅ **After:** Black text prints on thermal paper with:
- Store name (GREENHOUSE)
- Invoice number and date
- Item list with quantities and prices
- Totals and footer

---

**If this doesn't work, please share:**
1. The console output from Electron
2. Your thermal printer model/brand
3. Whether the printer self-test works
