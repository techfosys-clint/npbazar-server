# Ecomus API Documentation

Base URL: `http://localhost:5000`

All responses are JSON and share a common shape:

```json
{ "success": true, "message": "optional message", "...": "data" }
```

On error:

```json
{ "success": false, "message": "what went wrong" }
```

---

## Authentication

There are **two separate auth systems** with separate JWTs:

| System | Login with | Token type | Send as |
|--------|-----------|------------|---------|
| **Admin panel** | email + password | `admin` | `Authorization: Bearer <token>` |
| **Storefront user** | mobile + password | `user` | `Authorization: Bearer <token>` |

Tokens are **not interchangeable** — a user token cannot access admin routes and vice versa. Tokens expire per `JWT_EXPIRES_IN` (default `7d`).

### Admin permission model

- The **first** admin to register becomes the **Super Admin** — holds all-access (`*`), cannot be deleted or modified by anyone.
- Additional **admin/staff** accounts are created from inside the panel; the creator picks which **pages** they can access.
- Each admin-only route requires access to a specific page (shown in the **Perm** column below).

Available page keys: `dashboard`, `products`, `categories`, `brands`, `orders`, `customers`, `reviews`, `coupons`, `reports`, `staff`, `settings`.
Fetch the labelled list any time via `GET /api/admin/pages`.

---

# 1. Admin Auth — `/api/admin`

| Method | Endpoint | Auth | Perm | Description |
|--------|----------|------|------|-------------|
| GET | `/api/admin/pages` | — | — | List grantable pages (for the register form) |
| POST | `/api/admin/register` | — | — | Register the **first** admin as Super Admin (blocked afterwards) |
| POST | `/api/admin/login` | — | — | Log in, returns token |
| GET | `/api/admin/me` | admin | — | Current admin profile |
| POST | `/api/admin/create` | admin | `staff` | Create admin/staff, auto-emails credentials |
| GET | `/api/admin` | admin | `staff` | List all admins/staff |
| PATCH | `/api/admin/:id` | admin | `staff` | Update permissions/role/active (super admin locked) |
| DELETE | `/api/admin/:id` | admin | `staff` | Delete admin/staff (super admin cannot be deleted) |

**POST `/api/admin/register`**
```json
{ "fullName": "Jane Owner", "email": "owner@shop.com", "password": "secret123" }
```
Response `201`: `{ success, message, token, admin }`

**POST `/api/admin/login`**
```json
{ "email": "owner@shop.com", "password": "secret123" }
```
Response: `{ success, message, token, admin }`

**POST `/api/admin/create`** — creates an admin or staff. System generates a password and emails it + portal link. Only the super admin can create `role: "admin"`.
```json
{
  "fullName": "Rakib Staff",
  "email": "rakib@shop.com",
  "role": "staff",
  "permissions": ["products", "orders"]
}
```
Response `201`: `{ success, message, emailSent, admin }`

**PATCH `/api/admin/:id`**
```json
{ "permissions": ["products", "orders", "coupons"], "role": "staff", "isActive": true }
```

---

# 2. User Auth — `/api/user`

