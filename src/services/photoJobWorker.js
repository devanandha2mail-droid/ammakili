const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const PhotoJob = require('../models/PhotoJob');
const photoStylist = require('./photoStylist');

let pollInterval = null;
let isProcessing = false;

const STYLIST_UPLOADS_DIR = path.join(__dirname, '../../public/uploads/stylist');
if (!fs.existsSync(STYLIST_UPLOADS_DIR)) {
  fs.mkdirSync(STYLIST_UPLOADS_DIR, { recursive: true });
}

/**
 * On startup, any job left in processing for > 5 minutes is reset to queued.
 */
async function recoverStuckJobs() {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const result = await PhotoJob.updateMany(
      {
        status: 'processing',
        $or: [
          { startedAt: { $lt: fiveMinutesAgo } },
          { startedAt: null }
        ]
      },
      {
        $set: {
          status: 'queued',
          error: 'Recovered after process restart or timeout',
          startedAt: null
        }
      }
    );
    if (result.modifiedCount > 0) {
      console.log(`[PhotoJobWorker] Recovered ${result.modifiedCount} stuck job(s) back to queued.`);
    }
  } catch (err) {
    console.error('[PhotoJobWorker] Error recovering stuck jobs:', err.message);
  }
}

/**
 * Processes a single photo styling job.
 */
