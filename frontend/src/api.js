// Local API client for AI Business Agent Dashboard

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
  ? String(import.meta.env.VITE_API_URL).replace(/\/$/, '')
  : '';

let inMemoryToken = null;
try {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    inMemoryToken = window.sessionStorage.getItem('ai_biz_token');
  }
} catch (_) {}

export function setAuthToken(token) {
  inMemoryToken = token;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (token) {
        window.sessionStorage.setItem('ai_biz_token', token);
      } else {
        window.sessionStorage.removeItem('ai_biz_token');
      }
    }
  } catch (_) {}
}

export function getAuthToken() {
  return inMemoryToken;
}

const DEFAULT_FETCH_OPTIONS = {
  credentials: 'include' // Ensures HTTP-only session cookies are sent with requests
};

async function apiFetch(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (inMemoryToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${inMemoryToken}`;
  }

  const mergedOptions = {
    ...DEFAULT_FETCH_OPTIONS,
    ...options,
    headers
  };

  const res = await fetch(`${API_BASE}${url}`, mergedOptions);
  return res;
}

/* ========================================================================= */
/* AUTHENTICATION & USERS                                                    */
/* ========================================================================= */

export async function login({ email, password }) {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to authenticate');
  }
  if (data.token) {
    setAuthToken(data.token);
  }
  return data;
}

export async function logout() {
  setAuthToken(null);
  const res = await apiFetch('/api/auth/logout', {
    method: 'POST'
  });
  return res.json().catch(() => ({ success: true }));
}

export async function fetchCurrentUser() {
  const res = await apiFetch('/api/auth/me');
  if (!res.ok) {
    return { authenticated: false, user: null };
  }
  return res.json();
}

export async function fetchUsers() {
  const res = await apiFetch('/api/users');
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

export async function createUser(userData) {
  const res = await apiFetch('/api/users', {
    method: 'POST',
    body: JSON.stringify(userData)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create user');
  return data;
}

export async function updateUser(id, updates) {
  const res = await apiFetch(`/api/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to update user');
  return data;
}

export async function fetchAuditLogs(filter = {}) {
  const params = new URLSearchParams();
  if (filter.type) params.append('type', filter.type);
  if (filter.email) params.append('email', filter.email);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch(`/api/security/audit${query}`);
  if (!res.ok) throw new Error('Failed to fetch security audit logs');
  return res.json();
}

/* ========================================================================= */
/* BUSINESS DOMAINS                                                          */
/* ========================================================================= */

export async function fetchOverview() {
  const res = await apiFetch('/api/dashboard/overview');
  if (!res.ok) throw new Error('Failed to fetch dashboard overview');
  return res.json();
}

export async function fetchAgents() {
  const res = await apiFetch('/api/agents');
  if (!res.ok) throw new Error('Failed to fetch agents');
  return res.json();
}

export async function fetchLeads() {
  const res = await apiFetch('/api/leads');
  if (!res.ok) throw new Error('Failed to fetch leads');
  return res.json();
}

export async function fetchLeadDetail(id) {
  const res = await apiFetch(`/api/leads/${id}`);
  if (!res.ok) throw new Error('Failed to fetch lead details');
  return res.json();
}

export async function fetchPipeline() {
  const res = await apiFetch('/api/pipeline');
  if (!res.ok) throw new Error('Failed to fetch pipeline');
  return res.json();
}

export async function fetchClients() {
  const res = await apiFetch('/api/clients');
  if (!res.ok) throw new Error('Failed to fetch clients');
  return res.json();
}

export async function fetchClientProfile(id) {
  const res = await apiFetch(`/api/clients/${id}`);
  if (!res.ok) throw new Error('Failed to fetch client profile');
  return res.json();
}

export async function fetchProjects() {
  const res = await apiFetch('/api/projects');
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

export async function fetchProjectDetail(id) {
  const res = await apiFetch(`/api/projects/${id}`);
  if (!res.ok) throw new Error('Failed to fetch project details');
  return res.json();
}

export async function fetchOnboarding() {
  const res = await apiFetch('/api/onboarding');
  if (!res.ok) throw new Error('Failed to fetch onboarding');
  return res.json();
}

export async function fetchRequirements(filter = {}) {
  const params = new URLSearchParams();
  if (filter.status) params.append('status', filter.status);
  if (filter.source) params.append('source', filter.source);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch(`/api/requirements${query}`);
  if (!res.ok) throw new Error('Failed to fetch requirements');
  return res.json();
}

export async function fetchMilestones() {
  const res = await apiFetch('/api/milestones');
  if (!res.ok) throw new Error('Failed to fetch milestones');
  return res.json();
}

export async function fetchTasks(filter = {}) {
  const params = new URLSearchParams();
  if (filter.status) params.append('status', filter.status);
  if (filter.priority) params.append('priority', filter.priority);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch(`/api/tasks${query}`);
  if (!res.ok) throw new Error('Failed to fetch tasks');
  return res.json();
}

export async function fetchActivities() {
  const res = await apiFetch('/api/activities');
  if (!res.ok) throw new Error('Failed to fetch activities');
  return res.json();
}

export async function searchGlobal(q) {
  if (!q || !q.trim()) return { results: [] };
  const res = await apiFetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
  if (!res.ok) throw new Error('Failed to search');
  return res.json();
}

export async function fetchMessages(filter = {}) {
  const params = new URLSearchParams();
  if (filter.channel) params.append('channel', filter.channel);
  if (filter.status) params.append('status', filter.status);
  if (filter.purpose) params.append('purpose', filter.purpose);
  if (filter.leadId) params.append('leadId', filter.leadId);
  if (filter.clientId) params.append('clientId', filter.clientId);
  if (filter.projectId) params.append('projectId', filter.projectId);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch(`/api/messages${query}`);
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

export async function fetchMessageDetail(id) {
  const res = await apiFetch(`/api/messages/${id}`);
  if (!res.ok) throw new Error('Failed to fetch message details');
  return res.json();
}

export async function createDraft(payload) {
  const res = await apiFetch('/api/messages/draft', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to prepare draft');
  }
  return data;
}

export async function updateMessageStatus(id, status) {
  const res = await apiFetch(`/api/messages/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update message status');
  }
  return data;
}

export async function approveMessage(id) {
  const res = await apiFetch(`/api/messages/${id}/approve`, {
    method: 'POST'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to approve message');
  return data;
}

export async function copyMessage(id) {
  const res = await apiFetch(`/api/messages/${id}/copy`, {
    method: 'POST'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to mark message as copied');
  return data;
}

export async function fetchTemplates(filter = {}) {
  const params = new URLSearchParams();
  if (filter.channel) params.append('channel', filter.channel);
  if (filter.purpose) params.append('purpose', filter.purpose);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch(`/api/templates${query}`);
  if (!res.ok) throw new Error('Failed to fetch templates');
  return res.json();
}

export async function fetchCommunicationOverview() {
  const res = await apiFetch('/api/communication/overview');
  if (!res.ok) throw new Error('Failed to fetch communication overview');
  return res.json();
}

export async function sendCommunicationMessage(messageId, options = {}) {
  const res = await apiFetch('/api/communication/send', {
    method: 'POST',
    body: JSON.stringify({ messageId, options })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to send message');
  return data;
}

export async function simulateCommunicationEvent(payload = {}) {
  const res = await apiFetch('/api/communication/simulate', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to simulate event');
  return data;
}

export async function fetchCommunicationEvents(filter = {}) {
  const params = new URLSearchParams();
  if (filter.messageId) params.append('messageId', filter.messageId);
  if (filter.type) params.append('type', filter.type);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch(`/api/communication/events${query}`);
  if (!res.ok) throw new Error('Failed to fetch communication events');
  return res.json();
}

export async function fetchMessageStatus(messageId) {
  const res = await apiFetch(`/api/communication/messages/${messageId}/status`);
  if (!res.ok) throw new Error('Failed to fetch message status');
  return res.json();
}

/* ========================================================================= */
/* RESTAURANT PUBLIC ORDER MENU                                              */
/* ========================================================================= */

export async function fetchPublicOrderMenu(qrToken) {
  const res = await apiFetch(`/api/order/menu/${encodeURIComponent(qrToken)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to load menu');
  }
  return data;
}

/* ========================================================================= */
/* RESTAURANT OS v1 - PHASE 4: CUSTOMER SESSION, CART & ORDER API           */
/* ========================================================================= */

let currentCustomerSessionToken = null;

export function setCustomerSessionToken(token) {
  currentCustomerSessionToken = token;
}

export function getCustomerSessionToken() {
  return currentCustomerSessionToken;
}

function customerSessionHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (currentCustomerSessionToken) {
    headers['X-Session-Token'] = currentCustomerSessionToken;
  }
  return headers;
}

export async function initCustomerSession(qrToken, sessionData = {}) {
  const res = await apiFetch(`/api/order/session/${encodeURIComponent(qrToken)}`, {
    method: 'POST',
    body: JSON.stringify(sessionData)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to initialize table session');
  }
  if (data.sessionToken) {
    setCustomerSessionToken(data.sessionToken);
  }
  return data;
}

export async function fetchCustomerCart(sessionToken) {
  const headers = customerSessionHeaders(
    sessionToken ? { 'X-Session-Token': sessionToken } : {}
  );
  const res = await apiFetch('/api/order/cart', { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch cart');
  }
  return data;
}

export async function addCustomerCartItem({ menuItemId, quantity = 1, customizations, notes }, sessionToken) {
  const headers = customerSessionHeaders(
    sessionToken ? { 'X-Session-Token': sessionToken } : {}
  );
  const res = await apiFetch('/api/order/cart/items', {
    method: 'POST',
    headers,
    body: JSON.stringify({ menuItemId, quantity, customizations, notes })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to add item to cart');
  }
  return data;
}

export async function updateCustomerCartItem(cartItemId, quantity, sessionToken) {
  const headers = customerSessionHeaders(
    sessionToken ? { 'X-Session-Token': sessionToken } : {}
  );
  const res = await apiFetch(`/api/order/cart/items/${encodeURIComponent(cartItemId)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ quantity })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update cart item');
  }
  return data;
}

export async function removeCustomerCartItem(cartItemId, sessionToken) {
  const headers = customerSessionHeaders(
    sessionToken ? { 'X-Session-Token': sessionToken } : {}
  );
  const res = await apiFetch(`/api/order/cart/items/${encodeURIComponent(cartItemId)}`, {
    method: 'DELETE',
    headers
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to remove cart item');
  }
  return data;
}

export async function placeCustomerOrder(orderPayload = {}, sessionToken) {
  const headers = customerSessionHeaders(
    sessionToken ? { 'X-Session-Token': sessionToken } : {}
  );
  if (orderPayload.idempotencyKey) {
    headers['Idempotency-Key'] = orderPayload.idempotencyKey;
  }
  const res = await apiFetch('/api/order/place', {
    method: 'POST',
    headers,
    body: JSON.stringify(orderPayload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to place order');
  }
  return data;
}

export async function fetchCustomerOrderStatus(orderId, sessionToken) {
  const headers = customerSessionHeaders(
    sessionToken ? { 'X-Session-Token': sessionToken } : {}
  );
  const res = await apiFetch(`/api/order/status/${encodeURIComponent(orderId)}`, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch order status');
  }
  return data;
}

export async function fetchCustomerOrders(sessionToken) {
  const headers = customerSessionHeaders(
    sessionToken ? { 'X-Session-Token': sessionToken } : {}
  );
  const res = await apiFetch('/api/order/orders', { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch customer orders');
  }
  return data;
}

/* ===================================================================== */
/* RESTAURANT OS v1 - PHASE 5: KITCHEN DISPLAY & ORDER MANAGEMENT        */
/* ===================================================================== */

export async function fetchKitchenOrders(filter = {}) {
  const params = new URLSearchParams();
  if (filter.status) {
    if (Array.isArray(filter.status)) {
      params.append('status', filter.status.join(','));
    } else {
      params.append('status', filter.status);
    }
  }
  if (filter.branchId) params.append('branchId', filter.branchId);
  if (filter.tableId) params.append('tableId', filter.tableId);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch(`/api/restaurant/orders/kitchen${query}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch kitchen orders');
  }
  return data;
}

export async function fetchRestaurantOrderDetail(orderId) {
  const res = await apiFetch(`/api/restaurant/orders/${encodeURIComponent(orderId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch order details');
  }
  return data;
}

export async function updateRestaurantOrderStatus(orderId, status, currentStatus = null, cancelReason = null) {
  const payload = { status };
  if (currentStatus) payload.currentStatus = currentStatus;
  if (cancelReason) payload.cancelReason = cancelReason;

  const res = await apiFetch(`/api/restaurant/orders/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'Failed to update order status');
    error.status = res.status;
    error.currentStatus = data.currentStatus;
    throw error;
  }
  return data;
}

export async function fetchBillingSettings() {
  const res = await apiFetch('/api/restaurant/billing/settings');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'Failed to fetch billing settings');
    error.status = res.status;
    throw error;
  }
  return data;
}

export async function updateBillingSettings(settings) {
  const res = await apiFetch('/api/restaurant/billing/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'Failed to update billing settings');
    error.status = res.status;
    throw error;
  }
  return data;
}

export async function fetchBills(filter = {}) {
  const params = new URLSearchParams();
  if (filter.status) params.append('paymentStatus', filter.status);
  if (filter.paymentMethod) params.append('paymentMethod', filter.paymentMethod);
  if (filter.orderId) params.append('orderId', filter.orderId);
  if (filter.tableId) params.append('tableId', filter.tableId);
  const query = params.toString() ? `?${params.toString()}` : '';

  const res = await apiFetch(`/api/restaurant/billing${query}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'Failed to fetch bills');
    error.status = res.status;
    error.code = data.code;
    throw error;
  }
  return data;
}

export async function fetchBillDetail(billId) {
  const res = await apiFetch(`/api/restaurant/billing/${encodeURIComponent(billId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'Failed to fetch bill details');
    error.status = res.status;
    throw error;
  }
  return data;
}

export async function createBillForOrder(orderId, options = {}) {
  const res = await apiFetch(`/api/restaurant/billing/orders/${encodeURIComponent(orderId)}/bill`, {
    method: 'POST',
    body: JSON.stringify(options)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'Failed to generate bill');
    error.status = res.status;
    error.code = data.code;
    throw error;
  }
  return data;
}

export async function recordBillPayment(billId, paymentData) {
  const res = await apiFetch(`/api/restaurant/billing/${encodeURIComponent(billId)}/payment`, {
    method: 'PATCH',
    body: JSON.stringify(paymentData)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'Failed to record payment');
    error.status = res.status;
    error.code = data.code;
    throw error;
  }
  return data;
}

export async function fetchBillReceipt(billId) {
  const res = await apiFetch(`/api/restaurant/billing/${encodeURIComponent(billId)}/receipt`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'Failed to fetch receipt');
    error.status = res.status;
    throw error;
  }
  return data;
}



