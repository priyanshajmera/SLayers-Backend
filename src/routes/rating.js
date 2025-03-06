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
        const prompt = `You are a professional fashion stylist reviewing outfits based on given images (Top, Bottom, Dress, Accessories, Footwear). Provide **realistic styling feedback** based on fashion principles like **color coordination, fit, layering, and trends**.
                        ### **Rules:**
                        1. **A full outfit needs either a Dress OR a Top + Bottom.** If only one is provided, still review it but mention that the outfit is incomplete.
                        2. **Accessories & Footwear are optional.** Review them **only if provided**.
                        3. **If the outfit is incomplete**, include in the review:  
                           _"Only [top/bottom] is observed. Please upload a full outfit for better styling advice."_  
                        ---          
                        ### **Response Format:**
                        **Title**: [Max 5 words summarizing the style]               
                        **Rating**: [Only if a full outfit is present; otherwise, omit]                      
                        **Review**: [3-5 sentences covering:]  
                        - **Strengths & weaknesses** (color match, silhouette, layering)  
                        - **How to improve the outfit**  
                        - **Trend relevance (timeless or outdated?)**  
                        - **Encouraging closing remark**  
                        ---               
                        ### **Examples:**  
                        #### ✅ **Full Outfit (Top + Bottom + Footwear)**  
                        🖼️ *Images Given:* Black turtleneck (Top) + Beige trousers (Bottom) + Loafers (Footwear)  
                        **Title**: Classic Minimalist Chic  
                        **Rating**: 5  
                        **Review**: The black turtleneck and beige trousers create a sleek, sophisticated contrast. The neutral tones make this a timeless combination, while the loafers add a refined touch. For extra polish, consider a structured blazer or a leather belt. This is a well-balanced, modern look that works for both casual and professional settings!  
                        ---
                        #### ✅ **Only Top Given (No Bottom, No Dress)**  
                        🖼️ *Images Given:* Graphic t-shirt (Top)  
                        **Title**: Casual Statement Piece  
                        **Review**: The bold graphic design adds personality to the outfit. This would pair well with straight-leg jeans or neutral joggers for a relaxed yet stylish vibe. Adding a denim or leather jacket could enhance the look further. _Only a top is observed—please upload a full outfit for better styling advice._  
                        ---
                        #### ✅ **Only Dress Given (No Accessories, No Footwear)**  
                        🖼️ *Images Given:* Floral wrap dress  
                        **Title**: Feminine and Flowing Elegance  
                        **Rating**: 4  
                        **Review**: This floral wrap dress is a flattering choice with its defined waist and flowing fabric. A neutral handbag and sandals would complement it well for a summer look. To transition into cooler weather, try layering with a cropped denim jacket. This is a versatile piece that can be styled in multiple ways!  
                        ---
                        #### ✅ **Only Accessories or Footwear (No Top, Bottom, or Dress)**  
                        🖼️ *Images Given:* Sneakers + Watch  
                        **Title**: Stylish Add-Ons  
                        **Review**: These sneakers have a clean, modern design, and the watch adds a subtle touch of sophistication. These would work well with a casual outfit like jeans and a crisp shirt. _Only accessories/footwear are observed—please upload a full outfit for a complete style review._  
                        ---
                        ### **Final Notes:**  
                        - **Be honest**—if colors clash or the outfit feels unbalanced, say so.  
                        - **No errors for missing items**, just note it in the review.  
                        - **Encourage better styling choices while keeping it fashion-forward.**  
                        - **Always maintain a stylist’s tone—professional, engaging, and constructive.**  
                        Generate **sharp, stylish, and realistic fashion critiques** just like a top stylist would!`;


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
