const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { uploadBuffer, destroyIfCloudinaryUrl } = require('../utils/cloudinaryUpload');

const router = express.Router();

const memoryUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 12 * 1024 * 1024 }
});

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://Ojram:453471spvcars@ojrambasket.caraknd.mongodb.net/?retryWrites=true&w=majority&appName=OjramBasket';
const dbName = 'Basket';
if (!mongoose.connection.readyState) {
    mongoose.connect(MONGODB_URI, { dbName });
}

// Category Schema
const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    image: { type: String, required: true }
});
const Category = mongoose.models.Category || mongoose.model('Category', categorySchema, 'categories');

// Ensure the categories directory exists
const categoriesDir = path.join(__dirname, '../public/uploads/categories');
if (!fs.existsSync(categoriesDir)) {
    fs.mkdirSync(categoriesDir, { recursive: true });
}

// Helper to generate collection name from category name
function getCollectionName(name) {
    return name.toLowerCase().replace(/\s+/g, '');
}

// POST /api/admin/categories - add a new category
router.post('/categories', memoryUpload.single('image'), async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !req.file) {
            return res.status(400).json({ error: 'Name and image are required' });
        }
        const uploaded = await uploadBuffer(req.file.buffer, {
            folder: 'vajram/categories',
            mimeType: req.file.mimetype,
            public_id: `${Date.now()}-${path.basename(req.file.originalname, path.extname(req.file.originalname))}`.replace(/[^\w.-]/g, '_')
        });
        const imageUrl = uploaded.secure_url;
        const category = new Category({ name, image: imageUrl });
        await category.save();
        const categoryCollectionName = getCollectionName(name);
        await mongoose.connection.createCollection(categoryCollectionName).catch((e) => {
            if (e.code === 48 || e.codeName === 'NamespaceExists') return;
            throw e;
        });
        res.status(201).json({ name, image: imageUrl });
    } catch (err) {
        console.error('Category create error:', err);
        if (err.code === 11000) {
            return res.status(409).json({ error: 'Category already exists' });
        }
        res.status(500).json({ error: 'Error creating category', details: err.message });
    }
});

// GET /api/admin/categories - list all categories
router.get('/categories', async (req, res) => {
    try {
        const categories = await Category.find();
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching categories' });
    }
});

// DELETE /api/admin/categories/:id - delete a category and its collection
router.delete('/categories/:id', async (req, res) => {
    try {
        const category = await Category.findByIdAndDelete(req.params.id);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        await destroyIfCloudinaryUrl(category.image);
        if (category.image && category.image.startsWith('/uploads/')) {
            const localFile = path.join(__dirname, '../public', category.image);
            fs.unlink(localFile, () => {});
        }
        // Drop the specific category collection
        const categoryCollectionName = getCollectionName(category.name);
        const collectionsBefore = await mongoose.connection.db.listCollections().toArray();
        console.log('Collections before deletion:', collectionsBefore.map(c => c.name));
        const exists = collectionsBefore.some(col => col.name === categoryCollectionName);
        if (exists) {
            await mongoose.connection.dropCollection(categoryCollectionName);
            console.log(`Dropped collection: ${categoryCollectionName}`);
        } else {
            console.warn(`Collection ${categoryCollectionName} does not exist, cannot drop.`);
        }
        const collectionsAfter = await mongoose.connection.db.listCollections().toArray();
        console.log('Collections after deletion:', collectionsAfter.map(c => c.name));
        res.json({ message: 'Category deleted successfully' });
    } catch (err) {
        console.error('Error deleting category:', err); // Log error details
        res.status(500).json({ error: 'Error deleting category', details: err.message });
    }
});

// Ensure the banners directory exists
const bannersDir = path.join(__dirname, '../public/uploads/banners');
if (!fs.existsSync(bannersDir)) {
    fs.mkdirSync(bannersDir, { recursive: true });
}

function bannersCol() {
    return mongoose.connection.db.collection('banners');
}

