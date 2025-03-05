import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbSetup } from './config/database.js';
import { authenticateToken } from './middleware/auth.js';

// Route imports
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import outfitRoutes from './routes/outfit.js';
import favoriteRoutes from './routes/favorite.js';
import virtualTryOnRoutes from './routes/virtualTryOn.js';
import wardrobeRoutes from './routes/wardrobe.js';
import ootdRoutes from './routes/ootd.js';
import ratingRoutes from './routes/rating.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize express app
const app = express();
const port = 3000;

// SSL configuration
const sslOptions = {
    key: fs.readFileSync(path.resolve(__dirname, '..', 'privkey.pem')),
    cert: fs.readFileSync(path.resolve(__dirname, '..', 'fullchain.pem')),
};

// Middleware setup
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

app.use('/uploads', express.static('uploads'));

// Initialize database
dbSetup().catch(console.error);

// Public routes
app.use(authRoutes);

// Protected routes
app.use('/profile', authenticateToken, profileRoutes);
app.use('/outfits', authenticateToken, outfitRoutes);
app.use('/favorites', authenticateToken, favoriteRoutes);
app.use('/wardrobe', authenticateToken, wardrobeRoutes);
app.use('/virtualtryon', authenticateToken, virtualTryOnRoutes);
app.use('/ootd', authenticateToken, ootdRoutes);
app.use('/rating', authenticateToken, ratingRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!', details: err.message });
});

//Create HTTPS server
const httpsServer = https.createServer(sslOptions, app);

// Start server
httpsServer.listen(port, "0.0.0.0", () => {
    console.log(`HTTPS server running on https://0.0.0.0:${port}`);
});

// const httpServer = http.createServer(app);

// // Start HTTP server
// httpServer.listen(port, "0.0.0.0", () => {
//     console.log(__dirname);
//     console.log(`HTTP server running on http://0.0.0.0:${port}`);
// });