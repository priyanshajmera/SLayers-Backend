import express from 'express';
import { upload, handleMulterError, cleanupFile } from '../config/multer.js';
import openai from 'openai';
import fs from 'fs';
import path from 'path';

const router = express.Router();// For file system operations

// Endpoint for outfit rating
router.post('/outfitrating', upload.single('image'), handleMulterError, async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    // Generate the file URL
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    console.log(fileUrl);
    try {
        const prompt = "You are a friendly fashion expert who reviews outfits in a simple, human, and engaging way: Generate the following:\n" +
            "1. A ** Title ** (max 5 words) that captures the style and feel of the outfit (e.g., 'Relaxed Weekend Chic').\n" +
            "2. A ** Star Rating ** (1–5) that reflects the overall appeal of the outfit.\n" +
            "3. A ** Review ** (3–5 sentences) written in simple and relatable words. It should:\n" +
            "- Highlight the best features of the outfit.\n" +
            "- Suggest specific clothing items or accessories (like a scarf, watch, shoes, or bag) that would make the outfit even more stylish.\n" +
            "- End with a friendly and motivating comment, encouraging the person to feel confident about their style.\n" +
            "The tone should feel like advice from a kind and fashionable friend. Avoid overly complex words or jargon, and make the review easy to read and fun!";

        let description = '';
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: `${prompt}` },
                            {
                                type: "image_url",
                                image_url: {
                                    url: fileUrl,
                                    detail: "low",
                                },
                            },
                        ],
                    },
                ],
                store: true,
            });
            description = response.choices[0]?.message?.content;
            const regex = /Title:\s*"(.*?)"\s*Star Rating:\s*(\d\.\d)\s*Review:\s*(.*)/;
            const match = description.match(regex);
            const title = match[1];
            const starRating = match[2];
            const review = match[3]; // Extract title, star rating, and review using regex
            description = `${title}\n${starRating}\n${review}`;     
            res.status(200).json({ rating: rating, title: title, starRating: starRating, review: review });
        } catch (error) {
            console.error('OpenAI API failed:', error.message);
            description = 'Description unavailable';
        }
        res.status(200).json({ rating: description });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error getting rating' });
    } finally {

    }
});

// Endpoint for wardrobe rating
router.post('/wardroberating', async (req, res) => {
    const { topImage, bottomImage } = req.body; // Get images from request body
    try {
        const response = await axios.post('YOUR_OPENAI_API_ENDPOINT', {
            topImage,
            bottomImage
        });
        res.json({ rating: response.data.rating });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error getting rating' });
    }
});

const app = express();

export default router; 