async function processJob(job) {
  try {
    if (!fs.existsSync(job.sourceKey)) {
      throw new Error(`Source photo missing at ${job.sourceKey}`);
    }

    // Check if stylist microservice is reachable
    const available = await photoStylist.isAvailable(3000);
    if (!available) {
      // Keep in queued state until the service comes back online
      job.status = 'queued';
      job.startedAt = null;
      await job.save();
      return;
    }

    const sourceBuffer = fs.readFileSync(job.sourceKey);
    const { buffer: styledBuffer, meta } = await photoStylist.styleImage(sourceBuffer, job.options || {});

    const styled_ok = meta.styled_ok !== false;
    const mode_used = meta.mode_used || job.options?.mode || 'flat';

    job.styled_ok = styled_ok;
    job.mode_used = mode_used;
    job.meta = { ...(job.meta || {}), ...meta };

    // If styled_ok is false: do NOT create a styled image. Keep only original.
    // Store the returned plain 4:5 crop as a detail image.
    if (!styled_ok) {
      const detailFileName = `detail-${job._id}.webp`;
      const detailFilePath = path.join(STYLIST_UPLOADS_DIR, detailFileName);
      const detailUrl = `/uploads/stylist/${detailFileName}`;

      if (styledBuffer && styledBuffer.length > 0) {
        await sharp(styledBuffer)
          .webp({ quality: 88 })
          .toFile(detailFilePath);
        job.detailKey = detailUrl;
      }

      job.status = 'done';
      job.resultKey = null; // NEVER create or assign styled image
      job.variants = {};
      job.finishedAt = new Date();
      job.error = null;
      await job.save();

      console.log(`[PhotoJobWorker] Job ${job._id} saved as detail photo only (mode=${mode_used}, styled_ok=false).`);
      return;
    }

    // Save full styled result (1200x1500 WebP)
    const resultFileName = `styled-${job._id}.webp`;
    const resultFilePath = path.join(STYLIST_UPLOADS_DIR, resultFileName);
    const resultUrl = `/uploads/stylist/${resultFileName}`;

    await sharp(styledBuffer)
      .webp({ quality: 90 })
      .toFile(resultFilePath);

    // Generate srcset variants: 400w, 800w, 1200w (without enlargement)
    const v400Name = `styled-${job._id}-400w.webp`;
    const v800Name = `styled-${job._id}-800w.webp`;
    const v1200Name = `styled-${job._id}-1200w.webp`;

    await sharp(styledBuffer)
      .resize({ width: 400, height: 500, fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(path.join(STYLIST_UPLOADS_DIR, v400Name));

    await sharp(styledBuffer)
      .resize({ width: 800, height: 1000, fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(path.join(STYLIST_UPLOADS_DIR, v800Name));

    // 1200w can copy/link or save with quality 85
    await sharp(styledBuffer)
      .resize({ width: 1200, height: 1500, fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(path.join(STYLIST_UPLOADS_DIR, v1200Name));

    const variants = {
      '400': `/uploads/stylist/${v400Name}`,
      '800': `/uploads/stylist/${v800Name}`,
      '1200': `/uploads/stylist/${v1200Name}`
    };

    job.status = 'done';
    job.resultKey = resultUrl;
    job.variants = variants;
    job.finishedAt = new Date();
    job.error = null;
    await job.save();

    console.log(`[PhotoJobWorker] Job ${job._id} completed successfully (quality=${meta.quality}, time=${meta.seconds}s).`);
  } catch (err) {
    console.error(`[PhotoJobWorker] Job ${job._id} failed:`, err.message);
    job.status = 'failed';
    job.error = err.message || 'Styling failed';
    job.finishedAt = new Date();
    await job.save();
  }
}

/**
 * Polls MongoDB and runs ONE job at a time.
 */
async function pollQueue() {
  if (isProcessing) return;

  try {
    const job = await PhotoJob.findOneAndUpdate(
      { status: 'queued' },
      { $set: { status: 'processing', startedAt: new Date() } },
      { sort: { createdAt: 1 }, new: true }
    );

    if (!job) return;

    isProcessing = true;
    await processJob(job);
  } catch (err) {
    console.error('[PhotoJobWorker] Error in pollQueue:', err.message);
  } finally {
    isProcessing = false;
  }
}

/**
 * Starts the worker polling every 2 seconds.
 */
function startWorker() {
  if (pollInterval) return;
  recoverStuckJobs().catch(() => {});
  pollInterval = setInterval(pollQueue, 2000);
  console.log('[PhotoJobWorker] Worker started (polling every 2s, 1 job at a time).');
}

/**
 * Stops the worker polling.
 */
function stopWorker() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

/**
 * Retry or restyle a job.
 */
async function retryJob(jobId, newOptions = null) {
  const job = await PhotoJob.findById(jobId);
  if (!job) throw new Error('Job not found');

  if (newOptions) {
    job.options = {
      mode: newOptions.mode || job.options.mode || 'auto',
      hanger: newOptions.hanger || job.options.hanger || 'auto',
      background: newOptions.background || job.options.background || 'pink'
    };
  }

  job.status = 'queued';
  job.error = null;
  job.startedAt = null;
  job.finishedAt = null;
  await job.save();
  return job;
}

/**
 * Deletes all files on disk associated with a job.
 */
function deleteJobFiles(job) {
  if (!job) return;
  try {
    if (job.sourceKey && fs.existsSync(job.sourceKey)) {
      fs.unlinkSync(job.sourceKey);
    }
  } catch {}

  const deletePublicPath = (relPath) => {
    if (!relPath) return;
    try {
      const full = path.join(__dirname, '../../public', relPath);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    } catch {}
  };

  deletePublicPath(job.originalUrl);
  deletePublicPath(job.resultKey);
  deletePublicPath(job.detailKey);
  if (job.variants) {
    Object.values(job.variants).forEach(deletePublicPath);
  }
}

/**
 * Get dashboard stats for photo styling.
 */
async function getStylistStats() {
  try {
    const [queued, failed, processing, doneRecent] = await Promise.all([
      PhotoJob.countDocuments({ status: 'queued' }),
      PhotoJob.countDocuments({ status: 'failed' }),
      PhotoJob.countDocuments({ status: 'processing' }),
      PhotoJob.find({ status: 'done' }).sort({ finishedAt: -1 }).limit(20).lean()
    ]);

    let avgSeconds = 0;
    if (doneRecent.length > 0) {
      const totalSec = doneRecent.reduce((sum, j) => {
        const sec = (j.meta && j.meta.seconds) ||
          (j.finishedAt && j.startedAt ? (new Date(j.finishedAt) - new Date(j.startedAt)) / 1000 : 0);
        return sum + Number(sec || 0);
      }, 0);
      avgSeconds = Math.round((totalSec / doneRecent.length) * 10) / 10;
    }

    const available = await photoStylist.isAvailable(2000);

    return {
      available,
      queued,
      failed,
      processing,
      avgSeconds: avgSeconds || 15
    };
  } catch (err) {
    return {
      available: false,
      queued: 0,
      failed: 0,
      processing: 0,
      avgSeconds: 15
    };
  }
}

module.exports = {
  startWorker,
  stopWorker,
  recoverStuckJobs,
  processJob,
  pollQueue,
  retryJob,
  deleteJobFiles,
  getStylistStats,
  STYLIST_UPLOADS_DIR
};

