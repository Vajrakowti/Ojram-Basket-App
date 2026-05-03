'use strict';

const mongoose = require('mongoose');

const LOGO_DB = 'logo';

function logoDb() {
	return mongoose.connection.getClient().db(LOGO_DB);
}

const defaults = {
	appName: 'VV Farms',
	splash: {
		logoUrl: '/Logo.jpg',
		durationSec: 3.5,
		backgroundColor: '#0f241c',
		subtitle: 'Fresh meat & curries',
		titleColor: '#d4af37',
		titleFontSize: '34px',
		subtitleColor: '#e8dcc4',
		subtitleFontSize: '14px',
		subtitleOpacity: 0.72
	},
	getStarted: {
		logoUrl: '/Logo.jpg',
		tagline:
			'Order fresh pork, chicken & mutton — raw cuts and ready curries — delivered to your door.',
		backgroundColor: '#f6f7f4',
		backgroundImageUrl: '',
		titleColor: '#1a2b23',
		titleFontSize: '26px',
		taglineColor: '#2d6a4f',
		taglineFontSize: '15px'
	},
	auth: {
		logoUrl: '/Logo.jpg',
		pageBackground: '#eef1ee',
		buttonBg: '#2d6a4f',
		buttonText: '#ffffff',
		tabActiveColor: '#1a4d3a',
		linkColor: '#2d6a4f',
		cardBg: 'rgba(255,255,255,0.94)',
		brandTitleColor: '#1a4d3a',
		brandTitleFontSize: '17px',
		labelColor: '#5c6b63',
		labelFontSize: '13px'
	},
	header: {
		logoUrl: '/Logo.jpg'
	}
};

async function getSection(collectionName) {
	const col = logoDb().collection(collectionName);
	const doc = await col.findOne({ _id: 'config' });
	return doc ? { ...doc } : null;
}

function deepMerge(base, patch) {
	if (!patch || typeof patch !== 'object') return base;
	const out = { ...base };
	for (const k of Object.keys(patch)) {
		if (k === '_id' || k === 'updatedAt') continue;
		const v = patch[k];
		if (v !== undefined && v !== null && v !== '') {
			if (typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object' && base[k] !== null) {
				out[k] = deepMerge(base[k], v);
			} else {
				out[k] = v;
			}
		}
	}
	return out;
}

async function mergeBranding() {
	const [splashDoc, gsDoc, authDoc, headerDoc, appDoc] = await Promise.all([
		getSection('splash'),
		getSection('get_started'),
		getSection('auth_theme'),
		getSection('header'),
		getSection('app_meta')
	]);

	const appName = (appDoc && appDoc.appName) || defaults.appName;

	const splash = deepMerge(defaults.splash, splashDoc);
	const getStarted = deepMerge(defaults.getStarted, gsDoc);
	const auth = deepMerge(defaults.auth, authDoc);
	const header = deepMerge(defaults.header, headerDoc);

	delete splash._id;
	delete getStarted._id;
	delete auth._id;
	delete header._id;

	const durationSec = Math.min(15, Math.max(1, Number(splash.durationSec) || defaults.splash.durationSec));

	return {
		appName,
		splash: { ...splash, durationSec },
		getStarted,
		auth,
		header
	};
}

async function saveSection(collectionName, payload) {
	const col = logoDb().collection(collectionName);
	const { _id, ...rest } = payload;
	await col.replaceOne(
		{ _id: 'config' },
		{ _id: 'config', ...rest, updatedAt: new Date() },
		{ upsert: true }
	);
}

module.exports = {
	LOGO_DB,
	defaults,
	getSection,
	mergeBranding,
	saveSection,
	deepMerge
};
