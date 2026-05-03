const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { buildUserDbName } = require('../utils/userDbName');

const router = express.Router();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://Ojram:453471spvcars@ojrambasket.caraknd.mongodb.net/?retryWrites=true&w=majority&appName=OjramBasket';
const BASKET_DB = 'Basket';

if (!mongoose.connection.readyState) {
	mongoose.connect(MONGODB_URI, { dbName: BASKET_DB });
}
mongoose.connection.once('open', () => {
	ensureUserUniqueIndexes().catch((err) => {
		console.warn('Index setup failed:', err.message);
	});
});
if (mongoose.connection.readyState === 1) {
	ensureUserUniqueIndexes().catch((err) => {
		console.warn('Index setup failed:', err.message);
	});
}

const userSchema = new mongoose.Schema({
	username: { type: String, required: true, trim: true },
	phone: { type: String, required: true, unique: true, trim: true },
	email: { type: String, trim: true },
	emailLower: { type: String, sparse: true, unique: true, trim: true },
	passwordHash: { type: String },
	role: { type: String, default: 'user' },
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model('User', userSchema, 'users');

async function ensureUserUniqueIndexes() {
	try {
		await User.collection.dropIndex('username_1');
	} catch (err) {
		if (err.codeName !== 'IndexNotFound') {
			console.warn('Could not drop username index:', err.message);
		}
	}
	await User.collection.createIndex({ phone: 1 }, { unique: true });
	await User.collection.createIndex({ emailLower: 1 }, { unique: true, sparse: true });
}

const BCRYPT_ROUNDS = 10;

function normalizeEmail(email) {
	return String(email || '').trim().toLowerCase();
}

function randomPassword() {
	const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	let s = '';
	for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
	return s;
}

function getMailer() {
	const host = process.env.SMTP_HOST;
	if (!host) return null;
	const passRaw = process.env.SMTP_PASS || '';
	const pass = passRaw.replace(/\s+/g, '');
	return nodemailer.createTransport({
		host,
		port: Number(process.env.SMTP_PORT || 587),
		secure: process.env.SMTP_SECURE === 'true',
		auth:
			process.env.SMTP_USER && pass
				? { user: process.env.SMTP_USER.trim(), pass }
				: undefined
	});
}

/** Non-null string = reason SMTP is not usable; null = OK to attempt send. */
function smtpConfigError() {
	const host = (process.env.SMTP_HOST || '').trim();
	if (!host) {
		return 'Set SMTP_HOST (and SMTP_USER, SMTP_PASS) in your .env file.';
	}
	const lower = host.toLowerCase();
	if (
		lower === 'smtp.example.com' ||
		lower === 'example.com' ||
		lower === 'localhost' ||
		lower === 'smtp.local'
	) {
		return 'Set SMTP_HOST=smtp.gmail.com (or your provider’s SMTP). The value smtp.example.com is only a documentation placeholder.';
	}
	const user = (process.env.SMTP_USER || '').trim();
	const pass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
	if (!user || !pass) {
		return 'Set SMTP_USER and SMTP_PASS in .env (your mailbox login and password or app password).';
	}
	const u = user.toLowerCase();
	if (u.includes('your.full.email') || u === 'your_smtp_user' || u.startsWith('your.')) {
		return 'Replace SMTP_USER with your real Gmail address (the full address you use to sign in to Google).';
	}
	const passLower = pass.toLowerCase();
	if (
		passLower.includes('your_16_char') ||
		passLower.includes('your_smtp_password') ||
		pass === 'your_smtp_password'
	) {
		return 'Replace SMTP_PASS with a real Google App Password from Google Account → Security → App passwords (not the placeholder text).';
	}
	return null;
}

async function sendCredentialsEmail(to, username, plainPassword) {
	const transporter = getMailer();
	if (!transporter) {
		throw new Error('SMTP is not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS in .env)');
	}
	const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@localhost';
	const subject = process.env.APP_NAME || 'VV Farms — your login details';
	const text = `Hello,\n\nYou requested a password reset for your account.\n\nUsername: ${username}\nNew password: ${plainPassword}\n\nPlease sign in and change your password if you wish.\n\n— ${process.env.APP_NAME || 'VV Farms'}`;

	await transporter.sendMail({
		from,
		to,
		subject,
		text
	});
}

async function ensureUserCollections(client, userDbName, username, phone) {
	const now = new Date();
	const userDb = client.db(userDbName);
	const profileCol = userDb.collection('profile');
	const profile = await profileCol.findOne({ userId: userDbName });
	if (!profile) {
		await profileCol.insertOne({ userId: userDbName, username, phone, createdAt: now, updatedAt: now });
	}
	await userDb.createCollection('cart').catch(() => {});
	await userDb.createCollection('favorites').catch(() => {});
}

// POST /api/user/register
router.post('/register', async (req, res) => {
	try {
		const username = String(req.body.username || '').trim();
		const password = String(req.body.password || '');
		const email = String(req.body.email || '').trim();
		const phone = String(req.body.phone || '').trim();

		if (!username || !password || !email || !phone) {
			return res.status(400).json({ error: 'Username, password, email, and phone are required' });
		}
		if (!/^[A-Za-z\s]+$/.test(username)) {
			return res.status(400).json({ error: 'Username must contain letters and spaces only' });
		}
		if (password.length < 8) {
			return res.status(400).json({ error: 'Password must be at least 8 characters' });
		}
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return res.status(400).json({ error: 'Invalid email address' });
		}
		if (!/^\d+$/.test(phone)) {
			return res.status(400).json({ error: 'Phone must be digits only' });
		}

		const emailLower = normalizeEmail(email);
		const exists = await User.findOne({
			$or: [{ phone }, { emailLower }]
		});
		if (exists) {
			if (exists.phone === phone) {
				return res.status(409).json({ error: 'Phone number already registered' });
			}
			if (exists.emailLower === emailLower) {
				return res.status(409).json({ error: 'Email already registered' });
			}
		}

		const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
		const now = new Date();
		await User.create({
			username,
			phone,
			email,
			emailLower,
			passwordHash,
			role: 'user',
			createdAt: now,
			updatedAt: now
		});

		return res.status(201).json({ message: 'Account created. You can sign in now.' });
	} catch (err) {
		console.error('Register error:', err);
		if (err.code === 11000) {
			return res.status(409).json({ error: 'Email or phone already in use' });
		}
		return res.status(500).json({ error: 'Registration failed', details: err.message });
	}
});

// POST /api/user/login
router.post('/login', async (req, res) => {
	try {
		const username = String(req.body.username || '').trim();
		const password = String(req.body.password || '');

		if (!username || !password) {
			return res.status(400).json({ error: 'Username and password are required' });
		}

		const adminPass = process.env.ADMIN_PASSWORD || 'vajra123';
		if (username === 'vajra' && password === adminPass) {
			return res.json({ role: 'admin', redirect: '/pages/admin.html' });
		}

		if (!/^[A-Za-z\s]+$/.test(username)) {
			return res.status(400).json({ error: 'Invalid username' });
		}

		const users = await User.find({ username }).sort({ createdAt: 1 }).lean();
		if (!users.length) {
			return res.status(401).json({ error: 'Wrong username or password' });
		}

		let user = null;
		for (const candidate of users) {
			if (!candidate.passwordHash) continue;
			const ok = await bcrypt.compare(password, candidate.passwordHash);
			if (ok) {
				user = candidate;
				break;
			}
		}
		if (!user) {
			return res.status(401).json({ error: 'Wrong username or password' });
		}

		const client = mongoose.connection.getClient();
		const userDbName = buildUserDbName(user.username, user.phone);
		await ensureUserCollections(client, userDbName, user.username, user.phone);

		await User.updateOne({ _id: user._id }, { $set: { updatedAt: new Date() } });

		return res.json({ role: 'user', userDbName, redirect: '/pages/home.html' });
	} catch (err) {
		console.error('User login error:', err);
		return res.status(500).json({ error: 'Internal server error' });
	}
});

// POST /api/user/forgot-password
router.post('/forgot-password', async (req, res) => {
	try {
		const emailLower = normalizeEmail(req.body.email);
		if (!emailLower || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
			return res.status(400).json({ error: 'Valid email is required' });
		}

		const user = await User.findOne({ emailLower });
		const generic = { message: 'If this email is registered, you will receive login details shortly.' };

		if (user) {
			const cfgErr = smtpConfigError();
			if (cfgErr) {
				return res.status(503).json({
					error: 'Email is not configured on the server',
					details: cfgErr
				});
			}

			const newPass = randomPassword();
			const recipient = user.email || emailLower;
			try {
				await sendCredentialsEmail(recipient, user.username, newPass);
			} catch (mailErr) {
				console.error('Forgot password email failed:', mailErr);
				let hint = mailErr.message || 'Unknown error';
				if (mailErr.code === 'EDNS' || mailErr.code === 'ENOTFOUND') {
					hint = `Cannot reach mail server "${process.env.SMTP_HOST}". Check SMTP_HOST spelling and your internet connection.`;
				}
				return res.status(503).json({
					error: 'Could not send email',
					details: hint
				});
			}

			const passwordHash = await bcrypt.hash(newPass, BCRYPT_ROUNDS);
			await User.updateOne(
				{ _id: user._id },
				{ $set: { passwordHash, updatedAt: new Date() } }
			);
		}

		return res.json(generic);
	} catch (err) {
		console.error('Forgot password error:', err);
		return res.status(500).json({
			error: 'Could not send email',
			details: err.message
		});
	}
});

module.exports = router;
