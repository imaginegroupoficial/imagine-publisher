import { PUBLIC_BASE_URL } from './config.js';
export const baseUrl = (req: any): string => PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
