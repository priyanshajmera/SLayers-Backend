import express from 'express';
import pool from '../config/database.js';

const router = express.Router();


// Get wardrobe items
router.get('/', async (req, res) => {
    const userId = req.userId;
    console.log('User ID:', userId); // Log the userId
    try {
        const result = await pool.query(
            `SELECT * 
            FROM outfits 
            WHERE user_id = $1 
            ORDER BY 
                CASE 
                    WHEN category = 'Tops' THEN 1
                    WHEN category = 'Bottoms' THEN 2
                    WHEN category = 'Shoes' THEN 3
                    ELSE 4 
                END, 
                category`,
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch wardrobe', details: err.message });
    }
});

export default router; 