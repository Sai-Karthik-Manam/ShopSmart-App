const express = require("express");
const bcrypt = require("bcrypt");
const path = require("path");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
require("dotenv").config(); // Load environment variables

const app = express();
const port = process.env.PORT || 5100;
const MONGO_URI = process.env.MONGO_URI;

const models = require("./models/schema");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Admin middleware
function adminAuthenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).send('Unauthorized');
    jwt.verify(token, 'ADMIN_SECRET_TOKEN', (err, user) => {
        if (err) return res.status(403).send('Forbidden');
        req.user = user;
        next();
    });
}

// User middleware
const userAuthenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(" ")[1];
        if (!token) return res.status(401).send('Invalid JWT Token');
        const decoded = jwt.verify(token, 'USER_SECRET_TOKEN');
        req.user = decoded.user;
        next();
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Category endpoints
app.post('/add-category', async (req, res) => {
    try {
        const { category, description } = req.body;
        if (!category) return res.status(400).send('Category and description are required');
        const existingCategory = await models.Category.findOne({ category });
        if (existingCategory) return res.status(400).send('Category already exists');
        const newCategory = new models.Category({ category, description });
        const savedCategory = await newCategory.save();
        return res.status(200).send(savedCategory);
    } catch (error) {
        console.log(error);
        res.status(500).send('Server Error');
    }
});

app.get('/api/categories', async (req, res) => {
    try {
        const categoriesList = await models.Category.find();
        res.status(200).send(categoriesList);
    } catch (error) {
        res.status(500).send('Server error');
    }
});

// Product endpoints
app.post('/add-products', async (req, res) => {
    try {
        const { productname, description, price, image, category, countInStock, rating } = req.body;
        if (!productname || !description || !price || !image || !category || !countInStock || !rating) {
            return res.status(400).send({ message: 'Missing required fields' });
        }
        const foundCategory = await models.Category.findOne({ category });
        if (!foundCategory) return res.status(404).send({ message: 'Category not found' });
        const product = new models.Product({
            productname,
            description,
            price,
            image,
            category,
            countInStock,
            rating,
            dateCreated: new Date()
        });
        await product.save();
        res.status(201).send(product);
    } catch (error) {
        res.status(500).send({ message: 'Internal server error' });
    }
});

app.get('/products', async (req, res) => {
    const products = await models.Product.find();
    res.json(products);
});

app.get('/products/:id', async (req, res) => {
    try {
        const product = await models.Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/products/:id', async (req, res) => {
    try {
        const deletedProduct = await models.Product.findByIdAndDelete(req.params.id);
        if (!deletedProduct) return res.status(404).json({ message: 'Product not found' });
        res.status(200).json({ message: 'Product deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting product' });
    }
});

app.put('/products/:id', async (req, res) => {
    try {
        const updatedProduct = await models.Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedProduct) return res.status(404).json({ message: 'Product not found' });
        res.status(200).json(updatedProduct);
    } catch (error) {
        res.status(500).json({ message: 'Error updating product' });
    }
});

