import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';
import { storageProvider } from '../services/storageService';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_jwt_access_secret_key_12938102';

// Helper: Sign a temporary token for a verified password-protected share
const generateShareAccessToken = (shareId: string): string => {
  return jwt.sign({ shareId }, JWT_SECRET, { expiresIn: '2h' });
};

// Helper: Verify temporary share token
const verifyShareAccessToken = (token: string, shareId: string): boolean => {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { shareId: string };
    return payload.shareId === shareId;
  } catch (err) {
    return false;
  }
};

export const createShare = async (req: Request, res: Response) => {
  try {
    const { fileId, folderId, accessRole, isPublic, password, expiresAt } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!fileId && !folderId) {
      return res.status(400).json({ error: 'Either File ID or Folder ID is required' });
    }

    // Verify ownership or writer permissions on the target resource
    let targetWorkspaceId = '';
    if (fileId) {
      const file = await prisma.file.findUnique({ where: { id: fileId } });
      if (!file) return res.status(404).json({ error: 'File not found' });
      targetWorkspaceId = file.workspaceId;
    } else {
      const folder = await prisma.folder.findUnique({ where: { id: folderId } });
      if (!folder) return res.status(404).json({ error: 'Folder not found' });
      targetWorkspaceId = folder.workspaceId;
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: targetWorkspaceId,
          userId,
        },
      },
    });

    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'EDITOR')) {
      return res.status(403).json({ error: 'You do not have permission to share this resource' });
    }

    // Hash password if provided
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const share = await prisma.fileShare.create({
      data: {
        fileId: fileId || null,
        folderId: folderId || null,
        sharedById: userId,
        accessRole: accessRole || 'VIEWER',
        isPublic: isPublic !== undefined ? isPublic : true,
        passwordHash,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    return res.status(201).json(share);
  } catch (error) {
    console.error('Create share error:', error);
    return res.status(500).json({ error: 'Failed to create share link' });
  }
};

export const getShareMetadata = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const share = await prisma.fileShare.findUnique({
      where: { shareToken: token },
      include: {
        file: true,
        folder: true,
        sharedBy: {
          select: { name: true, email: true },
        },
      },
    });

    if (!share) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    // Check expiration
    if (share.expiresAt && new Date() > share.expiresAt) {
      return res.status(410).json({ error: 'This share link has expired' });
    }

    const isFolder = !!share.folderId;
    const resourceName = isFolder ? share.folder?.name : share.file?.name;

    return res.status(200).json({
      id: share.id,
      shareToken: share.shareToken,
      type: isFolder ? 'folder' : 'file',
      name: resourceName,
      size: isFolder ? null : share.file?.size,
      mimeType: isFolder ? null : share.file?.mimeType,
      owner: share.sharedBy.name,
      isPasswordProtected: !!share.passwordHash,
      accessRole: share.accessRole,
    });
  } catch (error) {
    console.error('Resolve share metadata error:', error);
    return res.status(500).json({ error: 'Failed to resolve share metadata' });
  }
};

export const verifySharePassword = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const share = await prisma.fileShare.findUnique({
      where: { shareToken: token },
    });

    if (!share) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    if (!share.passwordHash) {
      return res.status(400).json({ error: 'This share link is not password protected' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const isMatch = await bcrypt.compare(password, share.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const accessToken = generateShareAccessToken(share.id);
    return res.status(200).json({ accessToken });
  } catch (error) {
    console.error('Verify share password error:', error);
    return res.status(500).json({ error: 'Failed to verify password' });
  }
};

export const getShareContents = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const subFolderId = req.query.folderId as string; // Optional, for sub-exploration
    const authHeader = req.headers.authorization;

    const share = await prisma.fileShare.findUnique({
      where: { shareToken: token },
      include: { folder: true },
    });

    if (!share || !share.folderId) {
      return res.status(404).json({ error: 'Shared folder not found' });
    }

    // Check expiration
    if (share.expiresAt && new Date() > share.expiresAt) {
      return res.status(410).json({ error: 'This share link has expired' });
    }

    // Enforce password check
    if (share.passwordHash) {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization token required' });
      }
      const clientToken = authHeader.split(' ')[1];
      const isValid = verifyShareAccessToken(clientToken, share.id);
      if (!isValid) {
        return res.status(403).json({ error: 'Invalid or expired share session' });
      }
    }

    // Determine target folder: either root shared folder or subfolder
    let targetFolderId = share.folderId;
    if (subFolderId) {
      // Validate that subFolderId is indeed a descendant of share.folderId to prevent directory escape!
      const isDescendant = await checkFolderDescendant(subFolderId, share.folderId);
      if (!isDescendant) {
        return res.status(403).json({ error: 'Access denied: Directory escape detected' });
      }
      targetFolderId = subFolderId;
    }

    // Retrieve contents
    const folders = await prisma.folder.findMany({
      where: { parentId: targetFolderId },
      orderBy: { name: 'asc' },
    });

    const files = await prisma.file.findMany({
      where: { folderId: targetFolderId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });

    // Determine path breadcrumbs relative to the root shared folder
    let breadcrumbs: { id: string; name: string }[] = [];
    if (subFolderId) {
      let currentFolder = await prisma.folder.findUnique({ where: { id: subFolderId } });
      while (currentFolder && currentFolder.id !== share.folderId) {
        breadcrumbs.unshift({ id: currentFolder.id, name: currentFolder.name });
        if (currentFolder.parentId) {
          currentFolder = await prisma.folder.findUnique({ where: { id: currentFolder.parentId } });
        } else {
          currentFolder = null;
        }
      }
      // Prepend root shared folder
      if (share.folder) {
        breadcrumbs.unshift({ id: share.folder.id, name: share.folder.name });
      }
    }

    return res.status(200).json({
      folders,
      files: files.map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        createdAt: f.createdAt,
        version: f.versions[0]?.versionNumber || 1,
      })),
      breadcrumbs,
    });
  } catch (error) {
    console.error('Fetch shared contents error:', error);
    return res.status(500).json({ error: 'Failed to retrieve folder contents' });
  }
};