Registration sends an OTP to the mobile number (via FoxSES SMS). The phone must be verified before login works.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/user/register` | — | Register + send OTP |
| POST | `/api/user/verify-otp` | — | Verify phone, returns token |
| POST | `/api/user/resend-otp` | — | Resend OTP |
| POST | `/api/user/login` | — | Log in (requires verified phone) |
| GET | `/api/user/me` | user | Current user profile |

**POST `/api/user/register`**
```json
{ "name": "Karim", "mobile": "01712345678", "email": "karim@mail.com", "password": "pass123" }
```
Response `201`: `{ success, message, userId }`

**POST `/api/user/verify-otp`**
```json
{ "mobile": "01712345678", "otp": "123456" }
```
Response: `{ success, message, token, user }`

**POST `/api/user/login`**
```json
{ "mobile": "01712345678", "password": "pass123" }
```
Response: `{ success, message, token, user }`
If phone not verified → `403` with `{ requiresVerification: true }`.

---

# 3. Categories — `/api/categories`

| Method | Endpoint | Auth | Perm | Description |
|--------|----------|------|------|-------------|
| GET | `/api/categories` | — | — | List active categories (`?all=true` includes inactive) |
| GET | `/api/categories/:slug` | — | — | Single category |
| POST | `/api/categories` | admin | `categories` | Create |
| PATCH | `/api/categories/:id` | admin | `categories` | Update |
| DELETE | `/api/categories/:id` | admin | `categories` | Delete |

**POST body**
```json
{ "name": "Men's Fashion", "description": "...", "image": "url", "parent": null, "order": 1, "isActive": true }
```
`slug` is auto-generated from `name`.

---

# 4. Brands — `/api/brands`

| Method | Endpoint | Auth | Perm | Description |
|--------|----------|------|------|-------------|
| GET | `/api/brands` | — | — | List active brands (`?all=true` for inactive) |
| GET | `/api/brands/:slug` | — | — | Single brand |
| POST | `/api/brands` | admin | `brands` | Create |
| PATCH | `/api/brands/:id` | admin | `brands` | Update |
| DELETE | `/api/brands/:id` | admin | `brands` | Delete |

**POST body**
```json
{ "name": "Nike", "logo": "url", "description": "...", "isActive": true }
```

---

# 5. Products — `/api/products`

| Method | Endpoint | Auth | Perm | Description |
|--------|----------|------|------|-------------|
| GET | `/api/products` | — | — | List with filters (see below) |
| GET | `/api/products/:slug` | — | — | Single product |
| POST | `/api/products` | admin | `products` | Create |
| PATCH | `/api/products/:id` | admin | `products` | Update |
| DELETE | `/api/products/:id` | admin | `products` | Delete |

**GET `/api/products` query params**

| Param | Example | Notes |
|-------|---------|-------|
| `search` | `shirt` | Full-text on name/description/tags |
| `category` | `mens-fashion` | Category **slug** |
| `brand` | `nike` | Brand **slug** |
| `minPrice` / `maxPrice` | `500` / `2000` | Price range |
| `featured` | `true` | Only featured products |
| `sort` | `newest` \| `price_asc` \| `price_desc` \| `popular` \| `rating` | Default `newest` |
| `page` / `limit` | `1` / `12` | Pagination (limit max 60) |
| `all` | `true` | Admin: include inactive |

Response:
```json
{
  "success": true,
  "products": [ /* populated with category & brand */ ],
  "pagination": { "page": 1, "limit": 12, "total": 45, "pages": 4 }
}
```

**POST body**
```json
{
  "name": "Cotton T-Shirt",
  "description": "...",
  "shortDescription": "...",
  "price": 799,
  "comparePrice": 999,
  "sku": "TS-001",
  "stock": 100,
  "thumbnail": "url",
  "images": ["url1", "url2"],
  "category": "<categoryId>",
  "brand": "<brandId>",
  "tags": ["summer", "cotton"],
  "variants": [{ "name": "Size", "options": ["S", "M", "L"] }],
  "isFeatured": false,
  "isActive": true
}
```
`rating`/`numReviews` are system-managed and ignored on write.

---

# 6. Product Reviews — `/api/products/:productId/reviews`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/products/:productId/reviews` | — | Approved reviews for a product |
| POST | `/api/products/:productId/reviews` | user | Create review (must have purchased) |

**POST body**
```json
{ "rating": 5, "comment": "Great quality!" }
```
Rules: only buyers of the product can review, **one review per user per product**. Product rating recomputes automatically.

---

# 7. Cart — `/api/cart` *(user)*

All routes require a user token.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cart` | Get cart with live totals |
| POST | `/api/cart` | Add item |
| PATCH | `/api/cart/item` | Set absolute quantity (0 removes) |
| DELETE | `/api/cart/item/:productId` | Remove one item |
| DELETE | `/api/cart` | Clear cart |

**POST body**
```json
{ "productId": "<id>", "quantity": 2, "variant": { "Size": "M", "Color": "Red" } }
```
**PATCH body**
```json
{ "productId": "<id>", "quantity": 3 }
```
Cart response:
```json
{
  "success": true,
  "cart": {
    "items": [{ "product": { }, "quantity": 2, "variant": {}, "lineTotal": 1598 }],
    "subtotal": 1598,
    "count": 2
  }
}
```

---

# 8. Wishlist — `/api/wishlist` *(user)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/wishlist` | Get wishlist products |
| POST | `/api/wishlist` | Add `{ "productId": "<id>" }` |
| DELETE | `/api/wishlist/:productId` | Remove |

---

# 9. Addresses — `/api/addresses` *(user)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/addresses` | List user's addresses |
| POST | `/api/addresses` | Create |
| PATCH | `/api/addresses/:id` | Update |
| DELETE | `/api/addresses/:id` | Delete |

**POST body**
```json
{
  "fullName": "Karim",
  "phone": "01712345678",
  "addressLine": "House 12, Road 5",
  "area": "Dhanmondi",
  "city": "Dhaka",
  "postalCode": "1209",
  "isDefault": true
}
```
First address is default automatically; setting a new default unsets the old one.

---

# 10. Coupons — `/api/coupons`

| Method | Endpoint | Auth | Perm | Description |
|--------|----------|------|------|-------------|
| POST | `/api/coupons/validate` | user | — | Validate a code against a subtotal |
| GET | `/api/coupons` | admin | `coupons` | List all |
| POST | `/api/coupons` | admin | `coupons` | Create |
| PATCH | `/api/coupons/:id` | admin | `coupons` | Update |
| DELETE | `/api/coupons/:id` | admin | `coupons` | Delete |

