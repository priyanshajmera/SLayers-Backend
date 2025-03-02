import { OpenAI } from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

// OpenAI configuration
export const openai = new OpenAI({
    apiKey: process.env.OPEN_AI_API,
});

// Azure OpenAI configuration
export const AZURE_OPENAI_ENDPOINT = 'https://pulki-m5mhzt4t-australiaeast.cognitiveservices.azure.com/';
export const AZURE_OPENAI_API_KEY = process.env.AZURE_OPEN_AI;
export const DEPLOYMENT_NAME = 'gpt-4';

// Google Gemini configuration
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
export const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); 