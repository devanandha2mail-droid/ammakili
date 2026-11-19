const mongoose = require('mongoose');
const Product = require('../models/Product');

let sampleProductsCache = null;

function getSampleProducts() {
  if (!sampleProductsCache) {
    try {
      const list = require('../../tests/fixtures/test-products.json');
      sampleProductsCache = list.map((item, idx) => {
        const hexId = '6600000000000000000000' + (idx + 1).toString(16).padStart(2, '0');
        const docData = {
          _id: new mongoose.Types.ObjectId(hexId),
          ...item
        };
        return new Product(docData);
      });
    } catch (e) {
      sampleProductsCache = [];
    }
  }
  return sampleProductsCache;
}

module.exports = { getSampleProducts };
