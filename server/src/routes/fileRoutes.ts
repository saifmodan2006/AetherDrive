import { Router } from 'express';
import { uploadFile, downloadFile, deleteFile } from '../controllers/fileController';
import { upload } from '../middlewares/upload';
import { authenticate } from '../middlewares/auth';
import { requireWorkspaceMember, requireWorkspaceWriter } from '../middlewares/workspaceAuth';

const router = Router();

router.post('/upload', authenticate, upload.single('file'), requireWorkspaceWriter, uploadFile);
router.get('/:fileId/download', authenticate, requireWorkspaceMember, downloadFile);
router.delete('/:fileId', authenticate, requireWorkspaceWriter, deleteFile);

export default router;
