const mongoose = require('mongoose');

/**
 * Migrates existing products in MongoDB with string images or missing kind field
 * to { url, kind: 'extra' } without losing any images.
 */
async function migrateProductImages() {
  try {
    const collection = mongoose.connection.collection('products');
    const docs = await collection.find({ images: { $exists: true, $ne: [] } }).toArray();
    let count = 0;

    for (const doc of docs) {
      if (!doc.images || !Array.isArray(doc.images)) continue;
      let changed = false;

      const newImages = doc.images.map(img => {
        if (typeof img === 'string') {
          changed = true;
          return { url: img, kind: 'extra', sourceId: '', meta: {} };
        }
        if (typeof img === 'object' && img !== null && !img.kind) {
          changed = true;
          return {
            url: img.url || '',
            kind: 'extra',
            sourceId: img.sourceId || '',
            width: img.width,
            height: img.height,
            meta: img.meta || {}
          };
        }
        return img;
      });

      if (changed) {
        await collection.updateOne({ _id: doc._id }, { $set: { images: newImages } });
        count++;
      }
    }

    if (count > 0) {
      console.log(`[Migration] Migrated images for ${count} product(s) to object structure.`);
    }
    return count;
  } catch (err) {
    console.error('[Migration] Failed to migrate product images:', err.message);
    return 0;
  }
}

module.exports = {
  migrateProductImages
};
