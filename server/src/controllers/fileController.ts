import { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../config/db';
import { storageProvider } from '../services/storageService';

export const uploadFile = async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.body;
    const folderId = req.body.folderId || null;
    const userId = req.user?.id;
    const expressFile = req.file;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID is required' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!expressFile) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const originalName = expressFile.originalname;
    const mimeType = expressFile.mimetype;
    const size = expressFile.size;

    // Check if parent folder exists and is valid
    if (folderId) {
      const parentFolder = await prisma.folder.findUnique({
        where: { id: folderId },
      });
      if (!parentFolder || parentFolder.workspaceId !== workspaceId) {
        return res.status(404).json({ error: 'Parent folder not found in this workspace' });
      }
    }

    // Check if file with same name exists in same directory folder
    const existingFile = await prisma.file.findFirst({
      where: {
        workspaceId,
        folderId,
        name: originalName,
      },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    const fileKey = `${workspaceId}/${crypto.randomUUID()}-${originalName}`;

    // Upload to storage provider
    await storageProvider.uploadFile(expressFile, fileKey);

    let fileRecord;
    let newVersionNumber = 1;

    if (existingFile) {
      // Create new version for existing file
      newVersionNumber = existingFile.versions[0].versionNumber + 1;

      fileRecord = await prisma.$transaction(async (tx) => {
        const version = await tx.fileVersion.create({
          data: {
            fileId: existingFile.id,
            versionNumber: newVersionNumber,
            size,
            fileKey,
            createdById: userId,
          },
        });

        const updatedFile = await tx.file.update({
          where: { id: existingFile.id },
          data: {
            size,
            currentVersionId: version.id,
            updatedAt: new Date(),
          },
        });

        return updatedFile;
      });
    } else {
      // Create brand new file and version
      fileRecord = await prisma.$transaction(async (tx) => {
        const file = await tx.file.create({
          data: {
            name: originalName,
            mimeType,
            size,
            workspaceId,
            folderId,
            createdById: userId,
          },
        });

        const version = await tx.fileVersion.create({
          data: {
            fileId: file.id,
            versionNumber: 1,
            size,
            fileKey,
            createdById: userId,
          },
        });

        const finalFile = await tx.file.update({
          where: { id: file.id },
          data: {
            currentVersionId: version.id,
          },
        });

        return finalFile;
      });
    }

    // Log Activity
    await prisma.activityLog.create({
      data: {
        workspaceId,
        userId,
        actionType: existingFile ? 'FILE_VERSION_UPLOAD' : 'FILE_UPLOAD',
        targetType: 'FILE',
        targetId: fileRecord.id,
        details: JSON.stringify({ name: originalName, version: newVersionNumber }),
      },
    });

    return res.status(201).json(fileRecord);
  } catch (error) {
    console.error('File upload error:', error);
    return res.status(500).json({ error: 'Failed to upload file' });
  }
};

export const downloadFile = async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const versionId = req.query.versionId as string;

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { versions: true },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Select the requested version or default to the current active version
    let activeVersion;
    if (versionId) {
      activeVersion = file.versions.find(v => v.id === versionId);
    } else {
      activeVersion = file.versions.find(v => v.id === file.currentVersionId);
    }

    if (!activeVersion) {
      return res.status(404).json({ error: 'Requested version not found' });
    }

    // Set headers
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader('Content-Length', activeVersion.size.toString());

    // Stream the file
    const stream = await storageProvider.getFileStream(activeVersion.fileKey);
    stream.on('error', (err: any) => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error reading file stream' });
      }
    });

    stream.pipe(res);
  } catch (error) {
    console.error('File download error:', error);
    return res.status(500).json({ error: 'Failed to download file' });
  }
};

export const deleteFile = async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { versions: true },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete physical files from disk
    for (const version of file.versions) {
      try {
        await storageProvider.deleteFile(version.fileKey);
      } catch (storageErr) {
        console.error(`Failed to delete storage file for key ${version.fileKey}:`, storageErr);
      }
    }

    // Delete record in database (cascades versions as well)
    await prisma.file.delete({
      where: { id: fileId },
    });

    // Log Activity
    await prisma.activityLog.create({
      data: {
        workspaceId: file.workspaceId,
        userId,
        actionType: 'FILE_DELETE',
        targetType: 'FILE',
        targetId: fileId,
        details: JSON.stringify({ name: file.name }),
      },
    });

    return res.status(200).json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('File delete error:', error);
    return res.status(500).json({ error: 'Failed to delete file' });
  }
};
