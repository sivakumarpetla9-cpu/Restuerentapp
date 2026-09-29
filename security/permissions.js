const PERMISSIONS = {
  // Dashboard & Agents
  "dashboard.read": ["ADMIN", "SALES", "DELIVERY", "VIEWER"],
  "agents.read": ["ADMIN", "SALES", "DELIVERY", "VIEWER"],

  // Leads & Prospects
  "leads.read": ["ADMIN", "SALES", "DELIVERY", "VIEWER"],
  "leads.write": ["ADMIN", "SALES"],

  // Qualification
  "qualification.read": ["ADMIN", "SALES", "DELIVERY", "VIEWER"],
  "qualification.write": ["ADMIN", "SALES"],

  // Sales Pipeline
  "pipeline.read": ["ADMIN", "SALES", "DELIVERY", "VIEWER"],
  "pipeline.write": ["ADMIN", "SALES"],

  // CRM / Clients
  "crm.read": ["ADMIN", "SALES", "DELIVERY", "VIEWER"],
  "crm.write": ["ADMIN", "DELIVERY"],

  // Projects & Service Delivery
  "projects.read": ["ADMIN", "SALES", "DELIVERY", "VIEWER"],
  "projects.write": ["ADMIN", "DELIVERY"],
  "onboarding.read": ["ADMIN", "SALES", "DELIVERY", "VIEWER"],
  "onboarding.write": ["ADMIN", "DELIVERY"],
  "requirements.read": ["ADMIN", "SALES", "DELIVERY", "VIEWER"],
  "requirements.write": ["ADMIN", "DELIVERY"],
  "milestones.read": ["ADMIN", "SALES", "DELIVERY", "VIEWER"],
  "milestones.write": ["ADMIN", "DELIVERY"],
  "tasks.read": ["ADMIN", "SALES", "DELIVERY", "VIEWER"],
  "tasks.write": ["ADMIN", "DELIVERY"],

  // Communication Workspace
  "communication.read": ["ADMIN", "SALES", "DELIVERY", "VIEWER"],
  "communication.write": ["ADMIN", "SALES", "DELIVERY"],
  "communication.send": ["ADMIN", "SALES"],

  // Activities & Audit
  "activity.read": ["ADMIN", "SALES", "DELIVERY", "VIEWER"],
  "audit.read": ["ADMIN"],

  // User Management
  "users.manage": ["ADMIN"],

  // Restaurant OS
  "restaurant.read": ["ADMIN", "SALES", "DELIVERY", "VIEWER"],
  "restaurant.write": ["ADMIN", "DELIVERY"],
  "restaurant.tables": ["ADMIN", "DELIVERY", "SALES"]
};

/**
 * Checks if a given role has a specific permission.
 * ADMIN role always has all permissions.
 */
function hasPermission(role, permission) {
  if (!role || typeof role !== "string") return false;
  const normalizedRole = role.toUpperCase().trim();

  // ADMIN has full system access
  if (normalizedRole === "ADMIN") return true;

  const allowedRoles = PERMISSIONS[permission];
  if (!allowedRoles || !Array.isArray(allowedRoles)) {
    return false;
  }

  return allowedRoles.includes(normalizedRole);
}

/**
 * Returns all permission strings granted to a given role.
 */
function getRolePermissions(role) {
  if (!role || typeof role !== "string") return [];
  const normalizedRole = role.toUpperCase().trim();

  if (normalizedRole === "ADMIN") {
    return Object.keys(PERMISSIONS);
  }

  return Object.keys(PERMISSIONS).filter(perm => PERMISSIONS[perm].includes(normalizedRole));
}

module.exports = {
  PERMISSIONS,
  hasPermission,
  getRolePermissions
};
