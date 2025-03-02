import express from 'express';
import pool from '../config/database.js';
import s3 from '../config/aws.js';

const router = express.Router();

// Add to favorites
router.post('/', async (req, res) => {
    try {
        const { top, bottom, vtonimage, suggestion, name } = req.body;
        const userId = req.userId;

        const base64Data = Buffer.from(vtonimage, "base64");
        const fileKey = `User_${userId}/${Date.now()}`;

        const params = {
            Bucket: process.env.S3_BUCKET,
            Key: fileKey,
            Body: base64Data,
            ContentType: 'image/jpeg',
        };

        await s3.upload(params).promise();
        const try_on_url = `${process.env.CLOUD_FRONT}/${fileKey}`;

        const result = await pool.query(
            `INSERT INTO favorites (user_id, top_id, bottom_id, try_on_url, suggestion, name)
             VALUES ($1, $2, $3, $4, $5, $6) 
             ON CONFLICT (user_id, top_id, bottom_id) DO NOTHING 
             RETURNING *`,
            [userId, parseInt(top), parseInt(bottom), try_on_url, suggestion, name]
        );

        if (result.rowCount === 0) {
            return res.status(409).json({ message: "Item already in favorites" });
        }

        res.status(201).json({ message: "Item added to favorites", try_on_url });
    } catch (error) {
        console.error('Error in POST /favorites:', error);
        res.status(500).json({
            message: "Failed to add to favorites",
            error: error.message
        });
    }
});

// Get favorites
router.get('/', async (req, res) => {
    try {
        // Ensure userId is a valid integer
        const userId = parseInt(req.userId);
        if (isNaN(userId)) {
            return res.status(400).json({
                message: "Invalid user ID",
                error: "User ID must be a valid number"
            });
        }

        const result = await pool.query(
            `SELECT 
                f.id AS favorite_id,
                f.user_id,
                f.try_on_url,
                f.created_at,
                f.suggestion,
                f.name,
                top_outfit.id AS top_id,
                top_outfit.image_url AS top_image_url,
                top_outfit.category AS top_category,
                top_outfit.description AS top_description,
                top_outfit.tags AS top_tags,
                top_outfit.subcategory AS top_subcategory,
                bottom_outfit.id AS bottom_id,
                bottom_outfit.image_url AS bottom_image_url,
                bottom_outfit.category AS bottom_category,
                bottom_outfit.description AS bottom_description,
                bottom_outfit.tags AS bottom_tags,
                bottom_outfit.subcategory AS bottom_subcategory
            FROM favorites f
            LEFT JOIN outfits top_outfit ON f.top_id = top_outfit.id
            LEFT JOIN outfits bottom_outfit ON f.bottom_id = bottom_outfit.id
            WHERE f.user_id = $1
            ORDER BY f.created_at DESC`,
            [userId]
        );

        const formattedData = result.rows.map(row => ({
            favorite_id: row.favorite_id,
            user_id: row.user_id,
            try_on_url: row.try_on_url,
            created_at: row.created_at,
            suggestion: row.suggestion,
            name: row.name,
            top: {
                id: row.top_id,
                image_url: row.top_image_url,
                category: row.top_category,
                description: row.top_description,
                tags: row.top_tags,
                subcategory: row.top_subcategory
            },
            bottom: {
                id: row.bottom_id,
                image_url: row.bottom_image_url,
                category: row.bottom_category,
                description: row.bottom_description,
                tags: row.bottom_tags,
                subcategory: row.bottom_subcategory
            }
        }));

        res.json(formattedData);
    } catch (error) {
        console.error('Error in GET /favorites:', error);
        res.status(500).json({
            message: "Failed to fetch favorites",
            error: error.message
        });
    }
});

// Remove from favorites
router.delete('/:id', async (req, res) => {
    try {
        const userId = parseInt(req.userId);
        const favId = parseInt(req.params.id);

        if (isNaN(userId) || isNaN(favId)) {
            return res.status(400).json({
                message: "Invalid ID format",
                error: "User ID and favorite ID must be valid numbers"
            });
        }

        const result = await pool.query(
            "DELETE FROM favorites WHERE user_id = $1 AND id = $2 RETURNING *",
            [userId, favId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Item not found in favorites" });
        }

        res.json({ message: "Item removed from favorites" });
    } catch (error) {
        console.error('Error in DELETE /favorites:', error);
        res.status(500).json({
            message: "Failed to remove from favorites",
            error: error.message
        });
    }
});

export default router; 