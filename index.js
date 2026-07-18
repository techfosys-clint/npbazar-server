const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const connectDB = require('./config/db');

// Auth
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');

// Catalog (public + admin CRUD)
const brandRoutes = require('./routes/brandRoutes');
const productRoutes = require('./routes/productRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const bannerRoutes = require('./routes/bannerRoutes');
const faqRoutes = require('./routes/faqRoutes');
const shippingZoneRoutes = require('./routes/shippingZoneRoutes');
const collectionRoutes = require('./routes/collectionRoutes');
const blogRoutes = require('./routes/blogRoutes');
const blogPostRoutes = require('./routes/blogPostRoutes');

// Storefront (user)
const cartRoutes = require('./routes/cartRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const addressRoutes = require('./routes/addressRoutes');
const orderRoutes = require('./routes/orderRoutes');
const couponRoutes = require('./routes/couponRoutes');

// Uploads (image files)
const uploadRoutes = require('./routes/uploadRoutes');

// Admin management
const adminOrderRoutes = require('./routes/adminOrderRoutes');
const adminCartRoutes = require('./routes/adminCartRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const adminReviewRoutes = require('./routes/adminReviewRoutes');
const customerRoutes = require('./routes/customerRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const courierRoutes = require('./routes/courierRoutes');
const paymentGatewayRoutes = require('./routes/paymentGatewayRoutes');

// Courier webhooks (public — couriers call these directly, no admin auth)
const courierWebhookRoutes = require('./routes/courierWebhookRoutes');

// Payment callbacks/IPN (public — customers' browsers and gateway servers hit these)
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Basic Route
app.get('/', (req, res) => {
    res.send('Ecomus Server is running');
});

// API Routes
// --- Auth ---
app.use('/api/admin', adminRoutes); // admin panel: super admin, admin & staff
app.use('/api/user', userRoutes);   // storefront users (mobile + password, email-based password reset)

// --- Catalog (public reads + admin writes) ---
app.use('/api/brands', brandRoutes);
app.use('/api/products', productRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/shipping-zones', shippingZoneRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/blog-posts', blogPostRoutes);

// --- Storefront (logged-in user) ---
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/orders', orderRoutes);

// --- Uploads ---
app.use('/api/upload', uploadRoutes);

// --- Admin management ---
app.use('/api/admin-orders', adminOrderRoutes);
app.use('/api/admin-carts', adminCartRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/admin-reviews', adminReviewRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/courier', courierRoutes);
app.use('/api/payment-gateways', paymentGatewayRoutes);

// --- Courier webhooks (public — couriers call these, no admin auth) ---
app.use('/api/courier-webhooks', courierWebhookRoutes);

// --- Payment callbacks/IPN (public — no admin auth) ---
app.use('/api/payments', paymentRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
