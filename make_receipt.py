#!/usr/bin/env python3
# make_receipt.py
# Usage: python3 make_receipt.py invoice-1.json receipt-1.txt

import json
import sys

def to_float(x):
    try:
        return float(x)
    except:
        return 0.0

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 make_receipt.py <invoice-json-file> <output-txt-file>")
        sys.exit(1)

    in_file = sys.argv[1]
    out_file = sys.argv[2]

    data = json.load(open(in_file, 'r'))
    # support both shapes: { "invoice": {...} } or raw invoice object
    inv = data.get('invoice', data)

    lines = []
    store_name = inv.get('store', {}).get('name') or inv.get('store_name') or 'STORE NAME'
    lines.append(store_name)
    lines.append('--------------------------------')
    lines.append(f"Invoice : {inv.get('invoice_no', inv.get('invoiceNo', ''))}")
    lines.append(f"Date    : {inv.get('created_at', inv.get('createdAt', ''))}")
    lines.append('--------------------------------')
    lines.append(f"{'Item':20} {'QTY':>3} {'RATE':>7} {'AMT':>8}")

    items = inv.get('items', [])
    subtotal = None
    # If POST returned subtotal it might be present
    if 'subtotal' in inv:
        subtotal = to_float(inv['subtotal'])

    sum_items = 0.0
    for it in items:
        name = it.get('name', '')[:20]
        try:
            qty = int(it.get('qty', 0))
        except:
            qty = int(float(it.get('qty', 0) or 0))
        rate = to_float(it.get('rate', it.get('price', 0)))
        amount = to_float(it.get('amount', it.get('amt', rate * qty)))
        sum_items += amount
        lines.append(f"{name:20} {qty:>3} {rate:7.2f} {amount:8.2f}")

    if subtotal is None:
        subtotal = sum_items

    tax = to_float(inv.get('tax', 0) or inv.get('tax_amount', 0))
    # prefer total if present, else compute
    total = to_float(inv.get('total', subtotal + tax))

    lines.append('--------------------------------')
    lines.append(f"Subtotal: {subtotal:.2f}")
    lines.append(f"Tax:      {tax:.2f}")
    lines.append(f"TOTAL:    {total:.2f}")
    lines.append('--------------------------------')
    lines.append('Thank you for shopping!')

    with open(out_file, 'w') as f:
        f.write('\n'.join(lines))

    print(f"{out_file} created from {in_file}")

if __name__ == "__main__":
    main()
