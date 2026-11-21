var test = require('node:test');
var assert = require('node:assert/strict');

var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');

function orderFromPricing(items, coupon) {
  var totals = pricing.computeTotals(items, coupon);
  return {
    id: 1,
    date: '2021-11-01',
    customer: 'Walk-in',
    status: 'completed',
    items: items,
    coupon: coupon || '',
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('invoice uses the HSN slab stored on an order line', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }];
  var order = orderFromPricing(items, '');

  assert.deepEqual(
    {
      tax: order.tax,
      cgst: pricing.computeTotals(items, '').cgst,
      sgst: pricing.computeTotals(items, '').sgst,
      total: order.total
    },
    { tax: 5, cgst: 2.5, sgst: 2.5, total: 105 }
  );

  assert.deepEqual(
    invoice.computeInvoiceFigures(order),
    {
      subtotal: 100,
      discount: 0,
      tax: 5,
      cgst: 2.5,
      sgst: 2.5,
      total: 105,
      rows: [{
        name: 'Rice',
        sku: '-',
        hsn: '1006',
        qty: 1,
        price: 100,
        gstPercent: 5,
        line: 100,
        lineTax: 5
      }]
    }
  );
});
test('invoice rejects an inactive coupon just as order pricing does', function () {
  var items = [{ id: 2, name: 'Tea', hsn: '0902', price: 100, qty: 1 }];
  var order = orderFromPricing(items, 'DIWALI20');
  var figures = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    { discount: order.discount, tax: order.tax, total: order.total },
    { discount: 0, tax: 18, total: 118 }
  );
  assert.deepEqual(
    { discount: figures.discount, tax: figures.tax, cgst: figures.cgst, sgst: figures.sgst, total: figures.total },
    { discount: 0, tax: 18, cgst: 9, sgst: 9, total: 118 }
  );
});

test('invoice applies the SAVE10 discount cap before calculating tax', function () {
  var items = [{ id: 5, name: 'Groundnut Oil', hsn: '1508', price: 1120, qty: 2 }];
  var order = orderFromPricing(items, 'SAVE10');

  assert.deepEqual(invoice.computeInvoiceFigures(order), {
    subtotal: 2240,
    discount: 150,
    tax: 104.5,
    cgst: 52.25,
    sgst: 52.25,
    total: 2194.5,
    rows: [{
      name: 'Groundnut Oil',
      sku: '-',
      hsn: '1508',
      qty: 2,
      price: 1120,
      gstPercent: 5,
      line: 2240,
      lineTax: 104.5
    }]
  });
});
test('reconciliation matches invoice GST and total to an in-memory order', function () {
  var items = [{ id: 3, name: 'Dal', hsn: '0713', price: 100, qty: 1 }];
  var order = orderFromPricing(items, '');
  var reconciliation = reports.getGstReconciliation({ orders: [order] });

  assert.deepEqual(reconciliation, {
    totalChecked: 1,
    mismatchCount: 0,
    totalDelta: 0,
    rows: [{
      orderId: 1,
      date: '2021-11-01',
      customer: 'Walk-in',
      coupon: '',
      ledgerSubtotal: 100,
      ledgerDiscount: 0,
      ledgerTax: 5,
      ledgerTotal: 105,
      invoiceDiscount: 0,
      invoiceTax: 5,
      invoiceTotal: 105,
      delta: 0,
      matched: true
    }]
  });
});
