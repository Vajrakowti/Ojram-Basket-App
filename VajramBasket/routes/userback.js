const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://Ojram:453471spvcars@ojrambasket.caraknd.mongodb.net/?retryWrites=true&w=majority&appName=OjramBasket';
const BASKET_DB = 'Basket';

// Reuse global connection; ensure connected to Basket
if (!mongoose.connection.readyState) {
	mongoose.connect(MONGODB_URI, { dbName: BASKET_DB });
}

// Users collection in Basket
const userSchema = new mongoose.Schema({
	username: { type: String, required: true },
	phone: { type: String, required: true, unique: true },
	role: { type: String, default: 'user' },
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model('User', userSchema, 'users');

function buildUserDbName(username, phone) {
	return `${username}_${phone}`;
}

// POST /api/user/login
router.post('/login', async (req, res) => {
	try {
		const username = String(req.body.username || '').trim();
		const phone = String(req.body.phone || '').trim();
		if (!username || !phone) {
			return res.status(400).json({ error: 'username and phone are required' });
		}
		if (!/^[A-Za-z\s]+$/.test(username)) {
			return res.status(400).json({ error: 'Username must be alphabetic' });
		}
		if (!/^\d+$/.test(phone)) {
			return res.status(400).json({ error: 'Phone must be digits only' });
		}

		// Admin bypass
		if (username === 'vajra' && phone === '123') {
			return res.json({ role: 'admin', redirect: '/pages/admin.html' });
		}

		// Upsert user in Basket.users (unique by phone)
		const now = new Date();
		const user = await User.findOneAndUpdate(
			{ phone },
			{ $setOnInsert: { username, phone, role: 'user', createdAt: now }, $set: { updatedAt: now } },
			{ new: true, upsert: true }
		);

		// Create per-user DB and base collections
		const client = mongoose.connection.getClient();
		const userDbName = buildUserDbName(username, phone);
		const userDb = client.db(userDbName);

		// Ensure profile
		const profileCol = userDb.collection('profile');
		const profile = await profileCol.findOne({ userId: userDbName });
		if (!profile) {
			await profileCol.insertOne({ userId: userDbName, username, phone, createdAt: now, updatedAt: now });
		}
		// Ensure cart
		await userDb.createCollection('cart').catch(() => {});
		// Ensure favorites collection exists (user-specific, optional per-user DB)
		await userDb.createCollection('favorites').catch(() => {});

		return res.json({ role: 'user', userDbName, redirect: '/pages/home.html' });
	} catch (err) {
		console.error('User login error:', err);
		return res.status(500).json({ error: 'Internal server error' });
	}
});

module.exports = router;


