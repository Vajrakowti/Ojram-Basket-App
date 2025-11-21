const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const router = express.Router();

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

// Multer storage config for categories
const categoryStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, categoriesDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const categoryUpload = multer({ storage: categoryStorage });

// Helper to generate collection name from category name
function getCollectionName(name) {
    return name.toLowerCase().replace(/\s+/g, '');
}

// POST /api/admin/categories - add a new category
router.post('/categories', categoryUpload.single('image'), async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !req.file) {
            return res.status(400).json({ error: 'Name and image are required' });
        }
        const imagePath = '/uploads/categories/' + req.file.filename;
        // Save to categories collection
        const category = new Category({ name, image: imagePath });
        await category.save();
        // Dynamically create a collection for the category name
        const categoryCollectionName = getCollectionName(name);
        await mongoose.connection.createCollection(categoryCollectionName);
        res.status(201).json({ name, image: imagePath });
    } catch (err) {
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

// Multer storage config for banners
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, bannersDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Banner Schema
const bannerSchema = new mongoose.Schema({
    path: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
});
const Banner = mongoose.models.Banner || mongoose.model('Banner', bannerSchema, 'banners');

// POST /api/admin/banners - upload one or more banner images
router.post('/banners', upload.array('banners', 10), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
    }
    try {
        const docs = [];
        for (const file of req.files) {
            const path = '/uploads/banners/' + file.filename;
            const doc = await Banner.create({ path });
            docs.push(doc);
        }
        res.status(201).json({ banners: docs });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save banners', details: err.message });
    }
});

// GET /api/admin/banners - list all banner images (from MongoDB)
router.get('/banners', async (req, res) => {
    try {
        const banners = await Banner.find().sort({ uploadedAt: -1 });
        res.json({ banners });
    } catch (err) {
        res.status(500).json({ error: 'Unable to fetch banners', details: err.message });
    }
});

// DELETE /api/admin/banners/:id - delete a banner image by _id
router.delete('/banners/:id', async (req, res) => {
    try {
        const banner = await Banner.findByIdAndDelete(req.params.id);
        if (!banner) return res.status(404).json({ error: 'Banner not found' });
        const filePath = path.join(bannersDir, banner.path.split('/').pop());
        fs.unlink(filePath, err => {
            if (err) {
                // File may already be gone, but still remove from DB
                return res.status(200).json({ message: 'Banner deleted from DB, file missing.' });
            }
            res.json({ message: 'Banner deleted successfully' });
        });
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

const productStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, productsDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const productUpload = multer({ storage: productStorage });

// POST /api/admin/products/:category
router.post('/products/:category', productUpload.single('image'), async (req, res) => {
    const { category } = req.params;
    const collectionName = getCollectionName(category);
    const Product = mongoose.models[collectionName] || mongoose.model(collectionName, productSchema, collectionName);
    
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Product image is required.' });
        }
        const product = new Product({
            ...req.body,
            image: `/uploads/products/${req.file.filename}`
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
        await Product.findByIdAndDelete(id);
        res.json({ message: 'Product deleted' });
    } catch (err) {
        console.error(`Error deleting product from ${category}:`, err);
        res.status(500).json({ error: 'Failed to delete product', details: err.message });
    }
});

// PUT /api/admin/products/:category/:id - update a product
router.put('/products/:category/:id', productUpload.single('image'), async (req, res) => {
    const { category, id } = req.params;
    const collectionName = getCollectionName(category);
    const Product = mongoose.models[collectionName] || mongoose.model(collectionName, productSchema, collectionName);
    
    try {
        const updateData = { ...req.body };
        
        // If a new image is uploaded, update the image path
        if (req.file) {
            updateData.image = `/uploads/products/${req.file.filename}`;
        }
        
        // Remove image field if no new image was uploaded
        if (!req.file) {
            delete updateData.image;
        }
        
        const product = await Product.findByIdAndUpdate(id, updateData, { new: true });
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (err) {
        console.error(`Error updating product in ${category}:`, err);
        res.status(500).json({ error: 'Failed to update product', details: err.message });
    }
});

module.exports = router; 