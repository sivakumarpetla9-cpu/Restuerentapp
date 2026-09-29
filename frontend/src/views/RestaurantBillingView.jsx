import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Receipt,
  CreditCard,
  CheckCircle2,
  Clock,
  Printer,
  Search,
  RefreshCw,
  AlertCircle,
  X,
  FileText,
  DollarSign,
  Plus,
  ShieldAlert,
  ArrowRight,
  Filter,
  Check,
  Ban,
  RotateCcw
} from 'lucide-react';
import {
  fetchBillingSettings,
  updateBillingSettings,
  fetchBills,
  fetchBillDetail,
  createBillForOrder,
  recordBillPayment,
  fetchBillReceipt,
  fetchKitchenOrders
} from '../api';

export function RestaurantBillingView({ currentUser = null }) {
  const [settings, setSettings] = useState(null);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Filter & Search states
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Drawers
  const [selectedBill, setSelectedBill] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [paymentModalBill, setPaymentModalBill] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentProcessing, setPaymentProcessing] = useState(false);

  const [receiptData, setReceiptData] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [availableOrders, setAvailableOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [generatingOrderId, setGeneratingOrderId] = useState(null);

  const canWrite = currentUser?.role !== 'VIEWER';

  // Load Settings and Bills
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settingsRes = await fetchBillingSettings();
      setSettings(settingsRes.settings || { billingEnabled: false });

      if (settingsRes.settings?.billingEnabled) {
        const billsRes = await fetchBills();
        setBills(billsRes.bills || []);
      } else {
        setBills([]);
      }
    } catch (err) {
      console.error('Failed to load billing data:', err);
      setError(err.message || 'Failed to load billing information');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Toggle Billing Feature ON / OFF
  const handleToggleBilling = async () => {
    if (!canWrite) {
      setError('You do not have permission to modify billing settings.');
      return;
    }
    const nextState = !settings?.billingEnabled;
    try {
      setError(null);
      const res = await updateBillingSettings({ billingEnabled: nextState });
      setSettings(res.settings);
      setSuccessMsg(`Billing & Payments module is now ${nextState ? 'ENABLED' : 'DISABLED'}.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      if (nextState) {
        const billsRes = await fetchBills();
        setBills(billsRes.bills || []);
      } else {
        setBills([]);
      }
    } catch (err) {
      console.error('Failed to toggle billing:', err);
      setError(err.message || 'Failed to update billing toggle');
    }
  };

  // Open Details
  const handleOpenDetail = async (billId) => {
    setDetailLoading(true);
    try {
      const res = await fetchBillDetail(billId);
      setSelectedBill(res.bill);
    } catch (err) {
      console.error('Failed to load bill detail:', err);
      setError(err.message || 'Failed to fetch bill detail');
    } finally {
      setDetailLoading(false);
    }
  };

  // Open Receipt
  const handleOpenReceipt = async (billId) => {
    setReceiptLoading(true);
    try {
      const res = await fetchBillReceipt(billId);
      setReceiptData(res.receipt);
    } catch (err) {
      console.error('Failed to load receipt:', err);
      setError(err.message || 'Failed to fetch receipt');
    } finally {
      setReceiptLoading(false);
    }
  };

  // Submit Payment
  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    if (!paymentModalBill) return;
    setPaymentProcessing(true);
    setError(null);
    try {
      const res = await recordBillPayment(paymentModalBill.id, {
        paymentStatus: 'PAID',
        paymentMethod,
        paymentRef: paymentRef.trim() || undefined
      });
      setSuccessMsg(`Payment of ₹${res.bill.totalAmount.toFixed(2)} recorded via ${res.bill.paymentMethod}.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setPaymentModalBill(null);
      setPaymentRef('');
      setPaymentMethod('CASH');

      // Refresh list & detail if open
      const billsRes = await fetchBills();
      setBills(billsRes.bills || []);
      if (selectedBill?.id === paymentModalBill.id) {
        setSelectedBill(res.bill);
      }
    } catch (err) {
      console.error('Payment record failed:', err);
      setError(err.message || 'Failed to record payment');
    } finally {
      setPaymentProcessing(false);
    }
  };

  // Open Generate Bill Modal & Load Served Orders
  const handleOpenGenerateModal = async () => {
    setIsGenerateModalOpen(true);
    setOrdersLoading(true);
    try {
      const res = await fetchKitchenOrders();
      // Only served or active orders that don't already have a bill
      const existingOrderIds = new Set(bills.map(b => b.orderId));
      const candidates = (res.orders || []).filter(o => !existingOrderIds.has(o.id));
      setAvailableOrders(candidates);
    } catch (err) {
      console.error('Failed to load orders for billing:', err);
    } finally {
      setOrdersLoading(false);
    }
  };

  // Generate Bill for selected order
  const handleGenerateBill = async (orderId) => {
    setGeneratingOrderId(orderId);
    setError(null);
    try {
      const res = await createBillForOrder(orderId);
      setSuccessMsg(`Bill ${res.bill.billNumber} generated successfully!`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setIsGenerateModalOpen(false);
      const billsRes = await fetchBills();
      setBills(billsRes.bills || []);
    } catch (err) {
      console.error('Failed to create bill:', err);
      setError(err.message || 'Failed to generate bill for order');
    } finally {
      setGeneratingOrderId(null);
    }
  };

  // Filtered bills list
  const filteredBills = useMemo(() => {
    return bills.filter(b => {
      if (statusFilter !== 'ALL' && b.paymentStatus !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchNum = (b.billNumber || '').toLowerCase().includes(q);
        const matchOrd = (b.orderNumber || '').toLowerCase().includes(q);
        const matchTbl = (b.tableName || b.tableNumber || '').toLowerCase().includes(q);
        return matchNum || matchOrd || matchTbl;
      }
      return true;
    });
  }, [bills, statusFilter, searchQuery]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalCount = bills.length;
    let totalInvoiced = 0;
    let totalPaid = 0;
    let pendingCount = 0;
    let pendingAmount = 0;

    for (const b of bills) {
      const amt = b.totalAmount || 0;
      totalInvoiced += amt;
      if (b.paymentStatus === 'PAID') {
        totalPaid += amt;
      } else if (b.paymentStatus === 'PENDING') {
        pendingCount++;
        pendingAmount += amt;
      }
    }
    return { totalCount, totalInvoiced, totalPaid, pendingCount, pendingAmount };
  }, [bills]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400 gap-3">
        <RefreshCw size={28} className="animate-spin text-indigo-400" />
        <p className="text-sm font-medium">Loading Billing & Payments module...</p>
      </div>
    );
  }

  const isBillingEnabled = Boolean(settings?.billingEnabled);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner / Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm backdrop-blur-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Receipt size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                Billing & Payments
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                    isBillingEnabled
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {isBillingEnabled ? 'ACTIVE / ON' : 'DISABLED / OFF'}
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Optional restaurant module for invoice generation, payment tracking, and receipt printing
              </p>
            </div>
          </div>
        </div>

        {/* Feature Toggle Control */}
        <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 px-4 py-2.5 rounded-lg">
          <span className="text-xs font-semibold text-slate-300">Module Toggle:</span>
          <button
            onClick={handleToggleBilling}
            disabled={!canWrite}
            title={!canWrite ? 'VIEWER role cannot modify settings' : 'Toggle Billing ON/OFF'}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-xs ${
              isBillingEnabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            } ${!canWrite ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <CreditCard size={14} />
            <span>{isBillingEnabled ? 'Billing is ON' : 'Billing is OFF'}</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="bg-rose-950/80 border border-rose-800 text-rose-300 px-4 py-3 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-4 py-3 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* IF BILLING IS OFF: Show clean informational placeholder */}
      {!isBillingEnabled ? (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-10 text-center max-w-2xl mx-auto space-y-5 my-8">
          <div className="w-16 h-16 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
            <Ban size={32} />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-slate-200">Billing & Payments is Currently Switched OFF</h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
              Restaurant OS operates fully in simple order-and-serve mode. Orders progress smoothly from QR code to
              Kitchen Display and terminal <span className="font-semibold text-emerald-400">SERVED</span> state without
              requiring an invoice or payment workflow.
            </p>
          </div>

          {canWrite ? (
            <div className="pt-2">
              <button
                onClick={handleToggleBilling}
                className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs inline-flex items-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <CreditCard size={15} />
                Enable Billing & Payments Module
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">
              (Contact a restaurant administrator or manager to enable Billing & Payments.)
            </p>
          )}
        </div>
      ) : (
        /* IF BILLING IS ON: Full Interactive Billing Dashboard */
        <>
          {/* Key Financial KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl shadow-xs">
              <span className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">Total Invoiced</span>
              <p className="text-2xl font-bold text-slate-100 mt-1">₹{metrics.totalInvoiced.toFixed(2)}</p>
              <span className="text-[11px] text-slate-500">{metrics.totalCount} bills total</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl shadow-xs">
              <span className="text-[11px] font-semibold uppercase text-emerald-400 tracking-wider">Collected / Paid</span>
              <p className="text-2xl font-bold text-emerald-400 mt-1">₹{metrics.totalPaid.toFixed(2)}</p>
              <span className="text-[11px] text-slate-500">Settled payments</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl shadow-xs">
              <span className="text-[11px] font-semibold uppercase text-amber-400 tracking-wider">Pending Settlement</span>
              <p className="text-2xl font-bold text-amber-400 mt-1">₹{metrics.pendingAmount.toFixed(2)}</p>
              <span className="text-[11px] text-amber-500/80">{metrics.pendingCount} unpaid bills</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl shadow-xs">
              <span className="text-[11px] font-semibold uppercase text-indigo-400 tracking-wider">Tax & Service Config</span>
              <p className="text-lg font-bold text-slate-200 mt-1">
                GST: {settings?.taxRate || 5}% | SC: {settings?.serviceChargeRate || 0}%
              </p>
              <span className="text-[11px] text-slate-500">{settings?.currency || 'INR'}</span>
            </div>
          </div>

          {/* Action & Filter Bar */}
          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Status Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              {['ALL', 'PENDING', 'PAID', 'VOID', 'REFUNDED'].map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    statusFilter === st
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700/60'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Search & Actions */}
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search bill, order, table..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg pl-8 pr-3 py-1.5 w-48 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              {canWrite && (
                <button
                  onClick={handleOpenGenerateModal}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Plus size={14} />
                  <span>Generate Bill</span>
                </button>
              )}

              <button
                onClick={loadData}
                title="Refresh bills"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </div>

          {/* Bills List / Table */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
            {filteredBills.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No bills found matching your filter criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                      <th className="px-4 py-3">Bill #</th>
                      <th className="px-4 py-3">Order #</th>
                      <th className="px-4 py-3">Table</th>
                      <th className="px-4 py-3">Subtotal</th>
                      <th className="px-4 py-3">Tax</th>
                      <th className="px-4 py-3">Total Amount</th>
                      <th className="px-4 py-3">Payment Status</th>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredBills.map(bill => {
                      const isPaid = bill.paymentStatus === 'PAID';
                      const isPending = bill.paymentStatus === 'PENDING';
                      return (
                        <tr key={bill.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-mono font-bold text-slate-200">
                            {bill.billNumber}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-300">
                            {bill.orderNumber || '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {bill.tableName || (bill.tableNumber ? `Table ${bill.tableNumber}` : '—')}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            ₹{bill.subtotal?.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            ₹{bill.taxAmount?.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-100">
                            ₹{bill.totalAmount?.toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                isPaid
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : isPending
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {bill.paymentStatus}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-slate-300">
                              {bill.paymentMethod || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right space-x-1.5">
                            <button
                              onClick={() => handleOpenDetail(bill.id)}
                              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
                            >
                              Details
                            </button>

                            {isPending && canWrite && (
                              <button
                                onClick={() => {
                                  setPaymentModalBill(bill);
                                  setPaymentMethod('CASH');
                                  setPaymentRef('');
                                }}
                                className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
                              >
                                Mark Paid
                              </button>
                            )}

                            <button
                              onClick={() => handleOpenReceipt(bill.id)}
                              title="Print Receipt"
                              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                            >
                              <Printer size={13} className="inline mr-1" />
                              Receipt
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* MODAL 1: RECORD PAYMENT MODAL */}
      {paymentModalBill && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
                  <DollarSign size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Record Bill Payment</h3>
                  <p className="text-[11px] text-slate-400 font-mono">Bill #{paymentModalBill.billNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setPaymentModalBill(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitPayment} className="p-6 space-y-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 font-semibold uppercase">Total Due</span>
                  <p className="text-2xl font-extrabold text-emerald-400">
                    ₹{paymentModalBill.totalAmount?.toFixed(2)}
                  </p>
                </div>
                <div className="text-right text-[11px] text-slate-400">
                  <p>Order: <span className="font-mono text-slate-200">{paymentModalBill.orderNumber || '—'}</span></p>
                  <p>Table: <span className="text-slate-200">{paymentModalBill.tableName || '—'}</span></p>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Payment Method</label>
                <div className="grid grid-cols-4 gap-2">
                  {['CASH', 'UPI', 'CARD', 'OTHER'].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`py-2 px-1 text-xs font-bold rounded-lg border text-center transition-all ${
                        paymentMethod === m
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-xs'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Reference */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Transaction / Ref ID (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. UPI-123456 or Card Last 4"
                  value={paymentRef}
                  onChange={e => setPaymentRef(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setPaymentModalBill(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paymentProcessing}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md disabled:opacity-50"
                >
                  {paymentProcessing ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Recording...</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Confirm Payment</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: BILL DETAIL DRAWER / MODAL */}
      {selectedBill && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl max-h-[90vh] flex flex-col animate-in fade-in">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-100">Bill Details</h3>
                <p className="text-xs text-slate-400 font-mono">Invoice #{selectedBill.billNumber}</p>
              </div>
              <button
                onClick={() => setSelectedBill(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Order Meta */}
              <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-500">Order Reference</span>
                  <p className="font-mono font-bold text-slate-200">{selectedBill.orderNumber || '—'}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-500">Table</span>
                  <p className="font-semibold text-slate-200">{selectedBill.tableName || `Table ${selectedBill.tableNumber}`}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-500">Status</span>
                  <p className="font-bold text-emerald-400">{selectedBill.paymentStatus}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-500">Payment Method</span>
                  <p className="font-semibold text-slate-200">{selectedBill.paymentMethod || 'Unsettled'}</p>
                </div>
              </div>

              {/* Line Items List */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Order Items</span>
                <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
                  {(selectedBill.items || []).map((it, idx) => (
                    <div key={idx} className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-medium text-slate-200">{it.itemName}</p>
                        <p className="text-[11px] text-slate-400">
                          {it.quantity} × ₹{it.unitPrice?.toFixed(2)}
                        </p>
                      </div>
                      <span className="font-bold text-slate-100">
                        ₹{(it.subtotal || it.quantity * it.unitPrice)?.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Calculation Breakdown */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal</span>
                  <span>₹{selectedBill.subtotal?.toFixed(2)}</span>
                </div>
                {selectedBill.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Discount</span>
                    <span>-₹{selectedBill.discountAmount?.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-400">
                  <span>Tax (GST)</span>
                  <span>₹{selectedBill.taxAmount?.toFixed(2)}</span>
                </div>
                {selectedBill.serviceCharge > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Service Charge</span>
                    <span>₹{selectedBill.serviceCharge?.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-slate-800 pt-2 flex justify-between text-sm font-bold text-slate-100">
                  <span>Grand Total</span>
                  <span className="text-emerald-400 text-base">₹{selectedBill.totalAmount?.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between shrink-0">
              <button
                onClick={() => handleOpenReceipt(selectedBill.id)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Printer size={14} />
                <span>Receipt</span>
              </button>

              {selectedBill.paymentStatus === 'PENDING' && canWrite && (
                <button
                  onClick={() => {
                    setPaymentModalBill(selectedBill);
                    setSelectedBill(null);
                  }}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <DollarSign size={14} />
                  <span>Record Payment</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: PRINTABLE RECEIPT MODAL */}
      {receiptData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6 font-mono text-xs space-y-4 animate-in fade-in">
            {/* Printable Container */}
            <div id="receipt-print-area" className="text-center space-y-1">
              <h2 className="text-base font-extrabold uppercase tracking-wide">
                {receiptData.restaurant?.name || 'Restaurant'}
              </h2>
              {receiptData.restaurant?.phone && (
                <p className="text-[11px] text-slate-600">Ph: {receiptData.restaurant.phone}</p>
              )}
              {receiptData.restaurant?.gstNumber && (
                <p className="text-[11px] text-slate-600">GST: {receiptData.restaurant.gstNumber}</p>
              )}

              <div className="border-t border-dashed border-slate-400 my-2 pt-2 text-left text-[11px] space-y-0.5">
                <p>Bill #: <span className="font-bold">{receiptData.billNumber}</span></p>
                <p>Order: {receiptData.orderNumber || '—'}</p>
                <p>Table: {receiptData.tableName || receiptData.tableNumber || '—'}</p>
                <p>Date: {new Date(receiptData.createdAt || Date.now()).toLocaleString()}</p>
              </div>

              {/* Items Table */}
              <div className="border-t border-dashed border-slate-400 my-2 pt-2">
                <div className="flex justify-between font-bold text-[11px] mb-1">
                  <span>Item</span>
                  <span>Qty × Rate</span>
                  <span>Amt</span>
                </div>
                {(receiptData.items || []).map((it, idx) => (
                  <div key={idx} className="flex justify-between text-[11px] py-0.5">
                    <span className="truncate max-w-[140px] text-left">{it.itemName}</span>
                    <span>{it.quantity} × {it.unitPrice}</span>
                    <span className="font-semibold">₹{(it.subtotal || it.quantity * it.unitPrice).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="border-t border-dashed border-slate-400 my-2 pt-2 text-[11px] space-y-0.5 text-right">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>₹{receiptData.financials?.subtotal?.toFixed(2)}</span>
                </div>
                {receiptData.financials?.discount > 0 && (
                  <div className="flex justify-between">
                    <span>Discount:</span>
                    <span>-₹{receiptData.financials.discount?.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Tax (GST):</span>
                  <span>₹{receiptData.financials?.tax?.toFixed(2)}</span>
                </div>
                {receiptData.financials?.serviceCharge > 0 && (
                  <div className="flex justify-between">
                    <span>Service Charge:</span>
                    <span>₹{receiptData.financials.serviceCharge?.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm border-t border-slate-900 pt-1 mt-1">
                  <span>TOTAL:</span>
                  <span>₹{receiptData.financials?.grandTotal?.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Footnote */}
              <div className="border-t border-dashed border-slate-400 my-2 pt-2 text-[11px]">
                <p className="font-bold">STATUS: {receiptData.paymentStatus}</p>
                {receiptData.paymentMethod && <p>Method: {receiptData.paymentMethod}</p>}
                {receiptData.paidAt && (
                  <p className="text-[10px] text-slate-500">
                    Paid: {new Date(receiptData.paidAt).toLocaleTimeString()}
                  </p>
                )}
                <p className="mt-3 text-[11px] font-semibold">Thank you for dining with us!</p>
              </div>
            </div>

            {/* Print & Close Buttons */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200">
              <button
                onClick={() => setReceiptData(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                <Printer size={13} />
                <span>Print</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: GENERATE BILL FOR UNBILLED ORDER */}
      {isGenerateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-100">Generate Bill for Order</h3>
                <p className="text-xs text-slate-400">Select an active or served order to generate its bill</p>
              </div>
              <button
                onClick={() => setIsGenerateModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
              {ordersLoading ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-indigo-400" />
                  Loading candidate orders...
                </div>
              ) : availableOrders.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  All active orders already have bills generated or no active orders exist.
                </div>
              ) : (
                availableOrders.map(ord => (
                  <div
                    key={ord.id}
                    className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs hover:border-slate-700 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-200">{ord.orderNumber}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300">
                          {ord.status}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        {ord.tableName || `Table ${ord.tableNumber}`} • {(ord.items || []).length} items • ₹{ord.totalAmount?.toFixed(2)}
                      </p>
                    </div>

                    <button
                      onClick={() => handleGenerateBill(ord.id)}
                      disabled={generatingOrderId === ord.id}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      {generatingOrderId === ord.id ? (
                        <>
                          <RefreshCw size={12} className="animate-spin" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <span>Create Bill</span>
                          <ArrowRight size={13} />
                        </>
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setIsGenerateModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default RestaurantBillingView;
