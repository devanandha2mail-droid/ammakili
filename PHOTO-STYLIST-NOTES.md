# Photo Stylist – Implementation Notes

## 1. What Was Built

### Python Service (`services/stylist/`)
- Extracted and structured the service directly under `services/stylist/`.
- Configured with `Dockerfile` and `docker-compose.yml` declaring `expose: ["8001"]` with memory limit `1500M`, ensuring it is reachable only internally by the Express web container and never published to the outside host.
- Python unit tests (`services/stylist/tests/test_pipeline.py`) run with `pytest`: **12/12 passed**.
- Measured benchmark on fixtures (`flat.jpg`, `hanging.jpg`, `worn.jpg`):
  - **Memory Usage:** Peak resident set size (RSS) stable at **~940 MB** with both ONNX models loaded (`isnet-general-use` and `u2net_cloth_seg`), well within the 1.5 GB Docker limit.
  - **Processing Speed:** **~6.1 seconds per photo** once models are loaded in memory.
  - **Hanger & Presentation Logic Verified:**
    - `flat.jpg` (laid flat): Hanger added (`hanger_added: true`), quality: `good`.
    - `hanging.jpg` (already hanging): Own hanger preserved, no second hanger added (`hanger_added: false`).
    - `worn.jpg` (person wearing/holding): Hanger skipped (`hanger_added: false`), quality: `good`, warning generated: *"This photo shows a person, so the hanger style was skipped. A dress on a hanger or laid flat gives the best result."*

### Node Client & Worker (`src/services/`)
- `src/services/photoStylist.js`:
  - `styleImage(buffer, { mode, hanger, background })` sends multipart POST to `${STYLIST_URL}/style` with `X-Stylist-Key`.
  - 90-second timeout, automatic single retry on network/server error, no retry on client 4xx errors.
  - `isAvailable()` endpoint health checker for non-blocking UI graceful degradation.
  - Strict privacy: No raw image buffers or shared secret keys logged.
- `src/services/photoJobWorker.js`:
  - Background worker polling MongoDB every 2 seconds for `queued` jobs, processing **one job at a time**.
  - Automatic restart recovery: On startup, any jobs stuck in `processing` for > 5 minutes are reset to `queued`.
  - Generates 1200x1500 styled WebP and produces 400w, 800w, 1200w `srcset` variants via `sharp`.
  - Provides `retryJob(id, newOptions)` and file cleanup on deletion.
  - Calculates live dashboard metrics (queued, processing, failed, average duration).
