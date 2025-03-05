import express from 'express';
import { upload, handleMulterError, cleanupFile } from '../config/multer.js';
import { openai, geminiModel } from '../config/ai.js';
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
        const prompt = `You are a friendly fashion expert who reviews outfits in a simple, engaging way. Even if given minimal information (such as just "jeans" or "top"), create a complete outfit concept around that item and provide a full review.
                        Respond STRICTLY in this format:
                        **Title**: [5 words maximum that capture the style essence]
                        **Rating**: [Number from 1-5]
                        **Review**: [3-5 sentences that:
                        1. Highlight what works about the outfit or the mentioned item
                        2. Suggest specific complementary pieces or accessories to enhance the look
                        3. End with an encouraging comment about confidence and style]
                        EXAMPLES:
                        For complete outfit: "Black jeans with white t-shirt and leather jacket"
                        **Title**: Timeless Rock-Casual Blend
                        **Rating**: 4
                        **Review**: This classic combination balances edgy and casual perfectly. The contrast between the black jeans and white tee creates a clean foundation, while the leather jacket adds character. Try adding ankle boots and a simple necklace to elevate this look further. You've got great instincts for putting together pieces that never go out of style!
                        For partial outfit: "Blue jeans"
                        **Title**: Versatile Denim Foundation
                        **Rating**: 3
                        **Review**: Blue jeans are the perfect canvas for countless stylish looks. These would pair beautifully with a crisp white button-down for a classic feel, or a colorful sweater for a more casual vibe. Adding some white sneakers and a simple belt would complete this versatile foundation perfectly. With your denim as a starting point, you're set up for outfit success!
                        IMPORTANT: Always provide all three sections (Title, Rating, Review) exactly as formatted above, even with minimal information.`;

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
            console.log('description', description);
            const regex = /\*\*Title\*\*:\s*(.*?)\n\*\*Rating\*\*:\s*(\d+)\n\*\*Review\*\*:\s*([\s\S]*)/;
            const match = description.match(regex);
            const title = match[1];
            const starRating = match[2];
            const review = match[3]; // Extract title, star rating, and review using regex
            description = `${title}\n${starRating}\n${review}`;
            res.status(200).json({ rating: starRating, title: title, review: review });
        } catch (error) {
            console.error('OpenAI API failed:', error.message);
            description = 'Description unavailable';
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error getting rating' });
    } finally {
        cleanupFile(req.file.path);
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