export const downloadShareFile = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const fileId = req.query.fileId as string;
    const authHeader = req.headers.authorization || (req.query.token as string);

    const share = await prisma.fileShare.findUnique({
      where: { shareToken: token },
      include: { file: { include: { versions: true } } },
    });

    if (!share) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    // Check expiration
    if (share.expiresAt && new Date() > share.expiresAt) {
      return res.status(410).json({ error: 'This share link has expired' });
    }

    // Enforce password check
    if (share.passwordHash) {
      if (!authHeader) {
        return res.status(401).json({ error: 'Authorization credentials required' });
      }
      // Extract token from Bearer header or direct query parameter
      const clientToken = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
      const isValid = verifyShareAccessToken(clientToken, share.id);
      if (!isValid) {
        return res.status(403).json({ error: 'Invalid or expired share session' });
      }
    }

    let file = null;

    if (fileId) {
      // 1. Downloading a file inside a shared folder structure
      if (!share.folderId) {
        return res.status(400).json({ error: 'This is not a shared folder link' });
      }

      const foundFile = await prisma.file.findUnique({
        where: { id: fileId },
        include: { versions: true },
      });

      if (!foundFile) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Check if file is directly in the shared folder or is in a subfolder descendant of the shared folder
      const isAuthorized = 
        foundFile.folderId === share.folderId || 
        (foundFile.folderId ? await checkFolderDescendant(foundFile.folderId, share.folderId) : false);

      if (!isAuthorized) {
        return res.status(403).json({ error: 'Access denied: File is outside of shared directory' });
      }

      file = foundFile;
    } else {
      // 2. Downloading a directly shared file link
      if (!share.fileId || !share.file) {
        return res.status(404).json({ error: 'Shared file not found' });
      }
      file = share.file;
    }

    const activeVersion = file.versions.find(v => v.id === file.currentVersionId);
    if (!activeVersion) {
      return res.status(404).json({ error: 'File version content not found' });
    }

    // Set headers
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader('Content-Length', activeVersion.size.toString());

    // Stream
    const stream = await storageProvider.getFileStream(activeVersion.fileKey);
    stream.on('error', (err: any) => {
      console.error('Share file stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error reading file stream' });
      }
    });

    stream.pipe(res);
  } catch (error) {
    console.error('Share download error:', error);
    return res.status(500).json({ error: 'Failed to download shared file' });
  }
};

// Helper: Recursive checker to verify folder is child of shared parent folder
const checkFolderDescendant = async (folderId: string, parentId: string): Promise<boolean> => {
  let folder = await prisma.folder.findUnique({ where: { id: folderId } });
  while (folder) {
    if (folder.parentId === parentId) return true;
    if (!folder.parentId) return false;
    folder = await prisma.folder.findUnique({ where: { id: folder.parentId } });
  }
  return false;
};

export const getWorkspaceShares = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID is required' });
    }

    const shares = await prisma.fileShare.findMany({
      where: {
        OR: [
          {
            file: { workspaceId }
          },
          {
            folder: { workspaceId }
          }
        ]
      },
      include: {
        file: true,
        folder: true,
        sharedBy: {
          select: {
            name: true,
            email: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ shares });
  } catch (error) {
    console.error('Fetch workspace shares error:', error);
    return res.status(500).json({ error: 'Failed to retrieve shared items' });
  }
};

export const deleteShare = async (req: Request, res: Response) => {
  try {
    const { shareId } = req.params;

    const share = await prisma.fileShare.findUnique({
      where: { id: shareId }
    });

    if (!share) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    // Verify user owns/created the share
    const userId = req.user?.id;
    if (share.sharedById !== userId) {
      return res.status(403).json({ error: 'Unauthorized to revoke this share link' });
    }

    await prisma.fileShare.delete({
      where: { id: shareId }
    });

    return res.status(200).json({ message: 'Share link revoked successfully' });
  } catch (error) {
    console.error('Delete share error:', error);
    return res.status(500).json({ error: 'Failed to revoke share link' });
  }
};
