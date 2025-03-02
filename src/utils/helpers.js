import fs from 'fs';
import path from 'path';
import axios from 'axios';

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