const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

// robots.txt
router.get('/robots.txt', (req, res) => {
  const siteUrl = process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
  const robots = `User-agent: *
Disallow: /admin/
Disallow: /admin/*
Disallow: /checkout/
Disallow: /checkout/*
Disallow: /webhooks/

Sitemap: ${siteUrl}/sitemap.xml
`;
  res.type('text/plain');
  res.send(robots);
});

// sitemap.xml
router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const mongoose = require('mongoose');
    const siteUrl = process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
    let products = [];
    if (mongoose.connection.readyState === 1) {
      products = await Product.find({ active: true }).select('slug updatedAt');
    } else {
      try {
        const sampleList = require('../../tests/fixtures/test-products.json');
        products = sampleList.map(p => ({ slug: p.slug, updatedAt: new Date() }));
      } catch (e) {
        products = [];
      }
    }

    const staticPages = [
      '',
      '/shop',
      '/sizes',
      '/how-to-order',
      '/about',
      '/contact',
      '/pricing',
      '/shipping',
      '/terms',
      '/privacy',
      '/refund-policy',
      '/grievance',
      '/policies',
      '/faq'
    ];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

    staticPages.forEach(page => {
      xml += `
  <url>
    <loc>${siteUrl}${page}</loc>
    <changefreq>daily</changefreq>
    <priority>${page === '' ? '1.0' : '0.8'}</priority>
  </url>`;
    });

    products.forEach(p => {
      xml += `
  <url>
    <loc>${siteUrl}/product/${p.slug}</loc>
    <lastmod>${p.updatedAt.toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`;
    });

    xml += `
</urlset>`;

    res.type('application/xml');
    res.send(xml);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

