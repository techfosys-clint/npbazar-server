// Central list of admin-panel pages that access can be granted to.
// When creating an admin/staff, the creator selects a subset of these `key`s.
// The super admin implicitly has access to everything (handled in code).

const PAGES = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'products', label: 'Products' },
    { key: 'brands', label: 'Brands' },
    { key: 'collections', label: 'Collections & Categories' },
    { key: 'media', label: 'Media Library' },
    { key: 'banners', label: 'Banners / Hero' },
    { key: 'faqs', label: 'FAQs' },
    { key: 'blogs', label: 'Blog Posts' },
    { key: 'shipping', label: 'Shipping Zones' },
    { key: 'courier', label: 'Courier Integration' },
    { key: 'payments', label: 'Payment Gateways' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'orders', label: 'Orders' },
    { key: 'carts', label: 'Customer Carts' },
    { key: 'customers', label: 'Customers' },
    { key: 'reviews', label: 'Reviews' },
    { key: 'coupons', label: 'Coupons' },
    { key: 'reports', label: 'Analytics' },
    { key: 'staff', label: 'Staff & Admins' },
    { key: 'settings', label: 'Settings' },
];

const PAGE_KEYS = PAGES.map((p) => p.key);

// Wildcard used to mean "all pages" (granted to the super admin).
const ALL_ACCESS = '*';

module.exports = { PAGES, PAGE_KEYS, ALL_ACCESS };
