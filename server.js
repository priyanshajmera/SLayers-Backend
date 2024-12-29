// Import necessary modules
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

// Initialize the app and database connection
const app = express();
const port = 3000;

// Enable CORS for all routes
app.use(cors());

// Middleware setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// PostgreSQL connection pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'slayrs',
  password: '1234',
  port: 5432,
});

// Create tables
const dbSetup = async () => {
  const queries = [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(200) NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS outfits (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id),
      image_url VARCHAR(255) NOT NULL,
      category VARCHAR(50),
      tags TEXT
    );`,
  ];
  for (const query of queries) {
    await pool.query(query);
  }
};

dbSetup();

// Utility functions
const generateToken = (userId) => jwt.sign({ userId }, 'your_jwt_secret', { expiresIn: '1h' });

const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, 'your_jwt_secret');
    req.userId = decoded.userId; // Attach user ID to the request object
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// API Endpoints

// Signup/Register
app.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id',
      [username, email, hashedPassword]
    );
    res.status(201).json({ message: 'User registered successfully', userId: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'User registration failed', details: err.message });
  }
});

// SignIn
app.post('/signin', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = generateToken(user.id);
    res.json({ message: 'Sign in successful', token });
  } catch (err) {
    res.status(500).json({ error: 'Sign in failed', details: err.message });
  }
});

// Apply authentication middleware for protected routes only
app.use(authenticateToken);

// File Upload
app.post('/upload', upload.single('image'), async (req, res) => {
  const { category, tags } = req.body;
  const userId = req.userId; // Extracted from middleware after authentication

  try {
    const imageUrl = `/uploads/${req.file.filename}`;
    const result = await pool.query(
      'INSERT INTO outfits (user_id, image_url, category, tags) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, imageUrl, category, tags]
    );
    res.status(201).json({ message: 'Outfit uploaded successfully', outfitId: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Outfit upload failed', details: err.message });
  }
});

// Wardrobe Organizer
app.get('/wardrobe', async (req, res) => {
  const userId = req.userId; // Extracted from middleware after authentication
  try {
    const result = await pool.query(
      `
      SELECT * 
      FROM outfits 
      WHERE user_id = $1 
      ORDER BY 
        CASE 
          WHEN category = 'Tops' THEN 1
          WHEN category = 'Bottoms' THEN 2
          WHEN category = 'Shoes' THEN 3
          ELSE 4 
        END, 
        category
      `,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch wardrobe', details: err.message });
  }
});

// Edit Outfit
app.put('/outfits/:id', async (req, res) => {
  const { id } = req.params;
  const { category, tags } = req.body;
  const userId = req.userId; // Extracted from middleware after authentication

  try {
    const result = await pool.query(
      'UPDATE outfits SET category = $1, tags = $2 WHERE id = $3 AND user_id = $4 RETURNING id',
      [category, tags, id, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Outfit not found or unauthorized' });

    res.json({ message: 'Outfit updated successfully', outfitId: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update outfit', details: err.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
