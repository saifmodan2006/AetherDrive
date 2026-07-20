import { Request, Response } from 'express';
import prisma from '../config/db';
import { storageProvider } from '../services/storageService';

// Unified content resolver for file explorer
export const getContents = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    const folderId = (req.query.folderId as string) || null;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID is required' });
    }

    // Retrieve subfolders
    const folders = await prisma.folder.findMany({
      where: {
        workspaceId,
        parentId: folderId,
      },
      orderBy: { name: 'asc' },
    });

    // Retrieve files
    const files = await prisma.file.findMany({
      where: {
        workspaceId,
        folderId,
      },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });

    // Determine parent breadcrumbs if folderId is provided
    let breadcrumbs: { id: string; name: string }[] = [];
    if (folderId) {
      let currentFolder = await prisma.folder.findUnique({
        where: { id: folderId },
      });
      while (currentFolder) {
        breadcrumbs.unshift({ id: currentFolder.id, name: currentFolder.name });
        if (currentFolder.parentId) {
          currentFolder = await prisma.folder.findUnique({
            where: { id: currentFolder.parentId },
          });
        } else {
          currentFolder = null;
        }
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
        updatedAt: f.updatedAt,
        version: f.versions[0]?.versionNumber || 1,
      })),
      breadcrumbs,
    });
  } catch (error) {
    console.error('Fetch contents error:', error);
    return res.status(500).json({ error: 'Failed to retrieve workspace contents' });
  }
};

export const createFolder = async (req: Request, res: Response) => {
  try {
    const { name, workspaceId, parentId } = req.body;
    const userId = req.user?.id;

    if (!name || !workspaceId) {
      return res.status(400).json({ error: 'Name and Workspace ID are required' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // If parentId is specified, verify it exists and belongs to the workspace
    if (parentId) {
      const parentFolder = await prisma.folder.findUnique({
        where: { id: parentId },
      });
      if (!parentFolder || parentFolder.workspaceId !== workspaceId) {
        return res.status(404).json({ error: 'Parent folder not found in this workspace' });
      }
    }

    const folder = await prisma.folder.create({
      data: {
        name,
        workspaceId,
        parentId: parentId || null,
        createdById: userId,
      },
    });

    // Log Activity
    await prisma.activityLog.create({
      data: {
        workspaceId,
        userId,
        actionType: 'FOLDER_CREATE',
        targetType: 'FOLDER',
        targetId: folder.id,
        details: JSON.stringify({ name: folder.name }),
      },
    });

    return res.status(201).json(folder);
  } catch (error) {
    console.error('Folder create error:', error);
    return res.status(500).json({ error: 'Failed to create folder' });
  }
};

export const renameFolder = async (req: Request, res: Response) => {
  try {
    const { folderId } = req.params;
    const { name } = req.body;
    const userId = req.user?.id;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const existingFolder = await prisma.folder.findUnique({
      where: { id: folderId },
    });

    if (!existingFolder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const folder = await prisma.folder.update({
      where: { id: folderId },
      data: { name },
    });

    // Log Activity
    await prisma.activityLog.create({
      data: {
        workspaceId: folder.workspaceId,
        userId,
        actionType: 'FOLDER_RENAME',
        targetType: 'FOLDER',
        targetId: folder.id,
        details: JSON.stringify({ oldName: existingFolder.name, newName: folder.name }),
      },
    });

    return res.status(200).json(folder);
  } catch (error) {
    console.error('Folder rename error:', error);
    return res.status(500).json({ error: 'Failed to rename folder' });
  }
};

export const deleteFolder = async (req: Request, res: Response) => {
  try {
    const { folderId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
    });

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // To prevent orphan files on disk, we recursively fetch all files in this folder structure
    // Let's implement a recursive file locator helper
    const allFiles = await getAllFilesInFolder(folderId);

    // Delete files in storage provider
    for (const file of allFiles) {
      for (const version of file.versions) {
        try {
          await storageProvider.deleteFile(version.fileKey);
        } catch (storageErr) {
          console.error(`Failed to delete storage file for key ${version.fileKey}:`, storageErr);
        }
      }
    }

    // Delete folder in DB (due to Cascade delete schema, this deletes all subfolders, files, shares, comments, etc.)
    await prisma.folder.delete({
      where: { id: folderId },
    });

    // Log Activity
    await prisma.activityLog.create({
      data: {
        workspaceId: folder.workspaceId,
        userId,
        actionType: 'FOLDER_DELETE',
        targetType: 'FOLDER',
        targetId: folderId,
        details: JSON.stringify({ name: folder.name }),
      },
    });

    return res.status(200).json({ message: 'Folder deleted successfully' });
  } catch (error) {
    console.error('Folder delete error:', error);
    return res.status(500).json({ error: 'Failed to delete folder' });
  }
};

// Helper function to recursively find all files in a folder tree
const getAllFilesInFolder = async (folderId: string): Promise<any[]> => {
  let files = await prisma.file.findMany({
    where: { folderId },
    include: { versions: true },
  });

  const subfolders = await prisma.folder.findMany({
    where: { parentId: folderId },
  });

  for (const sub of subfolders) {
    const subFiles = await getAllFilesInFolder(sub.id);
    files = files.concat(subFiles);
  }

  return files;
};

export const getActivityLogs = async (req: Request, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID is required' });
    }

    const logs = await prisma.activityLog.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return res.status(200).json({ logs });
  } catch (error) {
    console.error('Fetch activity logs error:', error);
    return res.status(500).json({ error: 'Failed to retrieve activity logs' });
  }
};