// POST /api/admin/banners - upload one or more banner images
router.post('/banners', memoryUpload.array('banners', 10), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
    }
    try {
        const bgColorRaw = String(req.body.bgColor || '').trim();
        const bgColor = /^#[0-9a-fA-F]{6}$/.test(bgColorRaw) ? bgColorRaw : '';
        const docs = [];
        for (const file of req.files) {
            const uploaded = await uploadBuffer(file.buffer, {
                folder: 'vajram/banners',
                mimeType: file.mimetype,
                public_id: `${Date.now()}-${path.basename(file.originalname, path.extname(file.originalname))}`.replace(/[^\w.-]/g, '_')
            });
            const doc = {
                path: uploaded.secure_url,
                bgColor,
                uploadedAt: new Date()
            };
            const result = await bannersCol().insertOne(doc);
            docs.push({ _id: result.insertedId, ...doc });
        }
        res.status(201).json({ banners: docs });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save banners', details: err.message });
    }
});

// GET /api/admin/banners - list all banner images (from MongoDB)
router.get('/banners', async (req, res) => {
    try {
        const banners = await bannersCol().find({}).sort({ uploadedAt: -1 }).toArray();
        res.json({ banners });
    } catch (err) {
        res.status(500).json({ error: 'Unable to fetch banners', details: err.message });
    }
});

// DELETE /api/admin/banners/:id - delete a banner image by _id
router.delete('/banners/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid banner id' });
        }
        const banner = await bannersCol().findOneAndDelete({ _id: new mongoose.Types.ObjectId(req.params.id) });
        const deleted = banner && (banner.value || banner);
        if (!deleted) return res.status(404).json({ error: 'Banner not found' });
        await destroyIfCloudinaryUrl(deleted.path);
        if (deleted.path && deleted.path.startsWith('/uploads/')) {
            const filePath = path.join(bannersDir, deleted.path.split('/').pop());
            fs.unlink(filePath, () => {});
        }
        res.json({ message: 'Banner deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete banner', details: err.message });
    }
});

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    weight: { type: Number },
    weightUnit: { type: String },
    image: { type: String, required: true }
});

const productsDir = path.join(__dirname, '../public/uploads/products');
if (!fs.existsSync(productsDir)) {
    fs.mkdirSync(productsDir, { recursive: true });
}

// POST /api/admin/products/:category
router.post('/products/:category', memoryUpload.single('image'), async (req, res) => {
    const { category } = req.params;
    const collectionName = getCollectionName(category);
    const Product = mongoose.models[collectionName] || mongoose.model(collectionName, productSchema, collectionName);
    
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Product image is required.' });
        }
        const uploaded = await uploadBuffer(req.file.buffer, {
            folder: `vajram/products/${collectionName}`,
            mimeType: req.file.mimetype,
            public_id: `${Date.now()}-${path.basename(req.file.originalname, path.extname(req.file.originalname))}`.replace(/[^\w.-]/g, '_')
        });
        const product = new Product({
            ...req.body,
            image: uploaded.secure_url
        });
        await product.save();
        res.status(201).json(product);
    } catch (err) {
        console.error(`Error adding product to ${category}:`, err);
        res.status(500).json({ error: 'Failed to add product', details: err.message });
    }
});

// GET /api/admin/products/:category
router.get('/products/:category', async (req, res) => {
    const { category } = req.params;
    const collectionName = getCollectionName(category);
    const Product = mongoose.models[collectionName] || mongoose.model(collectionName, productSchema, collectionName);
    
    try {
        const products = await Product.find();
        res.json(products);
    } catch (err) {
        console.error(`Error fetching products from ${category}:`, err);
        res.status(500).json({ error: 'Failed to fetch products', details: err.message });
    }
});