**POST `/api/coupons` (admin)**
```json
{
  "code": "EID25",
  "type": "percentage",
  "value": 25,
  "minOrder": 1000,
  "maxDiscount": 500,
  "usageLimit": 100,
  "expiresAt": "2026-12-31T00:00:00.000Z",
  "isActive": true
}
```
`type` is `percentage` or `fixed`.

**POST `/api/coupons/validate` (user)**
```json
{ "code": "EID25", "subtotal": 2000 }
```
Response: `{ success, coupon, discount, total }` — or `400` with a reason (expired, min order, limit reached).

---

# 11. Orders (storefront) — `/api/orders` *(user)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders` | Checkout (uses current cart) |
| GET | `/api/orders/my` | My orders |
| GET | `/api/orders/my/:id` | My order detail |
| POST | `/api/orders/my/:id/cancel` | Cancel (only while pending/processing) |

**POST `/api/orders` — checkout**
```json
{
  "shippingAddress": {
    "fullName": "Karim",
    "phone": "01712345678",
    "addressLine": "House 12, Road 5",
    "area": "Dhanmondi",
    "city": "Dhaka",
    "postalCode": "1209"
  },
  "couponCode": "EID25",
  "paymentMethod": "cod"
}
```
Server validates stock, snapshots prices, applies coupon + shipping, decrements stock, clears the cart, and returns the created order. `paymentMethod` = `cod` or `online`.

---

# 12. Admin — Orders — `/api/admin-orders` *(perm: `orders`)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin-orders` | List/filter all orders |
| GET | `/api/admin-orders/:id` | Order detail (with customer) |
| PATCH | `/api/admin-orders/:id/status` | Update order/payment status |

**Query params:** `status`, `paymentStatus`, `search` (order number), `page`, `limit`.

**PATCH body**
```json
{ "orderStatus": "shipped", "paymentStatus": "paid", "note": "Handed to courier" }
```
`orderStatus`: `pending` \| `processing` \| `shipped` \| `delivered` \| `cancelled`.
`paymentStatus`: `pending` \| `paid` \| `failed` \| `refunded`.
Delivering a COD order auto-marks it paid.

---

# 13. Admin — Reviews — `/api/admin-reviews` *(perm: `reviews`)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin-reviews` | List (`?approved=true|false`) |
| PATCH | `/api/admin-reviews/:id` | Approve/reject `{ "isApproved": true }` |
| DELETE | `/api/admin-reviews/:id` | Delete |

---

# 14. Admin — Customers — `/api/customers` *(perm: `customers`)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/customers` | List/search users (`search`, `page`, `limit`) |
| GET | `/api/customers/:id` | Profile + orders + spend stats |

---

# 15. Dashboard — `/api/dashboard` *(perm: `dashboard`)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Headline metrics |
| GET | `/api/dashboard/sales?days=7` | Daily revenue for a chart |
| GET | `/api/dashboard/top-products` | Best sellers |

**`/stats` response**
```json
{
  "success": true,
  "stats": {
    "totalOrders": 0, "pendingOrders": 0, "totalProducts": 0,
    "lowStock": 0, "totalCustomers": 0, "totalRevenue": 0
  }
}
```

---

# 16. Settings — `/api/settings`

| Method | Endpoint | Auth | Perm | Description |
|--------|----------|------|------|-------------|
| GET | `/api/settings` | — | — | Storefront config |
| PATCH | `/api/settings` | admin | `settings` | Update |

**PATCH body (any subset)**
```json
{
  "storeName": "Ecomus",
  "logo": "url",
  "email": "hello@shop.com",
  "phone": "01700000000",
  "currency": "BDT",
  "currencySymbol": "৳",
  "shippingCost": 60,
  "freeShippingThreshold": 2000,
  "socialLinks": { "facebook": "url", "instagram": "url" }
}
```

---

## Common status codes

| Code | Meaning |
|------|---------|
| `200` | OK |
| `201` | Created |
| `400` | Bad request / validation error |
| `401` | Missing or invalid token |
| `403` | Authenticated but not permitted (wrong page access / super admin locked) |
| `404` | Not found |
| `409` | Conflict (duplicate email/slug/code) |
| `500` | Server error |

## Environment variables (`.env`)

```
PORT, MONGODB_URI
JWT_SECRET, JWT_EXPIRES_IN, OTP_EXPIRES_MINUTES
ADMIN_PORTAL_URL
SMS_GATEWAY_BASE_URL, SMS_GATEWAY_CLIENT_ID, SMS_GATEWAY_API_KEY, SMS_GATEWAY_SENDER_ID
SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM_NAME, SMTP_FROM_EMAIL
CREDENTIALS_ENCRYPTION_KEY   # 32-byte hex, encrypts connected courier/payment-gateway API credentials at rest
SERVER_PUBLIC_URL            # public base URL couriers/payment gateways can reach for webhook/IPN delivery
STOREFRONT_URL               # storefront's own public base URL, for post-payment redirect back to the customer
```