// Cart endpoints
app.post('/add-to-cart', async (req, res) => {
    const { userId, productId, productName, quantity = 1 } = req.body;
    const item = new models.AddToCart({ userId, productId, productName, quantity });
    try {
        await item.save();
        res.status(200).json({ message: `Added to cart` });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.get('/cart/:id', async (req, res) => {
    try {
        const cartItems = await models.AddToCart.find({ userId: req.params.id });
        const productIds = cartItems.map(item => item.productId);
        const products = await models.Product.find({ _id: { $in: productIds } });
        res.send(products);
    } catch (error) {
        res.status(500).send('Internal server error');
    }
});

app.delete('/remove-from-cart/:id', async (req, res) => {
    try {
        const result = await models.AddToCart.deleteOne({ productId: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ message: 'Product not found in cart' });
        res.status(200).json({ message: 'Removed from cart' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Order & Payment
app.post('/orders', async (req, res) => {
    try {
        const { firstname, lastname, user, phone, productId, quantity, paymentMethod, address } = req.body;
        const product = await models.Product.findById(productId);
        const amount = product.price * quantity;
        const order = new models.Order({
            firstname,
            lastname,
            user,
            price: amount,
            phone,
            productId,
            productName: product.productname,
            quantity,
            paymentMethod,
            address
        });
        const newOrder = await order.save();
        const payment = new models.Payment({
            user,
            name: firstname + " " + lastname,
            order: newOrder._id,
            amount,
            deliveryStatus: newOrder.status,
            paymentMethod,
            status: 'Pending'
        });
        await payment.save();
        res.status(201).json(newOrder);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.get('/orders', async (req, res) => {
    try {
        const orders = await models.Order.find();
        res.json(orders);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/my-orders/:id', async (req, res) => {
    try {
        const userOrders = await models.Order.find({ user: req.params.id });
        if (userOrders.length === 0) return res.status(404).json({ message: 'No orders' });
        res.json(userOrders);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/orders/:id', async (req, res) => {
    try {
        const order = await models.Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        res.json(order);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.put('/orders/:id', async (req, res) => {
    try {
        const order = await models.Order.findById(req.params.id);
        const payment = await models.Payment.findOne({ order: req.params.id });
        const { status } = req.body;
        order.status = status;
        payment.deliveryStatus = status;
        payment.status = (status === 'Delivered') ? 'Success' : 'Pending';
        await payment.save();
        const updatedOrder = await order.save();
        res.send(updatedOrder);
    } catch (error) {
        res.status(500).send('Server error');
    }
});

app.put('/cancel-order/:id', async (req, res) => {
    try {
        const order = await models.Order.findById(req.params.id);
        const payment = await models.Payment.findOne({ order: req.params.id });
        order.status = 'Cancelled';
        payment.deliveryStatus = 'Cancelled';
        payment.status = 'Failed';
        await payment.save();
        const updatedOrder = await order.save();
        res.send(updatedOrder);
    } catch (error) {
        res.status(500).send('Server error');
    }
});

// Payments
app.get('/payments', async (req, res) => {
    try {
        const payments = await models.Payment.find();
        res.status(200).json(payments);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

app.post('/payments', async (req, res) => {
    try {
        const payment = new models.Payment(req.body);
        const savedPayment = await payment.save();
        res.status(201).json(savedPayment);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

app.put('/payment/:id', async (req, res) => {
    try {
        const { amount, status } = req.body;
        const updatedPayment = await models.Payment.findByIdAndUpdate(
            req.params.id, { amount, status }, { new: true }
        );
        res.status(200).json(updatedPayment);
    } catch (error) {
        res.status(500).send('Server error');
    }
});

// Feedback
app.post('/feedback', async (req, res) => {
    try {
        const feedback = new models.Feedback(req.body);
        const saved = await feedback.save();
        res.status(201).json(saved);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.get('/feedback', async (req, res) => {
    try {
        const feedback = await models.Feedback.find();
        res.status(200).send(feedback);
    } catch (error) {
        res.status(500).send('Server error');
    }
});

// Authentication
app.post('/register', async (req, res) => {
    try {
        const { firstname, lastname, username, email, password } = req.body;
        const userExists = await models.Users.findOne({ email });
        if (userExists) return res.status(400).send('User already exists');
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new models.Users({ firstname, lastname, username, email, password: hashedPassword });
        await newUser.save();
        res.status(201).send('Successfully Registered');
    } catch (error) {
        res.status(500).send('Server Error');
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await models.Users.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid email or password' });
    const isAdmin = email === 'virat@gmail.com' && password === 'virat@1234';
    const token = jwt.sign({ userId: user._id }, 'mysecretkey');
    res.json({ user, token, isAdmin });
});

app.get('/users', async (req, res) => {
    try {
        const users = await models.Users.find();
        res.send(users);
    } catch (error) {
        res.status(500).send('Server error');
    }
});

// Connect to MongoDB and Start Server
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log("✅ MongoDB Connected");
    app.listen(port, () => {
        console.log(`🚀 Server running at http://localhost:${port}`);
    });
}).catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
});

module.exports = app;