// GET /api/admin/products/:category/:id - get a single product
router.get('/products/:category/:id', async (req, res) => {
    const { category, id } = req.params;
    const collectionName = getCollectionName(category);
    const Product = mongoose.models[collectionName] || mongoose.model(collectionName, productSchema, collectionName);
    
    try {
        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (err) {
        console.error(`Error fetching product from ${category}:`, err);
        res.status(500).json({ error: 'Failed to fetch product', details: err.message });
    }
});

// DELETE /api/admin/products/:category/:id
router.delete('/products/:category/:id', async (req, res) => {
    const { category, id } = req.params;
    const collectionName = getCollectionName(category);
    const Product = mongoose.models[collectionName] || mongoose.model(collectionName, productSchema, collectionName);
    
    try {
        const existing = await Product.findById(id);
        if (!existing) {
            return res.status(404).json({ error: 'Product not found' });
        }
        await destroyIfCloudinaryUrl(existing.image);
        if (existing.image && existing.image.startsWith('/uploads/')) {
            fs.unlink(path.join(__dirname, '../public', existing.image), () => {});
        }
        await Product.findByIdAndDelete(id);
        res.json({ message: 'Product deleted' });
    } catch (err) {
        console.error(`Error deleting product from ${category}:`, err);
        res.status(500).json({ error: 'Failed to delete product', details: err.message });
    }
});

// PUT /api/admin/products/:category/:id - update a product
router.put('/products/:category/:id', memoryUpload.single('image'), async (req, res) => {
    const { category, id } = req.params;
    const collectionName = getCollectionName(category);
    const Product = mongoose.models[collectionName] || mongoose.model(collectionName, productSchema, collectionName);
    
    try {
        const previous = await Product.findById(id);
        if (!previous) {
            return res.status(404).json({ error: 'Product not found' });
        }
        const updateData = { ...req.body };
        
        if (req.file) {
            const uploaded = await uploadBuffer(req.file.buffer, {
                folder: `vajram/products/${collectionName}`,
                mimeType: req.file.mimetype,
                public_id: `${Date.now()}-${path.basename(req.file.originalname, path.extname(req.file.originalname))}`.replace(/[^\w.-]/g, '_')
            });
            updateData.image = uploaded.secure_url;
            await destroyIfCloudinaryUrl(previous.image);
            if (previous.image && previous.image.startsWith('/uploads/')) {
                fs.unlink(path.join(__dirname, '../public', previous.image), () => {});
            }
        } else {
            delete updateData.image;
        }
        
        const product = await Product.findByIdAndUpdate(id, updateData, { new: true });
        res.json(product);
    } catch (err) {
        console.error(`Error updating product in ${category}:`, err);
        res.status(500).json({ error: 'Failed to update product', details: err.message });
    }
});

// Orders Management
// GET /api/admin/orders/all - get all orders (new + completed) for order ID calculation
router.get('/orders/all', async (req, res) => {
    try {
        // Ensure MongoDB connection is ready
        if (mongoose.connection.readyState !== 1) {
            await mongoose.connect(MONGODB_URI, { dbName });
        }
        
        const client = mongoose.connection.getClient();
        const ordersDb = client.db('Orders');
        const newOrdersCollection = ordersDb.collection('neworders');
        const finishCollection = ordersDb.collection('finish');
        
        // Fetch both new and completed orders - handle errors gracefully
        let newOrders = [];
        let completedOrders = [];
        
        try {
            newOrders = await newOrdersCollection.find().toArray();
        } catch (err) {
            console.warn('Error fetching new orders:', err);
        }
        
        try {
            completedOrders = await finishCollection.find().toArray();
        } catch (err) {
            console.warn('Error fetching completed orders from finish collection:', err);
        }
        
        // Combine all orders
        const allOrders = [...newOrders, ...completedOrders];
        
        res.json(allOrders);
    } catch (err) {
        console.error('Error fetching all orders:', err);
        res.status(500).json({ error: 'Failed to fetch all orders', details: err.message });
    }
});

// GET /api/admin/orders - get all orders from neworders collection
router.get('/orders', async (req, res) => {
    try {
        // Ensure MongoDB connection is ready
        if (mongoose.connection.readyState !== 1) {
            await mongoose.connect(MONGODB_URI, { dbName });
        }
        
        const client = mongoose.connection.getClient();
        const ordersDb = client.db('Orders');
        const ordersCollection = ordersDb.collection('neworders');
        const orders = await ordersCollection.find().sort({ placedAt: -1 }).toArray();
        res.json(orders);
    } catch (err) {
        console.error('Error fetching orders:', err);
        res.status(500).json({ error: 'Failed to fetch orders', details: err.message });
    }
});

// GET /api/admin/orders/completed - get all completed orders from finish collection (MUST be before /orders/:id)
router.get('/orders/completed', async (req, res) => {
    try {
        // Ensure MongoDB connection is ready
        if (mongoose.connection.readyState !== 1) {
            await mongoose.connect(MONGODB_URI, { dbName });
        }
        
        // Wait a bit to ensure connection is fully established
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const client = mongoose.connection.getClient();
        if (!client) {
            throw new Error('MongoDB client is not available');
        }
        
        const ordersDb = client.db('Orders');
        if (!ordersDb) {
            throw new Error('Cannot access Orders database');
        }
        
        const finishCollection = ordersDb.collection('finish');
        
        // Try to get a count first to verify collection access
        const count = await finishCollection.countDocuments();
        console.log(`Found ${count} documents in finish collection`);
        
        // Fetch all orders - sort by placedAt descending (most recent first)
        // If completedAt exists, it will be used, otherwise placedAt is used
        const orders = await finishCollection.find({})
            .sort({ placedAt: -1 })
            .toArray();
        
        // If orders have completedAt, sort by that instead
        if (orders.length > 0 && orders[0].completedAt) {
            orders.sort((a, b) => {
                const aTime = a.completedAt ? new Date(a.completedAt).getTime() : new Date(a.placedAt).getTime();
                const bTime = b.completedAt ? new Date(b.completedAt).getTime() : new Date(b.placedAt).getTime();
                return bTime - aTime; // Descending
            });
        }
        
        console.log(`Successfully fetched ${orders.length} completed orders from finish collection`);
        res.json(orders);
    } catch (err) {
        console.error('Error fetching completed orders:', err);
        console.error('Error details:', {
            message: err.message,
            name: err.name,
            stack: err.stack
        });
        res.status(500).json({ 
            error: 'Failed to fetch completed orders', 
            details: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// GET /api/admin/orders/completed/:id - get a single completed order by ID (MUST be before /orders/:id)
router.get('/orders/completed/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid order ID format' });
        }
        
        // Ensure MongoDB connection is ready
        if (mongoose.connection.readyState !== 1) {
            await mongoose.connect(MONGODB_URI, { dbName });
        }
        
        const client = mongoose.connection.getClient();
        const ordersDb = client.db('Orders');
        const finishCollection = ordersDb.collection('finish');
        const order = await finishCollection.findOne({ _id: new mongoose.Types.ObjectId(id) });
        
        if (!order) {
            return res.status(404).json({ error: 'Completed order not found' });
        }
        
        res.json(order);
    } catch (err) {
        console.error('Error fetching completed order:', err);
        res.status(500).json({ error: 'Failed to fetch completed order', details: err.message });
    }
});

// GET /api/admin/orders/:id - get a single order by ID
router.get('/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid order ID format' });
        }
        
        const client = mongoose.connection.getClient();
        const ordersDb = client.db('Orders');
        const ordersCollection = ordersDb.collection('neworders');
        const order = await ordersCollection.findOne({ _id: new mongoose.Types.ObjectId(id) });
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        res.json(order);
    } catch (err) {
        console.error('Error fetching order:', err);
        res.status(500).json({ error: 'Failed to fetch order', details: err.message });
    }
});

