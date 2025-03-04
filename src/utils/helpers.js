import fs from 'fs';
import path from 'path';
import axios from 'axios';
import pool from '../config/database.js';

export const imageFileToBase64 = (imagePath) => {
    const imageData = fs.readFileSync(path.resolve(imagePath));
    return Buffer.from(imageData).toString('base64');
};

export const imageUrlToBase64 = async (imageUrl) => {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    return Buffer.from(response.data, 'binary').toString('base64');
};

export const calculateAge = (dob) => {
    const birthDate = new Date(dob);
    const birthYear = birthDate.getUTCFullYear();
    const birthMonth = birthDate.getUTCMonth();
    const birthDay = birthDate.getUTCDate();

    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDay = today.getDate();

    let age = todayYear - birthYear;

    if (todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay)) {
        age--;
    }

    return age;
};

export const saveBase64AsImage = (base64Data, filePath) => {
    const base64Image = base64Data.split(';base64,').pop();
    fs.writeFileSync(filePath, base64Image, { encoding: 'base64' });
}; 

export const wardrobeDetails = async (userId) => {

    const query = 'SELECT id, image_url, description,category,subcategory FROM outfits WHERE user_id = $1 ORDER BY RANDOM()';
    const values = [userId];

    const result = await pool.query(query, values);

    // Build the prompt using the fetched data
    if (result.rows.length > 0) {
        let prompt = 'Wardrobe Details:\n';
        result.rows.forEach((row, index) => {
            prompt += `Item ${row.id}\n`;
            prompt += `Category ${row.category}\n`;
            prompt += `Sub-category ${row.subcategory}\n`;
            // prompt += `   Image URL: ${row.image_url}\n`;
            prompt += `   Description: ${row.description}\n\n`;
        });
        return prompt;

    } else {
        return null;
    }
}

export const generatePreferences = async (data) => {
    // Group tags by category

    const groupedData = data.reduce((acc, item) => {
        if (!acc[item.category]) {
            acc[item.category] = "";
        }
        acc[item.category] += acc[item.category] ? `, ${item.tag}` : item.tag;
        return acc;
    }, {});

    // Print all values
    var finalString = ''
    for (const [category, tags] of Object.entries(groupedData)) {
        finalString += `${category}: ${tags},`;
    }

    return finalString;

}

export const fetchGenderAndDob = async (userId) => {

    const result = await pool.query(
        'select gender,dob from users where id=$1',
        [userId]
    );
    console.log(`result for user id ${userId}`, result);
    if (result.rows.length === 0) return null;

    return result.rows[0];

}