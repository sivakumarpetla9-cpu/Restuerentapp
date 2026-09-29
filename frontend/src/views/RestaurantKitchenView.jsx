import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Utensils,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  XCircle,
  Play,
  CheckCheck,
  Ban,
  Filter,
  Eye,
  X,
  Volume2,
  VolumeX,
  Sparkles
} from 'lucide-react';
import {
  fetchKitchenOrders,
  fetchRestaurantOrderDetail,
  updateRestaurantOrderStatus
} from '../api';

const STATUS_CONFIG = {
  NEW: {
    label: 'New Order',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    cardBorder: 'border-cyan-500/40 shadow-cyan-500/5',
    headerBg: 'bg-cyan-950/40',
    nextAction: 'ACCEPTED',
    nextLabel: 'Accept Order',
    nextIcon: CheckCircle2,
    nextBtnClass: 'bg-cyan-600 hover:bg-cyan-500 text-white'
  },
  ACCEPTED: {
    label: 'Accepted',
    badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    cardBorder: 'border-indigo-500/40 shadow-indigo-500/5',
    headerBg: 'bg-indigo-950/40',
    nextAction: 'PREPARING',
    nextLabel: 'Start Preparing',
    nextIcon: Play,
    nextBtnClass: 'bg-indigo-600 hover:bg-indigo-500 text-white'
  },
  PREPARING: {
    label: 'Preparing',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    cardBorder: 'border-amber-500/40 shadow-amber-500/5',
    headerBg: 'bg-amber-950/40',
    nextAction: 'READY',
    nextLabel: 'Mark Ready',
    nextIcon: CheckCheck,
    nextBtnClass: 'bg-amber-600 hover:bg-amber-500 text-white'
  },
  READY: {
    label: 'Ready for Service',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    cardBorder: 'border-emerald-500/40 shadow-emerald-500/5',
    headerBg: 'bg-emerald-950/40',
    nextAction: 'SERVED',
    nextLabel: 'Mark Served',
    nextIcon: CheckCircle2,
    nextBtnClass: 'bg-emerald-600 hover:bg-emerald-500 text-white'
  },
  SERVED: {
    label: 'Served',
    badgeClass: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    cardBorder: 'border-slate-700/50',
    headerBg: 'bg-slate-900/60',
    nextAction: null,
    nextLabel: null
  },
  CANCELLED: {
    label: 'Cancelled',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    cardBorder: 'border-rose-800/40',
    headerBg: 'bg-rose-950/40',
    nextAction: null,
    nextLabel: null
  }
};

function formatElapsed(isoDate) {
  if (!isoDate) return '';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins === 1) return '1 min ago';
  if (diffMins < 60) return `${diffMins} mins ago`;
  const diffHours = Math.floor(diffMins / 60);
  return `${diffHours}h ${diffMins % 60}m ago`;
}

function DietaryBadge({ type }) {
  if (!type) return null;
  const t = String(type).toUpperCase();
  if (t === 'VEG') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> VEG
      </span>
    );
  }
  if (t === 'NON_VEG') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span> NON-VEG
      </span>
    );
  }
  if (t === 'VEGAN') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/30">
        <Sparkles size={10} /> VEGAN
      </span>
    );
  }
  if (t === 'EGG') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
        EGG
      </span>
    );
  }
  return null;
}

