import { Router } from 'express';
import { 
  createShare, 
  getShareMetadata, 
  verifySharePassword, 
  getShareContents, 
  downloadShareFile,
  getWorkspaceShares,
  deleteShare
} from '../controllers/shareController';
import { authenticate } from '../middlewares/auth';

const router = Router();

// Create and manage share links (requires login)
router.post('/', authenticate, createShare);
router.get('/workspace', authenticate, getWorkspaceShares);
router.delete('/:shareId', authenticate, deleteShare);

// Publicly accessible endpoints (external users, no AetherDrive login required)
router.get('/:token', getShareMetadata);
router.post('/:token/verify', verifySharePassword);
router.get('/:token/contents', getShareContents);
router.get('/:token/download', downloadShareFile);

export default router;
