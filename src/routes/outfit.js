import express from 'express';
import pool from '../config/database.js';
import { upload, handleMulterError, cleanupFile } from '../config/multer.js';
import s3 from '../config/aws.js';
import sharp from 'sharp';
import axios from 'axios';
import { openai, geminiModel } from '../config/ai.js';
import { calculateAge } from '../utils/helpers.js';
import fs from 'fs';

const router = express.Router();


// Upload outfit
router.post('/upload', upload.single('image'), handleMulterError, async (req, res) => {
    const { category, tags, subcategory } = req.body;
    const userId = req.userId;

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const inputFilePath = req.file.path;
        const outputFilePath = `${inputFilePath}-converted.jpeg`;

        await sharp(inputFilePath)
            .jpeg({ quality: 100, chromaSubsampling: '4:4:4' })
            .toFile(outputFilePath);

        const imageBuffer = fs.readFileSync(outputFilePath);
        const base64Image = imageBuffer.toString("base64");

        const apiResponse = await axios.post(
            `${process.env.API_URL}/remove-background/`,
            { image_base64: base64Image }
        );

        const processedImageBase64 = apiResponse.data.image_base64;
        const processedImageBuffer = Buffer.from(processedImageBase64, "base64");
        const fileKey = `User_${userId}/${Date.now()}`;

        const params = {
            Bucket: process.env.S3_BUCKET,
            Key: fileKey,
            Body: processedImageBuffer,
            ContentType: "image/png",
        };

        await s3.upload(params).promise();
        const imageUrl = `${process.env.CLOUD_FRONT}/${fileKey}`;

        let description = '';
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Describe the clothing in the image with precise details for a stylist. Include the color, style, pattern, fabric, fit, and any standout design elements. The description should be vivid yet concise (maximum 3 lines) so that a reader can clearly visualize the garment without seeing the image." },
                            {
                                type: "image_url",
                                image_url: {
                                    url: imageUrl,
                                    detail: "low",
                                },
                            },
                        ],
                    },
                ],
                store: true,
            });
            description = response.choices[0]?.message?.content;
        } catch (error) {
            console.error('OpenAI API failed:', error.message);
            description = 'Description unavailable';
        }

        const result = await pool.query(
            'INSERT INTO outfits (user_id, image_url, category, subcategory, tags, description) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [userId, imageUrl, category, subcategory, tags, description]
        );

        // Cleanup temporary files
        cleanupFile(inputFilePath);
        cleanupFile(outputFilePath);

        res.status(201).json({
            message: 'File uploaded successfully',
            outfitId: result.rows[0].id,
            imageUrl,
        });
    } catch (err) {
        console.error('Error uploading file:', err.message);
        res.status(500).json({ error: 'Failed to upload file', details: err.message });
        req.file && cleanupFile(req.file.path);
    }
});



// Get single outfit
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.userId;

    try {
        const result = await pool.query(
            'SELECT * FROM outfits WHERE id = $1 AND user_id = $2',
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Outfit not found or unauthorized' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch outfit', details: err.message });
    }
});

// Update outfit
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { category, tags, description, subcategory } = req.body;
    const userId = req.userId;

    try {
        const result = await pool.query(
            'UPDATE outfits SET category = $1, tags = $2, description = $3, subcategory = $4 WHERE id = $5 AND user_id = $6 RETURNING id',
            [category, tags, description, subcategory, id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Outfit not found or unauthorized' });
        }

        res.json({ message: 'Outfit updated successfully', outfitId: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update outfit', details: err.message });
    }
});

// Delete outfit
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.userId;

    try {
        const outfitResult = await pool.query(
            'SELECT image_url FROM outfits WHERE id = $1 AND user_id = $2',
            [id, userId]
        );

        if (outfitResult.rows.length === 0) {
            return res.status(404).json({ error: 'Outfit not found or unauthorized' });
        }

        const imageUrl = outfitResult.rows[0].image_url;
        const fileKey = imageUrl.replace(process.env.CLOUD_FRONT + '/', '');

        await s3.deleteObject({
            Bucket: process.env.S3_BUCKET,
            Key: fileKey,
        }).promise();

        await pool.query('DELETE FROM outfits WHERE id = $1 AND user_id = $2', [id, userId]);

        res.json({ message: 'Outfit deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete outfit', details: err.message });
    }
});



export default router; 