// PUT /api/admin/orders/:id/complete - move order to finish collection
router.put('/orders/:id/complete', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid order ID format' });
        }
        
        // Ensure MongoDB connection is ready
        if (mongoose.connection.readyState !== 1) {
            await mongoose.connect(MONGODB_URI, { dbName });
        }
        
        const client = mongoose.connection.getClient();
        const ordersDb = client.db('Orders');
        const newOrdersCollection = ordersDb.collection('neworders');
        const finishCollection = ordersDb.collection('finish');
        
        // Find the order in neworders
        const order = await newOrdersCollection.findOne({ _id: new mongoose.Types.ObjectId(id) });
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        // Add completedAt timestamp
        order.completedAt = new Date();
        
        // Insert into finish collection
        await finishCollection.insertOne(order);
        
        // Delete from neworders collection
        await newOrdersCollection.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
        
        res.json({ message: 'Order moved to completed orders successfully' });
    } catch (err) {
        console.error('Error completing order:', err);
        res.status(500).json({ error: 'Failed to complete order', details: err.message });
    }
});

// DELETE /api/admin/orders/completed/:id - delete a completed order
router.delete('/orders/completed/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid order ID format' });
        }
        
        // Ensure MongoDB connection is ready
        if (mongoose.connection.readyState !== 1) {
            await mongoose.connect(MONGODB_URI, { dbName });
        }
        
        const client = mongoose.connection.getClient();
        const ordersDb = client.db('Orders');
        const finishCollection = ordersDb.collection('finish');
        
        const result = await finishCollection.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Completed order not found' });
        }
        
        res.json({ message: 'Completed order deleted successfully' });
    } catch (err) {
        console.error('Error deleting completed order:', err);
        res.status(500).json({ error: 'Failed to delete completed order', details: err.message });
    }
});

module.exports = router; 