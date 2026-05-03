'use strict';

function normalizeUsernameForDb(username) {
	return String(username || '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '_');
}

function buildUserDbName(username, phone) {
	const p = String(phone || '').trim();
	return `${normalizeUsernameForDb(username)}_${p}`;
}

function canonicalUserDbName(raw) {
	if (raw == null || raw === '') return '';
	const s = String(raw).trim();
	const match = s.match(/^(.+)_(\d+)$/);
	if (!match) return s.toLowerCase();
	const userPart = match[1].replace(/_/g, ' ');
	return `${normalizeUsernameForDb(userPart)}_${match[2]}`;
}

module.exports = { buildUserDbName, canonicalUserDbName };
