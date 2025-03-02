import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!', details: err.message });
});

// Create HTTPS server
const httpsServer = https.createServer(sslOptions, app);

// Start server
httpsServer.listen(port, () => {
    console.log(`HTTPS server running on https://localhost:${port}`);
}); 