'use strict';

const cloudinary = require('cloudinary').v2;

function ensureConfig() {
	const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
	if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
		throw new Error('Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env');
	}
	cloudinary.config({
		cloud_name: CLOUDINARY_CLOUD_NAME,
		api_key: CLOUDINARY_API_KEY,
		api_secret: CLOUDINARY_API_SECRET
	});
}

/**
 * @param {Buffer} buffer
 * @param {{ folder?: string, mimeType?: string }} options
 * @returns {Promise<{ secure_url: string, public_id: string }>}
 */
function uploadBuffer(buffer, options = {}) {
	ensureConfig();
	const { folder, mimeType, ...rest } = options;
	const mt = mimeType && String(mimeType).trim() ? mimeType : 'image/jpeg';
	const dataUri = `data:${mt};base64,${buffer.toString('base64')}`;
	const uploadOpts = { folder: folder || 'vajram', resource_type: 'image', ...rest };
	return new Promise((resolve, reject) => {
		cloudinary.uploader.upload(dataUri, uploadOpts, (err, result) => {
			if (err) reject(err);
			else resolve(result);
		});
	});
}

/** Derive public_id from a Cloudinary HTTPS URL for destroy(). */
function publicIdFromSecureUrl(url) {
	if (!url || typeof url !== 'string') return null;
	if (!url.includes('res.cloudinary.com')) return null;
	try {
		const noQuery = url.split('?')[0];
		const parts = noQuery.split('/upload/');
		if (parts.length < 2) return null;
		let tail = parts[1].replace(/^v\d+\//, '');
		const dot = tail.lastIndexOf('.');
		if (dot > 0) tail = tail.slice(0, dot);
		return tail || null;
	} catch {
		return null;
	}
}

function destroyIfCloudinaryUrl(url) {
	const pid = publicIdFromSecureUrl(url);
	if (!pid) return Promise.resolve();
	ensureConfig();
	return new Promise((resolve) => {
		cloudinary.uploader.destroy(pid, (err) => {
			if (err) console.warn('Cloudinary destroy failed:', pid, err.message || err);
			resolve();
		});
	});
}

module.exports = { uploadBuffer, publicIdFromSecureUrl, destroyIfCloudinaryUrl };
