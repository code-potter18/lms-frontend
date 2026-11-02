/**
 * Navigation route map — single source of truth for AI chat navigation.
 * When adding a new page, add an entry here. The AI chat will automatically
 * be able to navigate to it.
 *
 * Key = keywords the user might say (lowercase)
 * Value = the route path
 */
export const NAV_ROUTES: Record<string, string> = {
    // Main
    dashboard: "/dashboard",
    home: "/dashboard",

    // Appointments
    appointments: "/appointments",
    appointment: "/appointments",
    "day view": "/appointments/day-view",
    "week view": "/appointments/week-view",
    "reschedule queue": "/appointments/reschedule-queue",
    reschedule: "/appointments/reschedule-queue",
    "pending bookings": "/appointments/pending",
    "pending follow-ups": "/appointments/pending",
    "pending followups": "/appointments/pending",
    "follow-ups due": "/appointments/pending",

    // Patients
    patients: "/patients",
    patient: "/patients",

    // Doctors
    doctors: "/doctor",
    doctor: "/doctor",
    "doctor schedule": "/doctor/schedule",
    "my schedule": "/doctor/schedule",
    schedule: "/doctor/schedule",
    leave: "/doctor/leave",
    reviews: "/doctor/reviews",

    // Staff
    staff: "/staff",

    // Orders
    orders: "/orders",
    chemotherapy: "/orders",

    // Departments
    departments: "/departments",
    department: "/departments",

    // Notifications
    notifications: "/notifications",
    notification: "/notifications",

    // Profile
    profile: "/profile",
    security: "/security",

    // Admin
    admin: "/admin",
    permissions: "/admin/permissions",
    roles: "/admin/roles",

    // Protocols
    protocol: "/protocol",
    protocols: "/protocol",
    cancer: "/protocol/cancer",

    // AI Chat
    chat: "/chat",
    "ai chat": "/chat",
    "ai assistant": "/chat",

    // Login
    login: "/",
};