- `src/services/stylistUpload.js`:
  - Enforces 12 MB max per photo, up to 10 photos per upload.
  - Strict magic bytes inspection (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF...WEBP`, HEIC `ftyp...heic`), rejecting renamed scripts.
  - EXIF orientation applied automatically; GPS and camera metadata stripped via `sharp`.
  - Resizes original photos to at most 2000px on the long side (WebP quality 85).

### Data Model & Migrations
- `Product.images`: Converted from plain string array to structured object array:
  `{ url, kind: 'styled' | 'original' | 'extra', sourceId, width, height, meta }`.
  - Mongoose setter & schema methods: `getOrderedImages()`, `getMainImage()`, `getSecondImage()`.
  - Custom `toString()` method so legacy string interpolation or templates remain backwards-compatible.
- `PhotoJob` collection (`src/models/PhotoJob.js`):
  - Stores `{ productId, draftId, sourceKey, originalUrl, options, status, resultKey, variants, meta, error, startedAt, finishedAt }`.
- `src/utils/migrateImages.js`:
  - Migrates existing MongoDB documents with string images to `{ url, kind: 'extra' }` without loss.

### Admin Experience (`src/views/admin/product-form.ejs` & `dashboard.ejs`)
- Integrated using the existing dark admin aesthetic (`admin-dark.css` and `a-` classes).
- Large drop zone with multi-file drag-and-drop and tips card.
- Live progress card showing a shimmer and *"Styling... about 15 to 30 seconds"*, polling every 2 seconds.
- Interactive before-and-after image slider with range slider scrubbing between original (left) and styled (right).
- Amber notice display for warnings, quality alert for poor/fair results.
- Restyle controls (Photo type, Hanger, Background) with "Restyle with Options" button.
- Three choices:
  1. *"Use styled + keep original"* (default; styled first, original second).
  2. *"Use original only"* (automatic default if `meta.quality === 'poor'`).
  3. *"Remove photo"*.
- Drag-and-drop thumbnail strip for reordering gallery items, with "Styled", "Original", and "★ Main photo" badges.
- Offline banner when `isAvailable()` is false, allowing normal product saving with original photos.
- Dashboard Photo Styling status widget showing active/queued counts, average styling time, and quick retry for failed jobs.

### Storefront Integration
- `product.ejs` & `product-card.ejs`:
  - Cards use the styled photo as primary image, and original photo for hover crossfade.
  - PDP sticky gallery orders styled first, original second, with a clear `"Original photo"` badge on thumbnail.
  - If only original photos exist, they are displayed without empty frames.
  - Full compatibility with existing sample products.

---

## 2. Test Results

### 1. Python Pytest Suite (`services/stylist/tests/`)
```
12 passed, 1 warning in 6.77s
```

### 2. Node Automated Test Suite (`tests/stylist/`)
Ran all 15 tests across unit, integration, security, and E2E:
```
✔ Unit 1: PhotoJob state transitions (queued -> processing -> done / failed) (41.8ms)
✔ Unit 2: Restart recovery - jobs stuck in processing > 5 min are reset to queued (8.5ms)
✔ Unit 3: Options validation and restyle reset (7.1ms)
✔ Unit 4: Migration of legacy string images to object structure (6.9ms)
✔ Unit 5: Magic bytes validation strictly accepts JPEG/PNG/WebP/HEIC and rejects others (0.2ms)
✔ Integration 1: Upload creates a job and worker finishes it with srcset variants (343.2ms)
✔ Integration 2: Product gallery has styled first and original second for "both", or original only (9.0ms)
✔ Integration 3: Stylist offline - photos are still saved as originals and product can be saved (9.0ms)
✔ Security 1: Non-admin requests to stylist routes are blocked and redirect to login (84.9ms)
✔ Security 2: File content inspection rejects renamed text or malicious files (0.2ms)
✔ Security 3: docker-compose.yml configuration ensures stylist port 8001 is not exposed publicly (0.2ms)
✔ Security 4: STYLIST_KEY and raw image binary data are never leaked in client responses (6.9ms)
✔ E2E 1: Fixtures testing with real Python pipeline (flat, hanging, worn) (23.9s)
✔ E2E 2: Uploading a text file renamed .jpg is strictly rejected (0.5ms)
✔ E2E 3: Product page displays styled image first and original photo second with label (81.1ms)

Total: 15 passed, 0 failed (24.9s duration)
```

---

## 3. Assumptions & Notes

1. **Host Capacity:** Minimum 2 GB RAM is required for running the Python ONNX service. On hosts with <= 1 GB, memory arena spikes can trigger OS OOM killer.
2. **First Run Cold Start:** The first time `style_photo` executes on a new machine or container, `rembg` fetches model weights (`~350 MB`) from GitHub releases into `~/.rembg/models/` and `~/.u2net/`. Subsequent executions run in ~6 seconds.
3. **No External Image Transmission:** Strictly adheres to the rule that no photo leaves the local server. No third-party APIs (Cloudinary AI, Remove.bg, etc.) are called.
4. **Business Rules Preserved:** Prepaid orders only, no returns or size changes, flat ₹60 shipping, WhatsApp support.

---

## 4. How to Repeat Tests

```bash
# 1. Run Python service tests
cd services/stylist
./.venv/Scripts/python -m pytest -q tests

# 2. Run Node unit, integration, security and E2E tests
cd ../..
node --test tests/stylist/*.test.js
```

