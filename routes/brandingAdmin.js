'use strict';

const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const path = require('path');
const { uploadBuffer, destroyIfCloudinaryUrl } = require('../utils/cloudinaryUpload');
const { getSection, saveSection, defaults, mergeBranding } = require('../utils/brandingStore');

const router = express.Router();

const memoryUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 8 * 1024 * 1024 }
});

const MONGODB_URI = process.env.MONGODB_URI || '';
const dbName = 'Basket';
if (!mongoose.connection.readyState) {
	mongoose.connect(MONGODB_URI, { dbName });
}

async function uploadBrandImage(buffer, mimetype, subfolder, originalname) {
	const base = `${Date.now()}-${path.basename(originalname, path.extname(originalname))}`.replace(/[^\w.-]/g, '_');
	const uploaded = await uploadBuffer(buffer, {
		folder: `vajram/branding/${subfolder}`,
		mimeType: mimetype,
		public_id: base
	});
	return uploaded.secure_url;
}

function normalizePx(raw, fallback) {
	const val = String(raw || '').trim();
	if (!val) return fallback;
	if (/^\d+(\.\d+)?px$/i.test(val)) return val.toLowerCase();
	if (/^\d+(\.\d+)?$/.test(val)) return `${val}px`;
	return fallback;
}

// GET /api/admin/branding — current config for admin forms
router.get('/', async (req, res) => {
	try {
		const data = await mergeBranding();
		res.json(data);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

router.post('/splash', memoryUpload.single('logo'), async (req, res) => {
	try {
		const prev = await getSection('splash');
		const dRaw = parseFloat(req.body.durationSec);
		const durationSec = Math.min(
			15,
			Math.max(1, Number.isFinite(dRaw) ? dRaw : defaults.splash.durationSec)
		);
		const backgroundColor = (req.body.backgroundColor || defaults.splash.backgroundColor).trim();
		let subtitle = String(req.body.subtitle ?? '').trim();
		if (!subtitle) subtitle = prev?.subtitle || defaults.splash.subtitle;
		const titleColor = (req.body.titleColor || prev?.titleColor || defaults.splash.titleColor).trim();
		const titleFontSize = normalizePx(
			req.body.titleFontSize,
			prev?.titleFontSize || defaults.splash.titleFontSize
		);
		const subtitleColor = (req.body.subtitleColor || prev?.subtitleColor || defaults.splash.subtitleColor).trim();
		const subtitleFontSize = normalizePx(
			req.body.subtitleFontSize,
			prev?.subtitleFontSize || defaults.splash.subtitleFontSize
		);
		let subtitleOpacity = prev?.subtitleOpacity ?? defaults.splash.subtitleOpacity;
		if (req.body.subtitleOpacity !== undefined && req.body.subtitleOpacity !== '') {
			const so = parseFloat(req.body.subtitleOpacity);
			if (Number.isFinite(so)) subtitleOpacity = Math.min(1, Math.max(0, so));
		}

		let logoUrl = prev?.logoUrl || defaults.splash.logoUrl;
		if (req.file) {
			logoUrl = await uploadBrandImage(req.file.buffer, req.file.mimetype, 'splash', req.file.originalname);
			await destroyIfCloudinaryUrl(prev?.logoUrl);
		}

		await saveSection('splash', {
			logoUrl,
			durationSec,
			backgroundColor,
			subtitle,
			titleColor,
			titleFontSize,
			subtitleColor,
			subtitleFontSize,
			subtitleOpacity
		});
		res.json({
			ok: true,
			logoUrl,
			durationSec,
			backgroundColor,
			subtitle,
			titleColor,
			titleFontSize,
			subtitleColor,
			subtitleFontSize,
			subtitleOpacity
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/get-started', memoryUpload.fields([{ name: 'logo', maxCount: 1 }, { name: 'background', maxCount: 1 }]), async (req, res) => {
	try {
		const prev = await getSection('get_started');
		const tagline = (req.body.tagline || defaults.getStarted.tagline).trim();
		const backgroundColor = (req.body.backgroundColor || defaults.getStarted.backgroundColor).trim();
		const titleColor = (req.body.titleColor || prev?.titleColor || defaults.getStarted.titleColor).trim();
		const titleFontSize = normalizePx(
			req.body.titleFontSize,
			prev?.titleFontSize || defaults.getStarted.titleFontSize
		);
		const taglineColor = (req.body.taglineColor || prev?.taglineColor || defaults.getStarted.taglineColor).trim();
		const taglineFontSize = normalizePx(
			req.body.taglineFontSize,
			prev?.taglineFontSize || defaults.getStarted.taglineFontSize
		);

		let logoUrl = prev?.logoUrl || defaults.getStarted.logoUrl;
		let backgroundImageUrl = prev?.backgroundImageUrl || '';

		const files = req.files || {};
		const logoFile = files.logo && files.logo[0];
		const bgFile = files.background && files.background[0];

		if (logoFile) {
			logoUrl = await uploadBrandImage(logoFile.buffer, logoFile.mimetype, 'get_started', logoFile.originalname);
			await destroyIfCloudinaryUrl(prev?.logoUrl);
		}
		if (bgFile) {
			backgroundImageUrl = await uploadBrandImage(bgFile.buffer, bgFile.mimetype, 'get_started_bg', bgFile.originalname);
			await destroyIfCloudinaryUrl(prev?.backgroundImageUrl);
		}

		await saveSection('get_started', {
			logoUrl,
			tagline,
			backgroundColor,
			backgroundImageUrl,
			titleColor,
			titleFontSize,
			taglineColor,
			taglineFontSize
		});
		res.json({
			ok: true,
			logoUrl,
			tagline,
			backgroundColor,
			backgroundImageUrl,
			titleColor,
			titleFontSize,
			taglineColor,
			taglineFontSize
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/auth', memoryUpload.single('logo'), async (req, res) => {
	try {
		const prev = await getSection('auth_theme');
		const body = req.body;

		let logoUrl = prev?.logoUrl || defaults.auth.logoUrl;
		if (req.file) {
			logoUrl = await uploadBrandImage(req.file.buffer, req.file.mimetype, 'auth', req.file.originalname);
			await destroyIfCloudinaryUrl(prev?.logoUrl);
		}

		const auth = {
			logoUrl,
			pageBackground: (body.pageBackground || prev?.pageBackground || defaults.auth.pageBackground).trim(),
			buttonBg: (body.buttonBg || prev?.buttonBg || defaults.auth.buttonBg).trim(),
			buttonText: (body.buttonText || prev?.buttonText || defaults.auth.buttonText).trim(),
			tabActiveColor: (body.tabActiveColor || prev?.tabActiveColor || defaults.auth.tabActiveColor).trim(),
			linkColor: (body.linkColor || prev?.linkColor || defaults.auth.linkColor).trim(),
			cardBg: (body.cardBg || prev?.cardBg || defaults.auth.cardBg).trim(),
			brandTitleColor: (body.brandTitleColor || prev?.brandTitleColor || defaults.auth.brandTitleColor).trim(),
			brandTitleFontSize: normalizePx(
				body.brandTitleFontSize,
				prev?.brandTitleFontSize || defaults.auth.brandTitleFontSize
			),
			labelColor: (body.labelColor || prev?.labelColor || defaults.auth.labelColor).trim(),
			labelFontSize: normalizePx(
				body.labelFontSize,
				prev?.labelFontSize || defaults.auth.labelFontSize
			)
		};

		await saveSection('auth_theme', auth);
		res.json({ ok: true, ...auth });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/header', memoryUpload.single('logo'), async (req, res) => {
	try {
		const prev = await getSection('header');
		let logoUrl = prev?.logoUrl || defaults.header.logoUrl;
		if (req.file) {
			logoUrl = await uploadBrandImage(req.file.buffer, req.file.mimetype, 'header', req.file.originalname);
			await destroyIfCloudinaryUrl(prev?.logoUrl);
		}
		await saveSection('header', { logoUrl });
		res.json({ ok: true, logoUrl });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/app-name', express.json(), async (req, res) => {
	try {
		const appName = String(req.body.appName || '').trim() || defaults.appName;
		await saveSection('app_meta', { appName });
		res.json({ ok: true, appName });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

module.exports = router;
