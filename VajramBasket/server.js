const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pages', 'login.html'));
});

// Test API page
app.get('/test-api', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'test-api.html'));
});

const adminback = require('./routes/adminback');
const homeback = require('./routes/homeback');
const userback = require('./routes/userback');
app.use('/api/admin', adminback);
app.use('/api/home', homeback);
app.use('/api/user', userback);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    console.log('404 - API route not found:', req.originalUrl);
    res.status(404).json({ error: 'API endpoint not found' });
});

// Start server
const PORT = process.env.MAIN_PORT || 4000;
app.listen(PORT, () => {
    console.log(`Main server is running on port ${PORT}`);
});
