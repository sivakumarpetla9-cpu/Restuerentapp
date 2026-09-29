import React, { useState, useEffect } from 'react';
import {
  UtensilsCrossed,
  Clock,
  MapPin,
  AlertCircle,
  Search,
  Leaf,
  Info,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  ChevronRight,
  X,
  ArrowLeft,
  RefreshCw
} from 'lucide-react';
import {
  fetchPublicOrderMenu,
  initCustomerSession,
  fetchCustomerCart,
  addCustomerCartItem,
  updateCustomerCartItem,
  removeCustomerCartItem,
  placeCustomerOrder,
  fetchCustomerOrderStatus
} from '../api';

export function PublicOrderMenuView({ qrToken }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [menuData, setMenuData] = useState(null);
  const [session, setSession] = useState(null);
  const [cart, setCart] = useState({
    items: [],
    itemCount: 0,
    subtotal: 0,
    taxRate: 5,
    taxAmount: 0,
    totalAmount: 0
  });

  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [dietaryFilter, setDietaryFilter] = useState('ALL');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [refreshingStatus, setRefreshingStatus] = useState(false);

  // Initialize menu and table session
  useEffect(() => {
    async function loadMenuAndSession() {
      if (!qrToken) {
        setError('No QR code token provided. Please scan a valid table QR code.');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch menu metadata
        const menu = await fetchPublicOrderMenu(qrToken);
        setMenuData(menu);

        // 2. Initialize customer table session
        try {
          const sess = await initCustomerSession(qrToken);
          setSession(sess);

          // 3. Load active cart for this session
          const cartData = await fetchCustomerCart(sess.sessionToken);
          if (cartData && cartData.success) {
            setCart(cartData);
          }
        } catch (sessErr) {
          console.warn('[Session Init Notice]', sessErr.message);
        }
      } catch (err) {
        setError(err.message || 'Invalid or expired QR code.');
      } finally {
        setLoading(false);
      }
    }
    loadMenuAndSession();
  }, [qrToken]);

  // Helper to refresh cart state
  const refreshCart = async (token = session?.sessionToken) => {
    if (!token) return;
    try {
      const data = await fetchCustomerCart(token);
      if (data && data.success) {
        setCart(data);
      }
    } catch (err) {
      console.warn('Failed to refresh cart:', err.message);
    }
  };

  // Add Item
  const handleAddToCart = async (menuItem) => {
    if (!session?.sessionToken) {
      alert('Your table session is not ready yet. Please refresh the page.');
      return;
    }
    try {
      setOrderError(null);
      const existing = cart.items.find(ci => ci.menuItemId === menuItem.id);
      if (existing) {
        await updateCustomerCartItem(existing.id, existing.quantity + 1, session.sessionToken);
      } else {
        await addCustomerCartItem({ menuItemId: menuItem.id, quantity: 1 }, session.sessionToken);
      }
      await refreshCart();
    } catch (err) {
      alert(err.message || 'Failed to add item to cart');
    }
  };

  // Update Item Quantity
  const handleQuantityChange = async (cartItemId, newQty) => {
    if (!session?.sessionToken) return;
    try {
      setOrderError(null);
      if (newQty <= 0) {
        await removeCustomerCartItem(cartItemId, session.sessionToken);
      } else {
        await updateCustomerCartItem(cartItemId, newQty, session.sessionToken);
      }
      await refreshCart();
    } catch (err) {
      alert(err.message || 'Failed to update quantity');
    }
  };

  // Remove Item
  const handleRemoveItem = async (cartItemId) => {
    if (!session?.sessionToken) return;
    try {
      setOrderError(null);
      await removeCustomerCartItem(cartItemId, session.sessionToken);
      await refreshCart();
    } catch (err) {
      alert(err.message || 'Failed to remove item');
    }
  };

  // Confirm / Place Order
  const handlePlaceOrder = async () => {
    if (!session?.sessionToken) return;
    if (cart.items.length === 0) {
      setOrderError('Your cart is empty.');
      return;
    }

    try {
      setIsPlacingOrder(true);
      setOrderError(null);

      const idempotencyKey = `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const res = await placeCustomerOrder(
        {
          idempotencyKey,
          notes: orderNotes.trim() || null
        },
        session.sessionToken
      );

      if (res && res.success && res.order) {
        setActiveOrder(res.order);
        setIsCartOpen(false);
        setOrderNotes('');
        await refreshCart();
      } else {
        throw new Error('Order creation failed.');
      }
    } catch (err) {
      setOrderError(err.message || 'Failed to place order. Please try again.');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // Refresh Live Order Status
  const handleRefreshOrderStatus = async () => {
    if (!activeOrder?.id || !session?.sessionToken) return;
    try {
      setRefreshingStatus(true);
      const res = await fetchCustomerOrderStatus(activeOrder.id, session.sessionToken);
      if (res && res.success && res.order) {
        setActiveOrder(res.order);
      }
    } catch (err) {
      console.warn('Status refresh error:', err.message);
    } finally {
      setRefreshingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center animate-pulse">
            <UtensilsCrossed className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-200">Loading Menu</h3>
            <p className="text-xs text-slate-400 mt-1">Starting table session...</p>
          </div>
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !menuData) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-rose-900/50 rounded-2xl p-6 text-center shadow-xl">
          <div className="w-14 h-14 mx-auto rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-rose-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-100 mb-2">QR Code Invalid or Expired</h2>
          <p className="text-sm text-slate-400 mb-6">
            {error || 'This QR code could not be verified. It may have expired or been rotated.'}
          </p>
          <div className="bg-slate-950/60 rounded-xl p-4 text-xs text-slate-400 text-left border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-slate-300 font-medium">
              <QrCode className="w-4 h-4 text-indigo-400" />
              <span>How to access:</span>
            </div>
            <p>1. Ask your server to verify or rotate the table QR code.</p>
            <p>2. Scan the active QR code sticker displayed on your table.</p>
          </div>
        </div>
      </div>
    );
  }

  const { restaurant, table, branch, categories = [], items = [] } = menuData;
  const currencySymbol = restaurant?.currency === 'INR' ? '₹' : (restaurant?.currency === 'EUR' ? '€' : (restaurant?.currency === 'GBP' ? '£' : '$'));

  // Filtering items
  const filteredItems = items.filter(item => {
    if (selectedCategory !== 'ALL' && item.categoryId !== selectedCategory) {
      return false;
    }
    if (dietaryFilter !== 'ALL' && item.dietaryType !== dietaryFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.name?.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q);
      if (!matchName && !matchDesc) return false;
    }
    return true;
  });

  const getDietaryBadge = (type) => {
    switch (type) {
      case 'VEG':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            VEG
          </span>
        );
      case 'NON_VEG':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-950/80 text-rose-400 border border-rose-800">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            NON-VEG
          </span>
        );
      case 'VEGAN':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-950/80 text-teal-400 border border-teal-800">
            <Leaf className="w-2.5 h-2.5" />
            VEGAN
          </span>
        );
      case 'EGG':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-950/80 text-amber-400 border border-amber-800">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            EGG
          </span>
        );
      default:
        return null;
    }
  };

  const getItemQuantityInCart = (menuItemId) => {
    const found = cart.items.find(ci => ci.menuItemId === menuItemId);
    return found ? found.quantity : 0;
  };

  const getItemCartId = (menuItemId) => {
    const found = cart.items.find(ci => ci.menuItemId === menuItemId);
    return found ? found.id : null;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased pb-24">
      {/* Top Banner / Restaurant Header */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 shadow-md">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow">
              <UtensilsCrossed className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-base text-slate-100 truncate">
                {restaurant?.name || 'Restaurant'}
              </h1>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                {branch?.name && <span>{branch.name}</span>}
                {branch?.name && <span>•</span>}
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" /> Table {table?.tableNumber || table?.name || '—'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeOrder && (
              <button
                onClick={() => setIsCartOpen(false)}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-1"
              >
                <span>Live Order</span>
              </button>
            )}

            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              aria-label="View Cart"
            >
              <ShoppingBag className="w-5 h-5" />
              {cart.itemCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[11px] flex items-center justify-center shadow-md animate-scale">
                  {cart.itemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 space-y-4">
        {/* Active Order Banner if an order was placed */}
        {activeOrder && (
          <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-4 shadow-lg flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-emerald-200">
                    Order {activeOrder.orderNumber}
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {activeOrder.status}
                  </span>
                </div>
                <p className="text-xs text-emerald-400/80 mt-0.5">
                  {activeOrder.items?.length || 0} items • {currencySymbol}{activeOrder.totalAmount?.toFixed(2)}
                </p>
              </div>
            </div>

            <button
              onClick={handleRefreshOrderStatus}
              disabled={refreshingStatus}
              className="p-2 rounded-lg bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800/40 transition-colors"
              title="Refresh order status"
            >
              <RefreshCw className={`w-4 h-4 ${refreshingStatus ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}

        {/* Branch / Operating Hours Info */}
        {(branch?.address || restaurant?.operatingHours) && (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-400 flex flex-wrap gap-4 items-center justify-between">
            {branch?.address && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                <span>{branch.address}{branch.city ? `, ${branch.city}` : ''}</span>
              </div>
            )}
            {restaurant?.operatingHours && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>{restaurant.operatingHours}</span>
              </div>
            )}
          </div>
        )}

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search food, drinks, desserts..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Dietary Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          {[
            { id: 'ALL', label: 'All Items' },
            { id: 'VEG', label: 'Veg' },
            { id: 'NON_VEG', label: 'Non-Veg' },
            { id: 'VEGAN', label: 'Vegan' },
            { id: 'EGG', label: 'Egg' }
          ].map(pill => (
            <button
              key={pill.id}
              onClick={() => setDietaryFilter(pill.id)}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                dietaryFilter === pill.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* Categories Bar */}
        {categories.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-slate-800/80">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-colors ${
                selectedCategory === 'ALL'
                  ? 'bg-slate-100 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({items.length})
            </button>
            {categories.map(cat => {
              const count = items.filter(i => i.categoryId === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-colors ${
                    selectedCategory === cat.id
                      ? 'bg-slate-100 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Items Listing */}
        {filteredItems.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-8 text-center text-slate-400 space-y-2">
            <UtensilsCrossed className="w-8 h-8 mx-auto text-slate-600 mb-2" />
            <p className="font-medium text-slate-300">No menu items found</p>
            <p className="text-xs text-slate-500">Try adjusting your filters or search keywords.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map(item => {
              const qtyInCart = getItemQuantityInCart(item.id);
              const cartItemId = getItemCartId(item.id);

              return (
                <div
                  key={item.id}
                  className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 flex gap-3 shadow-sm hover:border-slate-700 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {getDietaryBadge(item.dietaryType)}
                      <h3 className="font-semibold text-sm text-slate-100 leading-snug">
                        {item.name}
                      </h3>
                    </div>

                    {item.description && (
                      <p className="text-xs text-slate-400 line-clamp-2 mb-2 leading-relaxed">
                        {item.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-2">
                      <div>
                        <span className="font-bold text-sm text-indigo-300">
                          {currencySymbol}{typeof item.price === 'number' ? item.price.toFixed(2) : item.price}
                        </span>
                        {item.taxRate > 0 && (
                          <span className="text-[10px] text-slate-500 ml-1.5">
                            +{item.taxRate}% tax
                          </span>
                        )}
                      </div>

                      {/* Add to Cart / Quantity Stepper */}
                      {qtyInCart === 0 ? (
                        <button
                          onClick={() => handleAddToCart(item)}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm flex items-center gap-1 transition-all active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 bg-indigo-950/60 border border-indigo-700/60 rounded-xl p-1">
                          <button
                            onClick={() => handleQuantityChange(cartItemId, qtyInCart - 1)}
                            className="w-6 h-6 rounded-lg bg-indigo-900/80 hover:bg-indigo-800 text-indigo-200 flex items-center justify-center transition-colors"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-xs font-bold text-indigo-200">
                            {qtyInCart}
                          </span>
                          <button
                            onClick={() => handleQuantityChange(cartItemId, qtyInCart + 1)}
                            className="w-6 h-6 rounded-lg bg-indigo-900/80 hover:bg-indigo-800 text-indigo-200 flex items-center justify-center transition-colors"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {item.imageUrl && (
                    <div className="w-20 h-20 rounded-xl bg-slate-800 overflow-hidden shrink-0 border border-slate-800">
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Bottom Cart Bar */}
      {cart.itemCount > 0 && !isCartOpen && (
        <div className="fixed bottom-4 inset-x-4 max-w-2xl mx-auto z-40">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl p-3.5 px-5 shadow-2xl flex items-center justify-between gap-3 transition-transform active:scale-[0.99] border border-indigo-400/30"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-700/80 flex items-center justify-center font-bold text-sm">
                {cart.itemCount}
              </div>
              <div className="text-left">
                <div className="text-xs text-indigo-200 uppercase tracking-wider font-semibold">
                  View Cart
                </div>
                <div className="font-extrabold text-base">
                  {currencySymbol}{cart.totalAmount?.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 font-semibold text-sm">
              <span>Review Order</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </button>
        </div>
      )}

      {/* Slide-over Cart Drawer Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-slate-900 h-full flex flex-col border-l border-slate-800 shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base text-slate-100">
                  Your Order (Table {table?.tableNumber || table?.name})
                </h3>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Message */}
            {orderError && (
              <div className="m-4 mb-0 p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{orderError}</span>
              </div>
            )}

            {/* Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.items.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <ShoppingBag className="w-10 h-10 mx-auto text-slate-600" />
                  <p className="font-semibold text-slate-300">Your cart is empty</p>
                  <p className="text-xs text-slate-500">Explore our delicious menu items and tap Add.</p>
                </div>
              ) : (
                cart.items.map(ci => (
                  <div
                    key={ci.id}
                    className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {getDietaryBadge(ci.dietaryType)}
                        <h4 className="font-semibold text-sm text-slate-200 truncate">
                          {ci.itemName}
                        </h4>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {currencySymbol}{ci.price?.toFixed(2)} × {ci.quantity} ={' '}
                        <span className="font-semibold text-indigo-300">
                          {currencySymbol}{(ci.lineTotal || (ci.price * ci.quantity)).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg p-0.5">
                        <button
                          onClick={() => handleQuantityChange(ci.id, ci.quantity - 1)}
                          className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-white"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center text-xs font-bold text-slate-200">
                          {ci.quantity}
                        </span>
                        <button
                          onClick={() => handleQuantityChange(ci.id, ci.quantity + 1)}
                          className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-white"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        onClick={() => handleRemoveItem(ci.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition-colors"
                        title="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}

              {/* Special Instructions Note */}
              {cart.items.length > 0 && (
                <div className="pt-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Cooking or Delivery Instructions (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="e.g., Less spicy, no onions, extra napkins..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}
            </div>

            {/* Bill Summary and Confirmation */}
            {cart.items.length > 0 && (
              <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3">
                <div className="space-y-1.5 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="text-slate-200 font-medium">
                      {currencySymbol}{cart.subtotal?.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Estimated Tax ({cart.taxRate}%)</span>
                    <span className="text-slate-200 font-medium">
                      {currencySymbol}{cart.taxAmount?.toFixed(2)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-800 flex justify-between text-sm font-bold text-slate-100">
                    <span>Total Amount</span>
                    <span className="text-indigo-300">
                      {currencySymbol}{cart.totalAmount?.toFixed(2)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handlePlaceOrder}
                  disabled={isPlacingOrder}
                  className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:text-indigo-400 font-bold text-sm text-white shadow-xl flex items-center justify-center gap-2 transition-all"
                >
                  {isPlacingOrder ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Placing Order with Kitchen...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm & Place Order</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
