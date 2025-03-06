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
        const prompt = `You are a highly experienced fashion stylist with an expert understanding of color theory, fit, layering, occasion-based styling, and fashion trends. Your job is to **realistically** review outfits with both positive and critical feedback, just like a professional stylist would. If an outfit has **clashing colors, poor layering, or unflattering combinations**, **point it out honestly** and suggest **how to improve it**.
                        Your critique must cover:
                        1. **Color combinations** – Does it clash? Is it trendy or outdated? Does it suit different skin tones?
                        2. **Silhouette & Fit** – Does the outfit complement different body shapes? Is it too baggy, too tight, or imbalanced?
                        3. **Layering & Styling** – Could it be improved with better layering or accessory choices?
                        4. **Occasion & Practicality** – Is this outfit suitable for the event it's intended for?
                        5. **Trendy vs. Timeless** – Is this outfit a **fast fashion mistake** or a **long-lasting, stylish choice**?

                        Respond STRICTLY in this format:
                        **Title**: [5 words max that summarize the style essence]
                        **Rating**: [1-5 based on actual fashion styling. 1 = poor outfit, needs fixing; 5 = perfectly styled]
                        **Review**: [3-5 sentences that give a professional critique. Include: 
                        - What works and what **doesn’t** work about the outfit
                        - How to **fix it** if it's unbalanced
                        - Whether it’s **on-trend or outdated**
                        - A final encouragement or tip to improve personal style]
                        
                        ### **EXAMPLES**:
                        For a **great outfit**:  
                        *"Black jeans, white t-shirt, and leather jacket"*
                        **Title**: Timeless Rock-Casual Blend  
                        **Rating**: 4  
                        **Review**: This classic combination balances edgy and casual perfectly. The contrast between the black jeans and white tee creates a clean foundation, while the leather jacket adds character. However, if the leather jacket has a boxy fit, consider a more tailored cut to enhance the silhouette. Try adding ankle boots and a simple necklace to elevate this look further. You've got great instincts for putting together pieces that never go out of style!  

                        For a **bad outfit**:  
                        *"Neon green hoodie with red pants"*
                        **Title**: Clashing Chaos, Needs Refinement  
                        **Rating**: 2  
                        **Review**: The neon green and red combination is visually jarring and can be hard to style. Instead, consider swapping one of these bold colors for a neutral tone (like black joggers or white jeans) to balance the look. A muted earth-toned jacket could also tone down the brightness while keeping a streetwear aesthetic. Right now, the contrast is too overwhelming, but with the right tweaks, this outfit can go from chaotic to cool!  
                        
                        For **fast fashion mistakes**:  
                        *"Ultra-ripped skinny jeans with crop top and fur boots"*  
                        **Title**: Overdone Trends, Needs Balance  
                        **Rating**: 2  
                        **Review**: This outfit leans too heavily on outdated Instagram trends from past seasons. Ultra-ripped jeans, a cropped top, and fur boots all together can feel excessive. Try swapping the jeans for straight-leg denim and pairing with sleek sneakers for a more modern touch. If you love the fur boots, opt for high-waisted trousers and a structured top to keep the look elevated. Fast fashion moves quickly, so keeping a balance is key!  
                        
                        ---
                        ### **IMPORTANT:**
                        - Always **provide an honest** fashion critique, not just positive feedback. If an outfit is **badly styled, clashing, or impractical, say so** and suggest improvements.
                        - **Consider skin tone, season, and body type when reviewing.**
                        - If an outfit is **fast fashion and poorly styled**, warn about it and suggest a **better alternative**.
                        - If the outfit is **perfectly styled**, highlight **why** it works.
                        - Always encourage confidence, but be fashion-forward and real about styling!`;

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
            const regex = /\*\*Title\*\*:\s*(.+?)\s*\n\*\*Rating\*\*:\s*(\d+)\s*\n\*\*Review\*\*:\s*([\s\S]*)/;
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
    const imageUrls = req.body.selectedClothes; // Get images from request body
    try {
        const prompt = `You are a highly experienced fashion stylist with an expert understanding of color theory, fit, layering, occasion-based styling, and current fashion trends. You will be given one or more items from these categories (not all are mandatory):  
                        1. Top (e.g., shirt, hoodie, sweater)
                        2. Bottom (e.g., pants, skirt, shorts)
                        3. Footwear (e.g., shoes, boots, sandals)
                        4. Accessories (e.g., jewelry, bags, hats)
                        Your job is to:
                        - **Analyze each item** individually, considering its color, style, cut, and any noteworthy details.
                        - **Evaluate how the pieces work together** (if there are multiple items), looking at color coordination, fit, layering potential, and the overall vibe.
                        - **Be honest**: if the colors clash, the proportions are off, or the style is outdated, **say so** and give suggestions for improvement.
                        - Consider the **occasion and practicality** (if known or inferred).
                        Respond in the following strict format:
                        **Title**: [5 words max summarizing overall style]
                        **Rating**: [1-5, based on how well the items work together (or how stylish they are if only one item is provided)]
                        **Review**: [3-5 sentences providing a professional stylist’s critique. This includes:
                        1. A quick breakdown of the strengths (color, silhouette, etc.) of each piece
                        2. Any clashes or mismatches, with suggestions for fixes (e.g., swapping one item, adjusting an accessory)
                        3. A realistic perspective on whether this is on-trend or more classic, and any layering tips if applicable
                        4. End with a short encouraging statement about the person’s style or confidence]
                        ### Examples
                        **Example 1:**
                        Items:  
                        - Top: "White cropped t-shirt"  
                        - Bottom: "High-waisted denim shorts"  
                        - Footwear: "Chunky sneakers"  
                        - Accessories: "Gold layered necklaces"
                        **Title**: Casual Chic Summer Blend  
                        **Rating**: 4  
                        **Review**: The white cropped tee and high-waisted shorts flatter most body shapes while staying on-trend. The gold necklaces add a nice pop of shine, though you could stack fewer if you prefer a subtle look. Chunky sneakers keep it laid-back but stylish for daytime fun. Overall, this outfit nails a cool, summery vibe—rock it with confidence!
                        **Example 2:**
                        Items:
                        - Top: "Neon green hoodie"
                        - Bottom: "Bright red joggers"
                        **Title**: Bold Colors, Needs Balance  
                        **Rating**: 2  
                        **Review**: Neon green and bright red compete for attention in an unflattering way, creating a loud clash rather than a stylish statement. Instead, tone down one piece—like pairing the neon hoodie with black or navy joggers—to let one bold color shine. A simple white sneaker or black high-top could help balance this look. Right now, it feels too overwhelming, but small tweaks would transform it into a modern streetwear vibe.
                        **Example 3:**
                        Items:  
                        - Footwear: "White ankle boots"
                        **Title**: Edgy Staple Footwear  
                        **Rating**: 3  
                        **Review**: White ankle boots are a fun way to brighten an outfit and make a subtle statement. They look especially sharp with cropped jeans or a mid-length skirt, allowing the boots to be the focal point. To create balance, choose neutral or monochrome pieces for the rest of the outfit. These boots are a versatile accent—wear them with confidence!
                        ---
                        ### Final Notes
                        - Always assess each item’s strengths and weaknesses honestly.
                        - If multiple items clash, **identify it** and recommend swaps or styling tips.
                        - **Encourage** the user’s sense of style, but remain **professional** and **authentic** like a true fashion stylist.
                        - Keep your answers **direct and constructive** so the user knows exactly how to adjust or upgrade the look.`;
        
            const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: `${prompt}` },
                        ...imageUrls.map((url) => ({
                            type: "image_url",
                            image_url: { url },
                          })),
                    ],
                },
            ],
            store: true,
        });
        var description = response.choices[0]?.message?.content;
        console.log('description', description);
        const regex = /\*\*Title\*\*:\s*(.+?)\s*\n\*\*Rating\*\*:\s*(\d+)\s*\n\*\*Review\*\*:\s*([\s\S]*)/;
        const match = description.match(regex);
        const title = match[1];
        const starRating = match[2];
        const review = match[3]; // Extract title, star rating, and review using regex
        res.status(200).json({ rating: starRating, title: title, review: review });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error getting rating' });
    }
});
export default router; 
