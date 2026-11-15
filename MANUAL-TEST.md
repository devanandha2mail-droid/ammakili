# Nest by Ammakkili — 25-Step Manual Testing Sheet

Follow this checklist on a physical mobile phone (or mobile browser) connected to your staging or local network with Razorpay Test Mode enabled (`rzp_test_...`).

---

### Phase 1: Storefront Browsing & Appearance

- [ ] **Step 1: Open Storefront Home Page**  
  **Action**: Open `https://your-site.com` (or `http://<your-ip>:3000`) on your mobile browser.  
  **Expected Result**: Home page loads fast. Header shows "Nest by Ammakkili" logo, language selector, Wishlist icon, and Cart icon (with no red badge or zero badge). Hero image is sharp.

- [ ] **Step 2: Check Theme Toggle (Light & Dark Mode)**  
  **Action**: Scroll to the bottom footer and tap the "Theme: Dark" pill.  
  **Expected Result**: The background immediately transitions to luxury deep plum / near-black. Text turns crisp white/cream. No layout shifts. Tap "Theme: Light" to switch back to deep crimson.

- [ ] **Step 3: Check Malayalam Language Switch**  
  **Action**: Tap the "മലയാളം" button in the header.  
  **Expected Result**: Navigation links, headings, and buttons update to Malayalam (e.g. "ഷോപ്പ്", "സൈസ് ഗൈഡ്"). Product titles show Malayalam where available.

- [ ] **Step 4: Switch Back to English**  
  **Action**: Tap "English" in the header.  
  **Expected Result**: All interface labels smoothly revert to English.

- [ ] **Step 5: Browse Shop Page**  
  **Action**: Tap "Shop" in the navigation menu.  
  **Expected Result**: Product grid appears in 2 columns on mobile. Each card displays styled photo, title, price (₹599 / ₹699), and a heart icon.

---

### Phase 2: Wishlist & Product Selection

- [ ] **Step 6: Add Item to Wishlist**  
  **Action**: Tap the heart icon (♡) on the first product card.  
  **Expected Result**: Heart fills (♥) and a toast appears: "Saved to wishlist". The header wishlist counter increments to 1.

- [ ] **Step 7: Sign in with Google (Customer Account)**  
  **Action**: Tap "Account" or go to `/login`, then tap "Sign in with Google".  
  **Expected Result**: Google OAuth consent screen opens. After selecting your Google account, you are redirected back to `/account`. Your name and email appear under Profile.

- [ ] **Step 8: View Wishlist Page**  
  **Action**: Tap the Wishlist icon in the header.  
  **Expected Result**: The saved product appears in the wishlist list. Tapping "Move to cart" or clicking the product opens the product details.

- [ ] **Step 9: Open Product Page & Size Selector**  
  **Action**: Open "Rose Garden Nighty" product page. Tap size "M".  
  **Expected Result**: Size "M" pill highlights with a rose-gold border and shows stock count (e.g., "In stock"). "Add to cart" button enables.

- [ ] **Step 10: Add to Cart & Verify Header Badge**  
  **Action**: Tap "Add to cart".  
  **Expected Result**: Button briefly shows "Adding...", then a confirmation toast appears. Header cart badge displays a red pill with number "1".

---

### Phase 3: Cart & Checkout

- [ ] **Step 11: Inspect Cart Page**  
  **Action**: Tap the Cart icon in the header.  
  **Expected Result**: Cart shows "Rose Garden Nighty", Size "M", ₹599, shipping ₹60, and Total ₹659. The "+", "−", and "Remove" buttons work cleanly.

- [ ] **Step 12: Proceed to Checkout**  
  **Action**: Tap "Proceed to checkout".  
  **Expected Result**: Delivery details form opens. If signed in, your name and email are pre-filled. Saved address picker is available.

- [ ] **Step 13: Fill Delivery Address**  
  **Action**: Enter full name, 10-digit WhatsApp phone number, house/flat address, city, and 6-digit PIN code.  
  **Expected Result**: All fields validate smoothly with no red error messages.

- [ ] **Step 14: Check Mandatory No-Returns Checkbox**  
  **Action**: Attempt to tap "Pay securely" without ticking the checkbox, then tick the checkbox.  
  **Expected Result**: Button requires the checkbox. Ticking the checkbox clears the validation warning.

---

### Phase 4: Payment Simulation (Razorpay Test Mode)

- [ ] **Step 15: Simulate Payment Failure First**  
  **Action**: Tap "Pay ₹659 securely". When the payment modal opens, enter UPI ID `failure@razorpay` (or tap "Simulate Failure").  
  **Expected Result**: Modal closes. Main button changes to "Try again". Cart items and delivery form inputs remain intact.

- [ ] **Step 16: Complete Successful Test Payment**  
  **Action**: Tap "Try again". In the payment modal, enter UPI ID `success@razorpay` (or test card `4111 1111 1111 1111`) and tap Pay.  
  **Expected Result**: Screen shows "Verifying payment...", cart clears, and the browser redirects to `/checkout/confirmation/NEST-XXXXX`.

- [ ] **Step 17: Verify Confirmation Page**  
  **Action**: Check the confirmation screen.  
  **Expected Result**: Shows green success badge, order number (e.g., `NEST-1001`), delivery address, order summary (₹659), and a direct "Message on WhatsApp" button with pre-filled order text.

---

### Phase 5: Customer Account & Order History

- [ ] **Step 18: View Order in Customer Account**  
  **Action**: Go to `/account?tab=orders`.  
  **Expected Result**: The new order `NEST-XXXXX` is listed with status `Payment Confirmed` / `Paid`.

- [ ] **Step 19: Test Public Order Tracking (Track Order)**  
  **Action**: Go to `/track-order`, type the order ID and your WhatsApp phone number, then tap "Track order".  
  **Expected Result**: Tracking details display: Order Confirmed, Paid, and Current Status.

---

### Phase 6: Admin Management & Fulfillment

- [ ] **Step 20: Sign in to Admin Panel**  
  **Action**: Open `/admin/login` on desktop or mobile and enter admin credentials.  
  **Expected Result**: Admin dashboard opens with dark luxury styling. Recent sales revenue and orders counter reflect the new purchase.

- [ ] **Step 21: Open Order Details in Admin**  
  **Action**: Tap "Orders" in admin menu, locate `NEST-XXXXX`, and tap "View / Manage".  
  **Expected Result**: Order details open showing customer name, phone, address, items, payment ID, and fulfillment actions.

- [ ] **Step 22: Update Order Status to "Packed"**  
  **Action**: Select status "Packed" and tap "Update Status".  
  **Expected Result**: Toast confirms update. Status badge changes to "Packed".

- [ ] **Step 23: Update Order Status to "Shipped" with Tracking Info**  
  **Action**: Select status "Shipped", enter Courier Name (e.g., "India Post Speed Post") and Tracking ID (e.g., "EK123456789IN"), then tap "Update Status".  
  **Expected Result**: Status updates to "Shipped". Customer WhatsApp notification link updates with tracking details.

- [ ] **Step 24: Verify Customer Sees Tracking Update**  
  **Action**: Refresh the customer `/track-order` page for `NEST-XXXXX`.  
  **Expected Result**: Status now shows "Shipped" with Courier: "India Post Speed Post" and Tracking ID "EK123456789IN".

- [ ] **Step 25: Test Admin Security Boundary**  
  **Action**: Log out of admin, open an incognito mobile tab, and try to access `/admin/orders`.  
  **Expected Result**: Access is immediately blocked; user is redirected to `/admin/login` with no administrative data exposed.

