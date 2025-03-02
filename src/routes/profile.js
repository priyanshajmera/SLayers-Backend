import express from 'express';
import bcrypt from 'bcrypt';
import pool from '../config/database.js';
import { upload, handleMulterError } from '../config/multer.js';
import s3 from '../config/aws.js';
import sharp from 'sharp';
import axios from 'axios';
import fs from 'fs';

const router = express.Router();

// Get user profile
router.get('/', async (req, res) => {
    const userId = req.userId;

    try {
        const query = 'SELECT id, username, email, gender, dob, phone, profileimageurl FROM users WHERE id = $1';
        const result = await pool.query(query, [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Error executing query:', err.message);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Update user profile
router.put('/', upload.single('profileimageurl'), handleMulterError, async (req, res) => {
    const userId = req.userId;
    const { username, email, phone, gender, dob, currentPassword, newPassword } = req.body;
    let profileimageurl = null;

    try {
        const userCheckResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);

        if (userCheckResult.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (req.file) {
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
            const fileKey = `User_${userId}/ProfileImage/${Date.now()}`;

            const params = {
                Bucket: process.env.S3_BUCKET,
                Key: fileKey,
                Body: processedImageBuffer,
                ContentType: req.file.mimetype,
            };

            await s3.upload(params).promise();
            profileimageurl = `${process.env.CLOUD_FRONT}/${fileKey}`;

            // Cleanup temporary files
            fs.unlinkSync(inputFilePath);
            fs.unlinkSync(outputFilePath);
        }

        const user = userCheckResult.rows[0];

        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ message: 'Current password is required to change the password.' });
            }

            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ message: 'Current password is incorrect.' });
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);
        }

        const updateQuery = `
            UPDATE users
            SET 
                username = COALESCE($1, username),
                email = COALESCE($2, email),
                phone = COALESCE($3, phone),
                gender = COALESCE($4, gender),
                dob = COALESCE($5, dob),
                profileimageurl = $7
            WHERE id = $6
            RETURNING id, username, email, gender, dob, phone, profileimageurl;
        `;

        const updateResult = await pool.query(updateQuery, [
            username, email, phone, gender, dob, userId, profileimageurl
        ]);

        return res.status(200).json({
            message: 'Profile updated successfully',
            user: updateResult.rows[0]
        });
    } catch (err) {
        console.error('Error updating profile:', err.message);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

export default router; 