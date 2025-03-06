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
