import express from 'express';
import pool from '../config/database.js';
import { calculateAge } from '../utils/helpers.js';
import { geminiModel } from '../config/ai.js';

const router = express.Router();
const userOptionsStore = new Map();

// Get outfit suggestions
router.post('/', async (req, res) => {
    const userId = req.userId;
    let userOptions = userOptionsStore.get(userId) || [];

    const optionsAsText = userOptions
        .map((option, index) => `Option ${index + 1}: ${JSON.stringify(option)}`)
        .join('\n');

    userOptionsStore.delete(userId);
    userOptions.shift();

    try {
        // Get wardrobe details
        const wardrobeQuery = await pool.query(
            'SELECT id, image_url, description, category, subcategory FROM outfits WHERE user_id = $1',
            [userId]
        );

        let wardrobePrompt = 'Wardrobe Details:\n';
        wardrobeQuery.rows.forEach(row => {
            wardrobePrompt += `Item ${row.id}\n`;
            wardrobePrompt += `Category ${row.category}\n`;
            wardrobePrompt += `Sub-category ${row.subcategory}\n`;
            wardrobePrompt += `   Description: ${row.description}\n\n`;
        });

        // Get user details
        const userQuery = await pool.query('SELECT gender, dob FROM users WHERE id = $1', [userId]);
        const user = userQuery.rows[0];
        const userAge = calculateAge(user.dob);

        // Generate preferences string
        const preferences = req.body.map(item => `${item.category}: ${item.tag}`).join(', ');

        var promptToSent =
            clothData +
                    `\nTask: Hi, I am a ${usergender}, Age ${userAge}. Based on the provided wardrobe, intelligently categorize the clothing items and ensure that selections align with the latest fashion trends, seasonal suitability, and a cohesive color palette. 
            Carefully curate multiple outfit options that are stylish, well-balanced, and tailored to my given preferences. Consider category and sub-category carefully, as descriptions may not always accurately represent the correct classification of each item. Ensure that outfits reflect modern styling techniques, layering methods (if applicable), and appropriate accessory pairings.
            
            Preferences to consider:\n` + preferences +
                    `\nResponse Format: Provide at least two stylish and well-coordinated outfit options. Strictly follow the format below:
            
            - OUTFIT OPTION 1:
                - Top: Item number (e.g., Item 17)
                - Bottom: Item number (e.g., Item 19)
                - Layering (if applicable): Item number. If layering is mentioned in preferences, include a stylish layering option; otherwise, ignore this section.
                - Accessories: If suitable accessories are available, provide item numbers; otherwise, suggest trendy alternatives that complement the outfit.
                - Footwear: If a matching footwear item exists, provide the item number; otherwise, suggest an appropriate alternative based on fashion trends.
                - Styling suggestions: Provide expert styling advice on how to wear the outfit, including color coordination, fit adjustments, accessorizing tips, and any additional fashion insights to enhance the overall look.

            - OUTFIT OPTION 2:
                - Top: Item number
                - Bottom: Item number
                - Layering (if applicable): Item number. If layering is mentioned in preferences, include a stylish layering option; otherwise, ignore this section.
                - Accessories: If suitable accessories are available, provide item numbers; otherwise, suggest trendy alternatives that complement the outfit.
                - Footwear: If a matching footwear item exists, provide the item number; otherwise, suggest an appropriate alternative based on fashion trends.
                - Styling suggestions: Provide expert styling advice on how to wear the outfit, including color coordination, fit adjustments, accessorizing tips, and any additional fashion insights to enhance the overall look.

            Important Considerations:
            - Each outfit should be unique, avoiding repetition of previously suggested options.
            - Ensure that the color palette is well-coordinated and aligned with the user’s preferences.
            - Incorporate layering only if specified in the preferences.
            - Maintain a balance between casual, formal, and seasonal trends based on the user's needs.
            - Pay attention to fabric textures and how they complement each other in an outfit.

            Already suggested outfit combinations:\n${optionsAsText} 
            Avoid repeating these combinations. Aim for fresh, trendy, and fashion-forward suggestions.`;
        console.log('promptToSent:', promptToSent);

        const geminiResp = await geminiModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: promptToSent }] }],
            generationConfig: {
                maxOutputTokens: 690,
                temperature: 0.7,
            }
        });

        const result = geminiResp.response.text().trim();
        const options = {};
        const sections = result.split(/OUTFIT OPTION \d+:?/gi);

        sections.forEach((section, index) => {
            if (index === 0) return;

            const optionKey = `Option ${index}`;
            options[optionKey] = [];

            const matches = [...section.matchAll(/(\w+):\s*(Item\s(\d+))?(.*?)(?=\n|$)/gi)];
            matches.forEach(match => {
                const key = match[1];
                const clothId = match[3] || null;
                const suggestion = match[4] ? match[4].trim() : null;
                options[optionKey].push({ key, clothId, suggestion });
            });
        });

        userOptions.push(options);
        if (userOptions.length > 1) {
            userOptions.shift();
        }
        userOptionsStore.set(userId, userOptions);

        // Update options with URLs and details
        const clothIds = [...new Set(
            Object.values(options).flatMap(option =>
                option.map(item => item.clothId).filter(id => id)
            )
        )];

        const clothQuery = await pool.query(
            'SELECT id, image_url, category, subcategory, tags FROM outfits WHERE id = ANY($1)',
            [clothIds]
        );

        const clothDatabase = clothQuery.rows.reduce((acc, record) => {
            acc[record.id] = record;
            return acc;
        }, {});

        Object.keys(options).forEach(optionKey => {
            options[optionKey] = options[optionKey].map(item => ({
                ...item,
                clothId: clothDatabase[item.clothId] || item.clothId
            }));
        });

        res.json(options);
    } catch (error) {
        console.error("Error generating outfit suggestions:", error);
        res.status(500).json({ error: "Failed to generate outfit suggestions" });
    }
});

export default router;
