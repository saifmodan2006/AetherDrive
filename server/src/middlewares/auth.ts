import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/token';

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);
    
    req.user = {
      id: payload.userId,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
};
