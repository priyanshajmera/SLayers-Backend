import express from 'express';
import pool from '../config/database.js';
import { imageUrlToBase64 } from '../utils/helpers.js';
import axios from 'axios';

const router = express.Router();

// List of API keys for load balancing
const apiKeys = [
    "SG_06b81cb55697b898",
    "SG_5fdfae34f7a9684d"
];

// Function to get a random API key
const getRandomApiKey = () => apiKeys[Math.floor(Math.random() * apiKeys.length)];

router.post('/', async (req, res) => {
    const userId = req.userId;

    try {
        // Get user's profile image or default image
        const userResult = await pool.query('SELECT gender, profileimageurl FROM users WHERE id = $1', [userId]);
        const user = userResult.rows[0];

        let defaultImageUrl;
        if (!user.profileimageurl) {
            defaultImageUrl = user.gender === 'male'
                ? 'https://levihsu-ootdiffusion.hf.space/file=/tmp/gradio/ba5ba7978e7302e8ab5eb733cc7221394c4e6faf/model_5.png'
                : 'https://levihsu-ootdiffusion.hf.space/file=/tmp/gradio/2e0cca23e744c036b3905c4b6167371632942e1c/model_1.png';
        } else {
            defaultImageUrl = user.profileimageurl;
        }

        // Choose an API key
        const apiKey = apiKeys.length === 1 ? apiKeys[0] : getRandomApiKey();
        const url = "https://api.segmind.com/v1/try-on-diffusion";

        // First try-on with bottom
        const bottomData = {
            "model_image": await imageUrlToBase64(defaultImageUrl),
            "cloth_image": await imageUrlToBase64(req.body.bottom),
            "category": "Lower body",
            "num_inference_steps": 35,
            "guidance_scale": 2,
            "seed": Math.floor(Math.random() * 5000000) + 1,
            "base64": true
        };

        const bottomResult = await axios.post(url, bottomData, {
            headers: { 'x-api-key': apiKey }
        });

        // Second try-on with top
        const topData = {
            "model_image": bottomResult.data.image,
            "cloth_image": await imageUrlToBase64(req.body.top),
            "category": "Upper body",
            "num_inference_steps": 35,
            "guidance_scale": 2,
            "seed": Math.floor(Math.random() * 5000000) + 1,
            "base64": true
        };

        const topResult = await axios.post(url, topData, {
            headers: { 'x-api-key': apiKey }
        });

        res.json({
            "output": topResult.data.image
        });
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to process virtual try-on request' });
    }
});

export default router; 