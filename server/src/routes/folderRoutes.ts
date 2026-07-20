import { Router } from 'express';
import { getContents, createFolder, renameFolder, deleteFolder, getActivityLogs } from '../controllers/folderController';
import { authenticate } from '../middlewares/auth';
import { requireWorkspaceMember, requireWorkspaceWriter } from '../middlewares/workspaceAuth';

const router = Router();

router.get('/contents', authenticate, requireWorkspaceMember, getContents);
router.get('/activity', authenticate, requireWorkspaceMember, getActivityLogs);
router.post('/', authenticate, requireWorkspaceWriter, createFolder);
router.put('/:folderId', authenticate, requireWorkspaceWriter, renameFolder);
router.delete('/:folderId', authenticate, requireWorkspaceWriter, deleteFolder);

export default router;
