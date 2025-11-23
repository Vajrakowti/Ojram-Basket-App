const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const router = express.Router();

const bannersDir = path.join(__dirname, '../public/uploads/banners');

// MongoDB connection for categories
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

// GET /api/home/categories - list all categories for home page
router.get('/categories', async (req, res) => {
    try {
        const categories = await Category.find();
        console.log('Fetched categories:', categories); // Debug log
        res.json(categories);
    } catch (err) {
        console.error('Error fetching categories:', err);
        res.status(500).json({ error: 'Error fetching categories' });
    }
});

// Banner Schema
const bannerSchema = new mongoose.Schema({
    path: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
});
const Banner = mongoose.models.Banner || mongoose.model('Banner', bannerSchema, 'banners');

// GET /api/home/banners - list all banner images for home page (from MongoDB)
router.get('/banners', async (req, res) => {
    try {
        const banners = await Banner.find().sort({ uploadedAt: -1 });
        res.json({ banners });
    } catch (err) {
        res.status(500).json({ error: 'Unable to fetch banners', details: err.message });
    }
});

// (Future: Add product listing, search, etc. here)

// Product Schema (same as admin)
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    weight: { type: Number },
    weightUnit: { type: String },
    image: { type: String, required: true }
});

// Helper function to get or create model
function getProductModel(categoryName) {
    const modelName = `Product_${categoryName}`; // Prefix to avoid conflicts
    if (mongoose.models[modelName]) {
        return mongoose.models[modelName];
    }
    return mongoose.model(modelName, productSchema, categoryName.toLowerCase().replace(/\s+/g, ''));
}

// GET /api/home/products/:category - get products for a specific category
router.get('/products/:category', async (req, res) => {
    const { category } = req.params;
    const collectionName = category.toLowerCase().replace(/\s+/g, '');
    
    try {
        console.log('Attempting to fetch products for category:', category);
        console.log('Collection name:', collectionName);
        
        // Check if collection exists first
        const collections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();
        console.log('Found collections:', collections);
        
        if (collections.length === 0) {
            console.log('No collection found for category:', category);
            return res.status(404).json({ error: 'Category not found or no products available yet' });
        }

        const Product = getProductModel(category);
        const products = await Product.find();
        console.log(`Found ${products.length} products for category:`, category);
        res.json(products);
    } catch (err) {
        console.error('Detailed error:', err);
        console.error(`Error fetching products from ${category}:`, err.message);
        res.status(500).json({ error: 'Failed to fetch products', details: err.message });
    }
});

// GET /api/home/products/:category/random?limit=6 - random products from a category
router.get('/products/:category/random', async (req, res) => {
    const { category } = req.params;
    const limit = Math.min(parseInt(req.query.limit || '6', 10), 24);
    const collectionName = category.toLowerCase().replace(/\s+/g, '');

    try {
        // Check if the collection exists
        const collections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();
        if (collections.length === 0) {
            return res.json([]);
        }
        const Product = getProductModel(category);
        // Use aggregation pipeline for random sampling
        const docs = await Product.aggregate([{ $sample: { size: limit } }]);
        res.json(docs);
    } catch (err) {
        console.error('Error fetching random products:', err);
        res.status(500).json({ error: 'Failed to fetch random products', details: err.message });
    }
});