export function RestaurantKitchenView({ currentUser }) {
  const [orders, setOrders] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState('ACTIVE'); // 'ACTIVE' | 'NEW' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED' | 'ALL'
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [processingOrderId, setProcessingOrderId] = useState(null);

  // Detail Modal State
  const [activeModalOrder, setActiveModalOrder] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Cancellation Modal State
  const [cancelModalOrder, setCancelModalOrder] = useState(null);
  const [cancelReasonInput, setCancelReasonInput] = useState('');

  const canWrite = currentUser?.role === 'ADMIN' || currentUser?.role === 'DELIVERY';

  const loadOrders = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setActionError(null);
    try {
      let filterPayload = {};
      if (selectedFilter === 'ACTIVE') {
        filterPayload.status = ['NEW', 'ACCEPTED', 'PREPARING', 'READY'];
      } else if (selectedFilter !== 'ALL') {
        filterPayload.status = selectedFilter;
      }
      const data = await fetchKitchenOrders(filterPayload);
      setOrders(data.orders || []);
      setError(null);
    } catch (err) {
      console.error('Kitchen orders fetch error:', err);
      setError(err.message || 'Failed to load kitchen orders.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [selectedFilter]);

  useEffect(() => {
    loadOrders(false);
  }, [loadOrders]);

  // Polling every 5 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadOrders(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadOrders]);

  // State Transition Action Handler
  const handleTransition = async (order, targetStatus, cancelReason = null) => {
    if (!canWrite) {
      setActionError('Permission denied: Viewer role cannot modify kitchen order status.');
      return;
    }

    setProcessingOrderId(order.id);
    setActionError(null);

    try {
      await updateRestaurantOrderStatus(order.id, targetStatus, order.status, cancelReason);
      // Close cancel modal if open
      if (cancelModalOrder) {
        setCancelModalOrder(null);
        setCancelReasonInput('');
      }
      // Reload quietly to keep state synced
      await loadOrders(true);
    } catch (err) {
      console.error('Transition error:', err);
      if (err.status === 409) {
        setActionError(`Order ${order.orderNumber} was updated by another station (${err.currentStatus}). View refreshed.`);
        await loadOrders(true);
      } else {
        setActionError(err.message || 'Failed to update order status');
      }
    } finally {
      setProcessingOrderId(null);
    }
  };

  const handleOpenDetailModal = async (order) => {
    setActiveModalOrder(order);
    setModalLoading(true);
    try {
      const data = await fetchRestaurantOrderDetail(order.id);
      if (data && data.order) {
        setActiveModalOrder(data.order);
      }
    } catch (e) {
      console.warn('Failed to load full detail, using card summary:', e);
    } finally {
      setModalLoading(false);
    }
  };

  // Counts for tabs
  const countNew = orders.filter(o => o.status === 'NEW').length;
  const countAccepted = orders.filter(o => o.status === 'ACCEPTED').length;
  const countPreparing = orders.filter(o => o.status === 'PREPARING').length;
  const countReady = orders.filter(o => o.status === 'READY').length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/70 border border-slate-800 rounded-xl p-4 sm:p-5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-600/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
            <Utensils size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              Kitchen Display System
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-500/10 text-orange-400 border border-orange-500/30">
                KDS Live
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Live order preparation queue & kitchen workflow management
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              autoRefresh
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            {autoRefresh ? 'Live (5s)' : 'Paused'}
          </button>

          {/* Refresh Button */}
          <button
            onClick={() => loadOrders(false)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Action / Error Banner */}
      {actionError && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs p-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-400 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-rose-400 hover:text-rose-200">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-800">
        {[
          { id: 'ACTIVE', label: 'All Active Queue', count: countNew + countAccepted + countPreparing + countReady },
          { id: 'NEW', label: 'New', count: countNew, badgeClass: 'bg-cyan-500/20 text-cyan-300' },
          { id: 'ACCEPTED', label: 'Accepted', count: countAccepted, badgeClass: 'bg-indigo-500/20 text-indigo-300' },
          { id: 'PREPARING', label: 'Preparing', count: countPreparing, badgeClass: 'bg-amber-500/20 text-amber-300' },
          { id: 'READY', label: 'Ready', count: countReady, badgeClass: 'bg-emerald-500/20 text-emerald-300' },
          { id: 'SERVED', label: 'Served / Done' },
          { id: 'CANCELLED', label: 'Cancelled' },
          { id: 'ALL', label: 'All Orders' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setSelectedFilter(tab.id)}
            className={`px-3 py-2 rounded-t-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              selectedFilter === tab.id
                ? 'bg-slate-800 text-slate-100 border-b-2 border-orange-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${tab.badgeClass || 'bg-slate-700 text-slate-300'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Orders Grid */}
      {loading && orders.length === 0 ? (
        <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
          <RefreshCw size={24} className="animate-spin text-orange-400" />
          <p className="text-sm">Loading kitchen queue...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
          <Utensils size={36} className="mx-auto text-slate-600 mb-3" />
          <h3 className="text-sm font-semibold text-slate-300">No Orders in this View</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {selectedFilter === 'ACTIVE'
              ? 'The kitchen queue is clear! When guests place an order from table QR codes, it will appear here instantly.'
              : `No orders found matching filter "${selectedFilter}".`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {orders.map(order => {
            const conf = STATUS_CONFIG[order.status] || STATUS_CONFIG.NEW;
            const NextIcon = conf.nextIcon;
            const isProcessing = processingOrderId === order.id;

            // Urgency styling if > 15m in active state
            const diffMs = Date.now() - new Date(order.createdAt).getTime();
            const isUrgent = diffMs > 15 * 60 * 1000 && !['SERVED', 'CANCELLED'].includes(order.status);

            return (
              <div
                key={order.id}
                className={`bg-slate-900 border rounded-xl flex flex-col overflow-hidden shadow-lg transition-all ${conf.cardBorder} ${
                  isUrgent ? 'ring-1 ring-rose-500/50' : ''
                }`}
              >
                {/* Order Header */}
                <div className={`p-3.5 border-b border-slate-800 flex items-center justify-between ${conf.headerBg}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-100 text-sm tracking-tight">
                        {order.tableName || (order.tableNumber ? `Table ${order.tableNumber}` : 'Table')}
                      </span>
                      {order.branchName && (
                        <span className="text-[10px] text-slate-400 font-medium truncate max-w-[90px]">
                          • {order.branchName}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                      #{order.orderNumber}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${conf.badgeClass}`}>
                      {conf.label}
                    </span>
                    <div className={`flex items-center gap-1 text-[11px] font-medium ${isUrgent ? 'text-rose-400 font-bold animate-pulse' : 'text-slate-400'}`}>
                      <Clock size={11} />
                      {formatElapsed(order.createdAt)}
                    </div>
                  </div>
                </div>

                {/* Customer Notes */}
                {order.notes && (
                  <div className="px-3.5 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-[11px] flex items-start gap-1.5">
                    <AlertCircle size={13} className="shrink-0 mt-0.5 text-amber-400" />
                    <span className="line-clamp-2 italic">Note: "{order.notes}"</span>
                  </div>
                )}

                {/* Line Items List */}
                <div className="p-3.5 flex-1 space-y-2 overflow-y-auto max-h-56">
                  {order.items && order.items.length > 0 ? (
                    order.items.map((item, idx) => (
                      <div key={item.id || idx} className="text-xs text-slate-200 flex items-start justify-between gap-2 border-b border-slate-800/40 pb-1.5 last:border-b-0 last:pb-0">
                        <div className="flex items-start gap-2">
                          <span className="font-bold text-orange-400 text-xs w-5 text-right shrink-0">
                            {item.quantity}×
                          </span>
                          <div>
                            <span className="font-medium">{item.itemName}</span>
                            {item.notes && (
                              <p className="text-[10px] text-slate-400 italic">↳ {item.notes}</p>
                            )}
                          </div>
                        </div>
                        <DietaryBadge type={item.dietaryType} />
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500 italic">No item details available</p>
                  )}
                </div>

                {/* Card Footer / Actions */}
                <div className="p-3 bg-slate-900/90 border-t border-slate-800/80 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{order.items?.length || 0} items</span>
                    <button
                      onClick={() => handleOpenDetailModal(order)}
                      className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold"
                    >
                      <Eye size={12} /> View Details
                    </button>
                  </div>

                  {/* State transition buttons */}
                  {canWrite && conf.nextAction && (
                    <div className="flex items-center gap-2 pt-1">
                      {/* Main Next Action Button */}
                      <button
                        onClick={() => handleTransition(order, conf.nextAction)}
                        disabled={isProcessing}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow transition-all ${conf.nextBtnClass} ${
                          isProcessing ? 'opacity-60 cursor-not-allowed' : ''
                        }`}
                      >
                        {isProcessing ? (
                          <RefreshCw size={13} className="animate-spin" />
                        ) : (
                          NextIcon && <NextIcon size={13} />
                        )}
                        {conf.nextLabel}
                      </button>

                      {/* Cancel Button (allowed for NEW and ACCEPTED) */}
                      {['NEW', 'ACCEPTED'].includes(order.status) && (
                        <button
                          onClick={() => {
                            setCancelModalOrder(order);
                            setCancelReasonInput('');
                          }}
                          disabled={isProcessing}
                          title="Reject / Cancel Order"
                          className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 text-xs transition"
                        >
                          <Ban size={14} />
                        </button>
                      )}
                    </div>
                  )}

                  {!canWrite && (
                    <div className="text-[10px] text-slate-500 text-center py-1 italic">
                      View-only mode (Write permission required to change status)
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cancellation Reason Modal */}
      {cancelModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Ban size={16} className="text-rose-400" />
                Cancel Order #{cancelModalOrder.orderNumber}
              </h3>
              <button
                onClick={() => setCancelModalOrder(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Please enter a reason for cancelling this order. This will be recorded in the order audit log and the table will be marked available if no other orders remain.
            </p>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Cancellation Reason
              </label>
              <input
                type="text"
                value={cancelReasonInput}
                onChange={e => setCancelReasonInput(e.target.value)}
                placeholder="e.g. Out of stock, Customer requested cancellation"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setCancelModalOrder(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 bg-slate-800"
              >
                Go Back
              </button>
              <button
                onClick={() => handleTransition(cancelModalOrder, 'CANCELLED', cancelReasonInput)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {activeModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  Order #{activeModalOrder.orderNumber}
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${STATUS_CONFIG[activeModalOrder.status]?.badgeClass}`}>
                    {activeModalOrder.status}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {activeModalOrder.tableName || `Table ${activeModalOrder.tableNumber}`} • {activeModalOrder.branchName || 'Main Branch'}
                </p>
              </div>
              <button
                onClick={() => setActiveModalOrder(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            {/* Timestamps Lifecycle */}
            <div className="grid grid-cols-2 gap-2 p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 text-[11px]">
              <div>
                <span className="text-slate-500 block">Created At:</span>
                <span className="text-slate-300">{activeModalOrder.createdAt ? new Date(activeModalOrder.createdAt).toLocaleTimeString() : '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Accepted At:</span>
                <span className="text-slate-300">{activeModalOrder.acceptedAt ? new Date(activeModalOrder.acceptedAt).toLocaleTimeString() : '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Preparing At:</span>
                <span className="text-slate-300">{activeModalOrder.preparingAt ? new Date(activeModalOrder.preparingAt).toLocaleTimeString() : '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Ready At:</span>
                <span className="text-slate-300">{activeModalOrder.readyAt ? new Date(activeModalOrder.readyAt).toLocaleTimeString() : '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Served At:</span>
                <span className="text-slate-300">{activeModalOrder.servedAt ? new Date(activeModalOrder.servedAt).toLocaleTimeString() : '—'}</span>
              </div>
              {activeModalOrder.cancelledAt && (
                <div>
                  <span className="text-rose-500 block">Cancelled At:</span>
                  <span className="text-rose-300">{new Date(activeModalOrder.cancelledAt).toLocaleTimeString()} ({activeModalOrder.cancelReason})</span>
                </div>
              )}
            </div>

            {/* Line Items List */}
            <div>
              <h4 className="text-xs font-semibold text-slate-300 mb-2">Order Items</h4>
              <div className="space-y-2 border border-slate-800 rounded-lg p-3 bg-slate-950/30">
                {activeModalOrder.items && activeModalOrder.items.length > 0 ? (
                  activeModalOrder.items.map((item, idx) => (
                    <div key={item.id || idx} className="flex items-center justify-between text-xs py-1 border-b border-slate-800/40 last:border-b-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-orange-400">{item.quantity}×</span>
                        <span className="text-slate-200">{item.itemName}</span>
                        <DietaryBadge type={item.dietaryType} />
                      </div>
                      <span className="font-mono text-slate-400">
                        ₹{(parseFloat(item.subtotal) || 0).toFixed(2)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 italic">No line items</p>
                )}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="space-y-1 text-xs border-t border-slate-800 pt-3">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal</span>
                <span>₹{(parseFloat(activeModalOrder.subtotal) || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Tax</span>
                <span>₹{(parseFloat(activeModalOrder.taxAmount) || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-100 text-sm pt-1 border-t border-slate-800/60">
                <span>Total Amount</span>
                <span className="text-orange-400">₹{(parseFloat(activeModalOrder.totalAmount) || 0).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setActiveModalOrder(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg"
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
export default RestaurantKitchenView;
