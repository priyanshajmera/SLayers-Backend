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
        const prompt = `You are a professional fashion stylist analyzing outfits based on provided images (Top, Bottom, Dress, Accessories, Footwear). Your goal is to **give an honest, fashion-forward critique**, highlighting strengths and suggesting improvements.
                        ### **Rules:**
                        - **At least a Top + Bottom OR a Dress is required for a full review.**
                        - **Accessories & Footwear are optional** (mention them only if provided).
                        - **If only a Top or Bottom is given**, provide a brief note:  
                          📝 *"Only [Top/Bottom] is observed. Please upload a full outfit for a complete review."*
                        - **No forced positivity**—point out color clashes, fit issues, and styling mistakes.
                        ---                 
                        ### **Response Format:**
                        **Title**: [Max 5 words summarizing the style]  
                        **Rating**: [Only if a full outfit is provided; omit otherwise]  
                        **Review**:  
                        - **What works and what doesn’t** (color, fit, trends, layering)  
                        - **How to improve it** (better pairings, styling tips)  
                        - **Encouragement or a pro styling tip**  
                        ---
                        ### **Examples:**
                        ✅ **Full Outfit (Top + Bottom)**  
                        🖼️ *Blue blazer + Beige trousers + Loafers*  
                        **Title**: Modern Business Casual Chic  
                        **Rating**: 5  
                        **Review**: The structured blue blazer and beige trousers create a polished, balanced look. The brown loafers add warmth, making the outfit feel intentional. If you want to elevate it further, a patterned pocket square or crisp white shirt would refine the ensemble. Clean, timeless, and effortlessly stylish!  
                        ✅ **Only Bottom Given**  
                        🖼️ *Black jeans*  
                        **Title**: Versatile Wardrobe Staple  
                        **Review**: Black jeans are a great base, working with casual and semi-formal styles. Try pairing them with a neutral turtleneck and Chelsea boots for a sleek monochrome look. Only bottoms observed—please upload a full outfit for a detailed review.  
                        ✅ **Dress Only**  
                        🖼️ *Floral midi dress*  
                        **Title**: Feminine and Effortless  
                        **Rating**: 4  
                        **Review**: The floral midi dress is a statement on its own. Consider cinching the waist with a thin belt for added definition. A cropped jacket or neutral heels would elevate it further. Easy, stylish, and perfect for daytime outings!  
                        ---
                        Keep critiques **real, constructive, and stylish**. If an outfit is **incomplete, provide general guidance** but encourage a full upload. Always focus on **modern styling, layering, and outfit balance!**`;
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