// GET /api/home/products/:category/:id - get a single product by ID
router.get('/products/:category/:id', async (req, res) => {
    const { category, id } = req.params;
    const collectionName = category.toLowerCase().replace(/\s+/g, '');
    
    try {
        console.log('Attempting to fetch product:', id, 'from category:', category);
        
        // Check if collection exists first
        const collections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();
        if (collections.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        const Product = getProductModel(category);
        const product = await Product.findById(id);
        
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        console.log('Found product:', product.name);
        res.json(product);
    } catch (err) {
        console.error('Error fetching product:', err);
        res.status(500).json({ error: 'Failed to fetch product', details: err.message });
    }
});

// GET /api/home/search/products?query=searchterm - search products across all categories
router.get('/search/products', async (req, res) => {
    const searchQuery = req.query.query?.toLowerCase() || '';
    
    try {
        // Get all category collections
        const collections = await mongoose.connection.db.listCollections().toArray();
        const categoryCollections = collections.filter(col => 
            !col.name.startsWith('system.') && col.name !== 'categories' && col.name !== 'favorites'
        );

        let allProducts = [];
        
        // Search in each category collection
        for (const collection of categoryCollections) {
            // Use collection name as both model and collection name
            const modelName = `Product_${collection.name}`;
            let Product;
            if (mongoose.models[modelName]) {
                Product = mongoose.models[modelName];
            } else {
                Product = mongoose.model(modelName, productSchema, collection.name);
            }
            const products = await Product.find({
                $or: [
                    { name: { $regex: searchQuery, $options: 'i' } },
                    { description: { $regex: searchQuery, $options: 'i' } }
                ]
            });
            // Add category name to each product
            const productsWithCategory = products.map(p => ({
                ...p.toObject(),
                categoryName: collection.name
            }));
            allProducts = [...allProducts, ...productsWithCategory];
        }

        res.json(allProducts);
    } catch (err) {
        console.error('Error searching products:', err);
        res.status(500).json({ error: 'Failed to search products', details: err.message });
    }
});

// Add search endpoint for home page
router.get('/search', async (req, res) => {
    const searchQuery = req.query.q?.toLowerCase() || '';
    console.log('Search query:', searchQuery);
    
    try {
        // Get all category collections
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('All collections:', collections.map(c => c.name));
        const categoryCollections = collections.filter(col => 
            !col.name.startsWith('system.') && col.name !== 'categories' && col.name !== 'banners'
        );
        console.log('Category collections to search:', categoryCollections.map(c => c.name));

        let allProducts = [];
        
        // Search in each category collection
        for (const collection of categoryCollections) {
            console.log('Searching in collection:', collection.name);
            // Use collection name as both model and collection name
            const modelName = `Product_${collection.name}`;
            let Product;
            if (mongoose.models[modelName]) {
                Product = mongoose.models[modelName];
            } else {
                Product = mongoose.model(modelName, productSchema, collection.name);
            }
            const products = await Product.find({
                $or: [
                    { name: { $regex: searchQuery, $options: 'i' } },
                    { description: { $regex: searchQuery, $options: 'i' } }
                ]
            });
            console.log(`Found ${products.length} products in ${collection.name}`);
            // Add category name to each product
            const productsWithCategory = products.map(p => ({
                ...p.toObject(),
                categoryName: collection.name
            }));
            allProducts = [...allProducts, ...productsWithCategory];
        }

        console.log('Total products found:', allProducts.length);
        res.json({ products: allProducts });
    } catch (err) {
        console.error('Error searching products:', err);
        res.status(500).json({ error: 'Failed to search products', details: err.message });
    }
});

// FAVORITES: User-specific in per-user DB
// Helper to get user DB from header x-user-db or query
function getUserDb(client, req) {
    const name = req.header('x-user-db') || req.query.userDb;
    if (!name) return null;
    return client.db(name);
}

// POST /api/home/favorites - add a product to favorites (user-specific)
router.post('/favorites', async (req, res) => {
    const { productId, category, name, image, price, weight, weightUnit } = req.body;
    if (!productId || !category) {
        return res.status(400).json({ error: 'Missing productId or category' });
    }
    try {
        const client = mongoose.connection.getClient();
        const userDb = getUserDb(client, req);
        if (!userDb) return res.status(400).json({ error: 'Missing user DB (x-user-db)' });
        const favCol = userDb.collection('favorites');
        const exists = await favCol.findOne({ productId });
        if (exists) return res.status(200).json({ message: 'Already in favorites' });
        const doc = { productId, category, name, image, price, weight, weightUnit, addedAt: new Date() };
        await favCol.insertOne(doc);
        res.status(201).json(doc);
    } catch (err) {
        res.status(500).json({ error: 'Failed to add favorite', details: err.message });
    }
});

// GET /api/home/favorites - list user favorites
router.get('/favorites', async (req, res) => {
    try {
        const client = mongoose.connection.getClient();
        const userDb = getUserDb(client, req);
        if (!userDb) return res.status(400).json({ error: 'Missing user DB (x-user-db)' });
        const favCol = userDb.collection('favorites');
        const favorites = await favCol.find().toArray();
        res.json(favorites);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch favorites', details: err.message });
    }
});

// DELETE /api/home/favorites/:productId
router.delete('/favorites/:productId', async (req, res) => {
    try {
        const client = mongoose.connection.getClient();
        const userDb = getUserDb(client, req);
        if (!userDb) return res.status(400).json({ error: 'Missing user DB (x-user-db)' });
        const favCol = userDb.collection('favorites');
        await favCol.deleteOne({ productId: req.params.productId });
        res.json({ message: 'Removed from favorites' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to remove favorite', details: err.message });
    }
});

// CART ENDPOINTS
// POST /api/home/cart - add item to cart
router.post('/cart', async (req, res) => {
    const { productId, category, name, image, price, weight, weightUnit } = req.body;
    if (!productId || !category) {
        return res.status(400).json({ error: 'Missing productId or category' });
    }
    try {
        const client = mongoose.connection.getClient();
        const userDb = getUserDb(client, req);
        if (!userDb) return res.status(400).json({ error: 'Missing user DB (x-user-db)' });
        
        const cartCol = userDb.collection('cart');
        const now = new Date();
        
        // Check if item already exists in cart
        const existingItem = await cartCol.findOne({ productId });
        
        if (existingItem) {
            // Update quantity
            const updatedItem = await cartCol.findOneAndUpdate(
                { productId },
                { $inc: { quantity: 1 }, $set: { updatedAt: now } },
                { returnDocument: 'after' }
            );
            res.json(updatedItem);
        } else {
            // Add new item
            const doc = { 
                productId, 
                category, 
                name, 
                image, 
                price: parseFloat(price), 
                weight: weight ? parseFloat(weight) : null, 
                weightUnit: weightUnit || null,
                quantity: 1,
                createdAt: now, 
                updatedAt: now 
            };
            const result = await cartCol.insertOne(doc);
            const newItem = await cartCol.findOne({ _id: result.insertedId });
            res.status(201).json(newItem);
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to add to cart', details: err.message });
    }
});

// GET /api/home/cart - get all cart items
router.get('/cart', async (req, res) => {
    try {
        const client = mongoose.connection.getClient();
        const userDb = getUserDb(client, req);
        if (!userDb) return res.status(400).json({ error: 'Missing user DB (x-user-db)' });
        
        const cartCol = userDb.collection('cart');
        const cartItems = await cartCol.find().toArray();
        res.json(cartItems);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch cart', details: err.message });
    }
});

// PUT /api/home/cart/:productId - update cart item quantity
router.put('/cart/:productId', async (req, res) => {
    const { productId } = req.params;
    const { quantity } = req.body;
    
    if (quantity < 0) {
        return res.status(400).json({ error: 'Quantity cannot be negative' });
    }
    
    try {
        const client = mongoose.connection.getClient();
        const userDb = getUserDb(client, req);
        if (!userDb) return res.status(400).json({ error: 'Missing user DB (x-user-db)' });
        
        const cartCol = userDb.collection('cart');
        
        if (quantity === 0) {
            // Remove item from cart
            await cartCol.deleteOne({ productId });
            res.json({ message: 'Item removed from cart' });
        } else {
            // Update quantity
            const updatedItem = await cartCol.findOneAndUpdate(
                { productId },
                { $set: { quantity: parseInt(quantity), updatedAt: new Date() } },
                { returnDocument: 'after' }
            );
            
            if (!updatedItem) {
                return res.status(404).json({ error: 'Item not found in cart' });
            }
            
            res.json(updatedItem);
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to update cart', details: err.message });
    }
});

// DELETE /api/home/cart/:productId - remove item from cart
router.delete('/cart/:productId', async (req, res) => {
    try {
        const client = mongoose.connection.getClient();
        const userDb = getUserDb(client, req);
        if (!userDb) return res.status(400).json({ error: 'Missing user DB (x-user-db)' });
        
        const cartCol = userDb.collection('cart');
        await cartCol.deleteOne({ productId: req.params.productId });
        res.json({ message: 'Item removed from cart' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to remove from cart', details: err.message });
    }
});

// POST /api/home/orders - place an order
router.post('/orders', async (req, res) => {
    try {
        const client = mongoose.connection.getClient();
        const userDb = getUserDb(client, req);

        if (!userDb) {
            return res.status(400).json({ error: 'Missing user DB (x-user-db)' });
        }

        const userDbName = req.header('x-user-db');
        const paymentMethod = req.body.paymentMethod || 'Not specified';

        const cartCol = userDb.collection('cart');
        const profileCol = userDb.collection('profile');

        const cartItems = await cartCol.find().toArray();
        if (!cartItems.length) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

        const profile = await profileCol.findOne({ userId: userDbName });

        const items = cartItems.map(item => ({
            productId: item.productId,
            category: item.category,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            weight: item.weight,
            weightUnit: item.weightUnit
        }));

        const totalAmount = items.reduce((sum, item) => {
            return sum + Number(item.price || 0) * Number(item.quantity || 0);
        }, 0);

        const orderDoc = {
            placedAt: new Date(),
            userDbName,
            paymentMethod,
            totalAmount,
            user: {
                username: profile?.username || 'User',
                phone: profile?.phone || '',
                address: profile?.address || null
            },
            items
        };

        const ordersDb = client.db('Orders');
        const orderCollection = ordersDb.collection('neworders');
        const insertResult = await orderCollection.insertOne(orderDoc);

        await cartCol.deleteMany({});

        res.json({
            message: 'Order placed successfully',
            orderId: insertResult.insertedId
        });
    } catch (err) {
        console.error('Error placing order:', err);
        res.status(500).json({ error: 'Failed to place order', details: err.message });
    }
});

// PROFILE ENDPOINTS
// Test endpoint to verify routing
router.get('/profile/test', (req, res) => {
    console.log('GET /api/home/profile/test - Test endpoint hit');
    res.json({ message: 'Profile API is working', timestamp: new Date() });
});

// Debug endpoint to check database info
router.get('/profile/debug', async (req, res) => {
    try {
        const client = mongoose.connection.getClient();
        const userDb = getUserDb(client, req);
        
        if (!userDb) {
            return res.status(400).json({ error: 'Missing user DB (x-user-db)' });
        }
        
        const userDbName = req.header('x-user-db');
        const profileCol = userDb.collection('profile');
        
        // Get database name
        const dbName = userDb.databaseName;
        
        // List collections in user database
        const collections = await userDb.listCollections().toArray();
        
        // Get all profile documents to see what's in the collection
        const allProfiles = await profileCol.find().toArray();
        
        // Get specific profile document
        const profile = await profileCol.findOne({ userId: userDbName });
        
        res.json({
            userDbName,
            databaseName: dbName,
            collections: collections.map(c => c.name),
            allProfiles: allProfiles,
            specificProfile: profile,
            profileExists: !!profile,
            totalProfiles: allProfiles.length
        });
    } catch (err) {
        res.status(500).json({ error: 'Debug failed', details: err.message });
    }
});

// Clear profile data for testing
router.delete('/profile/clear', async (req, res) => {
    try {
        const client = mongoose.connection.getClient();
        const userDb = getUserDb(client, req);
        
        if (!userDb) {
            return res.status(400).json({ error: 'Missing user DB (x-user-db)' });
        }
        
        const userDbName = req.header('x-user-db');
        const profileCol = userDb.collection('profile');
        
        // Delete all profile documents
        const result = await profileCol.deleteMany({});
        
        res.json({
            message: 'All profile data cleared',
            deletedCount: result.deletedCount,
            userDbName: userDbName
        });
    } catch (err) {
        res.status(500).json({ error: 'Clear failed', details: err.message });
    }
});

// Fix profile userId format (migration)
router.post('/profile/fix', async (req, res) => {
    try {
        const client = mongoose.connection.getClient();
        const userDb = getUserDb(client, req);
        
        if (!userDb) {
            return res.status(400).json({ error: 'Missing user DB (x-user-db)' });
        }
        
        const userDbName = req.header('x-user-db');
        const profileCol = userDb.collection('profile');
        
        // Get all profiles
        const allProfiles = await profileCol.find().toArray();
        
        let fixedCount = 0;
        
        // Fix profiles with ObjectId userId
        for (const profile of allProfiles) {
            if (typeof profile.userId === 'object' && profile.userId.$oid) {
                await profileCol.updateOne(
                    { _id: profile._id },
                    { $set: { userId: userDbName } }
                );
                fixedCount++;
            }
        }
        
        res.json({
            message: 'Profile userId format fixed',
            fixedCount: fixedCount,
            totalProfiles: allProfiles.length
        });
    } catch (err) {
        res.status(500).json({ error: 'Fix failed', details: err.message });
    }
});

// Merge duplicate profiles
router.post('/profile/merge', async (req, res) => {
    try {
        const client = mongoose.connection.getClient();
        const userDb = getUserDb(client, req);
        
        if (!userDb) {
            return res.status(400).json({ error: 'Missing user DB (x-user-db)' });
        }
        
        const userDbName = req.header('x-user-db');
        const profileCol = userDb.collection('profile');
        
        // Get all profiles
        const allProfiles = await profileCol.find().toArray();
        
        if (allProfiles.length <= 1) {
            return res.json({
                message: 'No duplicates found',
                profiles: allProfiles.length
            });
        }
        
        // Find the profile with the login userId (the one we want to keep)
        let mainProfile = allProfiles.find(p => p.userId === userDbName);
        
        // If not found, try to find by ObjectId format (old profiles)
        if (!mainProfile) {
            mainProfile = allProfiles.find(p => typeof p.userId === 'object' && p.userId.$oid);
        }
        
        if (!mainProfile) {
            // If no profile with login userId, use the first one
            const firstProfile = allProfiles[0];
            
            // Update it with the correct userId
            await profileCol.updateOne(
                { _id: firstProfile._id },
                { $set: { userId: userDbName } }
            );
            
            // Delete the rest
            await profileCol.deleteMany({ _id: { $ne: firstProfile._id } });
            
            return res.json({
                message: 'Profiles merged successfully',
                keptProfile: firstProfile._id,
                deletedCount: allProfiles.length - 1
            });
        }
        
        // Merge address data from other profiles
        const otherProfiles = allProfiles.filter(p => p._id.toString() !== mainProfile._id.toString());
        let mergedAddress = mainProfile.address;
        
        // If main profile doesn't have address, get it from other profiles
        if (!mergedAddress) {
            const profileWithAddress = otherProfiles.find(p => p.address);
            if (profileWithAddress) {
                mergedAddress = profileWithAddress.address;
            }
        }
        
        // Update main profile with merged data and correct userId
        await profileCol.updateOne(
            { _id: mainProfile._id },
            { 
                $set: { 
                    userId: userDbName, // Ensure correct userId format
                    address: mergedAddress,
                    updatedAt: new Date()
                }
            }
        );
        
        // Delete other profiles
        await profileCol.deleteMany({ _id: { $ne: mainProfile._id } });
        
        res.json({
            message: 'Profiles merged successfully',
            keptProfile: mainProfile._id,
            deletedCount: otherProfiles.length,
            mergedAddress: mergedAddress
        });
    } catch (err) {
        res.status(500).json({ error: 'Merge failed', details: err.message });
    }
});

// Profile Schema
const profileSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    username: { type: String, required: true },
    phone: { type: String },
    address: {
        flatHouse: { type: String },
        areaStreet: { type: String },
        landmark: { type: String },
        pincode: { type: String },
        townCity: { type: String },
        state: { type: String },
        isDefault: { type: Boolean, default: false }
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Helper function to get or create profile model for user
function getProfileModel(userDbName) {
    const modelName = `Profile_${userDbName}`;
    if (mongoose.models[modelName]) {
        return mongoose.models[modelName];
    }
    // Use the userDbName as the collection name to store in user-specific database
    return mongoose.model(modelName, profileSchema, userDbName);
}

// GET /api/home/profile - get user profile
router.get('/profile', async (req, res) => {
    console.log('GET /api/home/profile - Request received');
    console.log('Headers:', req.headers);
    
    try {
        const client = mongoose.connection.getClient();
        const userDb = getUserDb(client, req);
        
        console.log('User DB:', userDb ? 'Found' : 'Not found');
        
        if (!userDb) {
            console.log('Missing user DB, returning 400');
            return res.status(400).json({ error: 'Missing user DB (x-user-db)' });
        }
        
        const userDbName = req.header('x-user-db');
        console.log('Looking for profile for userDbName:', userDbName);
        
        // Use the user-specific database collection
        const profileCol = userDb.collection('profile');
        
        // First, try to find profile by userDbName (the correct format)
        let profile = await profileCol.findOne({ userId: userDbName });
        console.log('Profile found by userDbName:', profile ? 'Yes' : 'No');
        
        // If not found, try to find by username_phone format (fallback for old profiles)
        if (!profile) {
            console.log('Trying to find profile by username_phone format...');
            profile = await profileCol.findOne({ userId: { $regex: /^.*_.*$/ } });
            console.log('Profile found by username_phone format:', profile ? 'Yes' : 'No');
        }
        
        // If still not found, try to find by ObjectId format (very old profiles)
        if (!profile) {
            console.log('Trying to find profile by ObjectId format...');
            profile = await profileCol.findOne({ userId: { $type: "objectId" } });
            console.log('Profile found by ObjectId format:', profile ? 'Yes' : 'No');
        }
        
        if (!profile) {
            // Create a basic profile if none exists
            console.log('Creating new basic profile');
            const newProfile = {
                userId: userDbName,
                username: 'User',
                phone: '',
                address: null,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            await profileCol.insertOne(newProfile);
            console.log('Basic profile created');
            return res.json(newProfile);
        }
        
        console.log('Returning existing profile');
        res.json(profile);
    } catch (err) {
        console.error('Error fetching profile:', err);
        res.status(500).json({ error: 'Failed to fetch profile', details: err.message });
    }
});

// POST /api/home/profile/address - save/update user address
router.post('/profile/address', async (req, res) => {
    console.log('POST /api/home/profile/address - Request received');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    
    try {
        const client = mongoose.connection.getClient();
        const userDb = getUserDb(client, req);
        
        console.log('User DB:', userDb ? 'Found' : 'Not found');
        
        if (!userDb) {
            console.log('Missing user DB, returning 400');
            return res.status(400).json({ error: 'Missing user DB (x-user-db)' });
        }
        
        const { flatHouse, areaStreet, landmark, pincode, townCity, state, isDefault } = req.body;
        
        console.log('Address data:', { flatHouse, areaStreet, landmark, pincode, townCity, state, isDefault });
        
        // Validate required fields
        if (!flatHouse || !areaStreet || !pincode || !townCity) {
            console.log('Missing required fields');
            return res.status(400).json({ error: 'Missing required address fields' });
        }
        
        const userDbName = req.header('x-user-db');
        console.log('Processing address for userDbName:', userDbName);
        
        // Use the user-specific database collection
        const profileCol = userDb.collection('profile');
        
        // First, try to find profile by userDbName (the correct format)
        let existingProfile = await profileCol.findOne({ userId: userDbName });
        console.log('Profile found by userDbName:', existingProfile ? 'Yes' : 'No');
        
        // If not found, try to find by username_phone format (fallback for old profiles)
        if (!existingProfile) {
            console.log('Trying to find profile by username_phone format...');
            existingProfile = await profileCol.findOne({ userId: { $regex: /^.*_.*$/ } });
            console.log('Profile found by username_phone format:', existingProfile ? 'Yes' : 'No');
        }
        
        // If still not found, try to find by ObjectId format (very old profiles)
        if (!existingProfile) {
            console.log('Trying to find profile by ObjectId format...');
            existingProfile = await profileCol.findOne({ userId: { $type: "objectId" } });
            console.log('Profile found by ObjectId format:', existingProfile ? 'Yes' : 'No');
        }
        
        const addressData = {
            flatHouse,
            areaStreet,
            landmark,
            pincode,
            townCity,
            state: state || 'ANDHRA PRADESH',
            isDefault: isDefault || false
        };
        
        if (!existingProfile) {
            // Create new profile only if no profile exists at all
            console.log('No existing profile found, creating new profile with address');
            const newProfile = {
                userId: userDbName,
                username: 'User',
                phone: '',
                address: addressData,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            await profileCol.insertOne(newProfile);
            console.log('New profile created successfully');
            res.json(newProfile);
        } else {
            // Update existing profile with address
            console.log('Updating existing profile with address');
            console.log('Existing profile userId:', existingProfile.userId);
            
            const updatedProfile = await profileCol.findOneAndUpdate(
                { _id: existingProfile._id }, // Use _id to ensure we update the correct document
                { 
                    $set: { 
                        address: addressData,
                        updatedAt: new Date()
                    }
                },
                { returnDocument: 'after' }
            );
            console.log('Profile updated successfully');
            res.json(updatedProfile);
        }
    } catch (err) {
        console.error('Error saving address:', err);
        res.status(500).json({ error: 'Failed to save address', details: err.message });
    }
});

// PUT /api/home/profile - update user profile
router.put('/profile', async (req, res) => {
    try {
        const client = mongoose.connection.getClient();
        const userDb = getUserDb(client, req);
        if (!userDb) return res.status(400).json({ error: 'Missing user DB (x-user-db)' });
        
        const { username, phone } = req.body;
        const userId = req.header('x-user-db');
        
        const profileCol = userDb.collection('profile');
        
        const updatedProfile = await profileCol.findOneAndUpdate(
            { userId },
            { 
                $set: { 
                    username: username || 'User',
                    phone: phone || '',
                    updatedAt: new Date()
                }
            },
            { 
                upsert: true, 
                returnDocument: 'after'
            }
        );
        
        res.json(updatedProfile);
    } catch (err) {
        console.error('Error updating profile:', err);
        res.status(500).json({ error: 'Failed to update profile', details: err.message });
    }
});

module.exports = router; 