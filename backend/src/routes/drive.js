const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, ensureTenant } = require('../middlewares/auth');
const { google } = require('googleapis');
const crypto = require('crypto');

const router = express.Router();
const prisma = new PrismaClient();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;

// Helper pour chiffrer/déchiffrer
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// GET /api/drive/auth-url
router.get('/auth-url', requireAuth, ensureTenant, (req, res) => {
  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    state: req.companyId
  });
  res.json({ url });
});

// GET /api/drive/callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const companyId = state;

    const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Créer le dossier CIE_Backup
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const folder = await drive.files.create({
      requestBody: {
        name: 'CIE_Backup',
        mimeType: 'application/vnd.google-apps.folder'
      },
      fields: 'id'
    });

    // Stocker les tokens chiffrés
    await prisma.googleDriveToken.upsert({
      where: { companyId },
      update: {
        refreshToken: encrypt(tokens.refresh_token || ''),
        accessToken: encrypt(tokens.access_token || ''),
        expiresAt: new Date(Date.now() + (tokens.expiry_date || 3600 * 1000)),
        folderId: folder.data.id
      },
      create: {
        companyId,
        refreshToken: encrypt(tokens.refresh_token || ''),
        accessToken: encrypt(tokens.access_token || ''),
        expiresAt: new Date(Date.now() + (tokens.expiry_date || 3600 * 1000)),
        folderId: folder.data.id
      }
    });

    res.redirect(process.env.FRONTEND_URL + '/?drive=connected');
  } catch (err) {
    console.error('Drive callback error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drive/backup
router.post('/backup', requireAuth, ensureTenant, async (req, res) => {
  try {
    const companyId = req.companyId;

    // Récupérer les tokens
    const tokenRecord = await prisma.googleDriveToken.findUnique({
      where: { companyId }
    });
    if (!tokenRecord) {
      return res.status(400).json({ error: 'Drive non connecté' });
    }

    // Récupérer toutes les données de la société
    const [clients, fournisseurs, products, documents, company] = await Promise.all([
      prisma.client.findMany({ where: { companyId } }),
      prisma.fournisseur.findMany({ where: { companyId } }),
      prisma.product.findMany({ where: { companyId } }),
      prisma.document.findMany({ where: { companyId } }),
      prisma.company.findUnique({ where: { id: companyId } })
    ]);

    const backupData = {
      version: '2.0',
      exportDate: new Date().toISOString(),
      company: {
        id: company.id,
        name: company.name,
        settings: company.settings
      },
      clients,
      fournisseurs,
      products,
      documents
    };

    // Configurer OAuth
    const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
    oauth2Client.setCredentials({
      access_token: decrypt(tokenRecord.accessToken),
      refresh_token: decrypt(tokenRecord.refreshToken),
      expiry_date: tokenRecord.expiresAt.getTime()
    });

    // Upload vers Drive
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const json = JSON.stringify(backupData, null, 2);
    const file = await drive.files.create({
      requestBody: {
        name: `CIE_Backup_${new Date().toISOString().slice(0,10)}.json`,
        parents: [tokenRecord.folderId]
      },
      media: {
        mimeType: 'application/json',
        body: Buffer.from(json)
      }
    });

    res.json({ 
      success: true, 
      fileId: file.data.id,
      fileName: file.data.name 
    });

  } catch (err) {
    console.error('Backup error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/drive/backups
router.get('/backups', requireAuth, ensureTenant, async (req, res) => {
  try {
    const companyId = req.companyId;

    const tokenRecord = await prisma.googleDriveToken.findUnique({
      where: { companyId }
    });
    if (!tokenRecord) {
      return res.status(400).json({ error: 'Drive non connecté' });
    }

    const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
    oauth2Client.setCredentials({
      access_token: decrypt(tokenRecord.accessToken),
      refresh_token: decrypt(tokenRecord.refreshToken),
      expiry_date: tokenRecord.expiresAt.getTime()
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const response = await drive.files.list({
      q: `'${tokenRecord.folderId}' in parents and mimeType='application/json'`,
      fields: 'files(id, name, createdTime, size)',
      orderBy: 'createdTime desc'
    });

    res.json(response.data.files || []);
  } catch (err) {
    console.error('List backups error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drive/restore/:fileId
router.post('/restore/:fileId', requireAuth, ensureTenant, async (req, res) => {
  try {
    const { fileId } = req.params;
    const companyId = req.companyId;

    const tokenRecord = await prisma.googleDriveToken.findUnique({
      where: { companyId }
    });
    if (!tokenRecord) {
      return res.status(400).json({ error: 'Drive non connecté' });
    }

    const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
    oauth2Client.setCredentials({
      access_token: decrypt(tokenRecord.accessToken),
      refresh_token: decrypt(tokenRecord.refreshToken),
      expiry_date: tokenRecord.expiresAt.getTime()
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const response = await drive.files.get({
      fileId,
      alt: 'media'
    });

    const backupData = response.data;

    // Restaurer les données dans une transaction
    await prisma.$transaction(async (tx) => {
      // Vider les données existantes de la société
      await tx.document.deleteMany({ where: { companyId } });
      await tx.product.deleteMany({ where: { companyId } });
      await tx.fournisseur.deleteMany({ where: { companyId } });
      await tx.client.deleteMany({ where: { companyId } });

      // Restaurer les clients
      for (const c of backupData.clients || []) {
        await tx.client.create({
          data: {
            id: c.id,
            companyId,
            nom: c.nom,
            type: c.type,
            ice: c.ice,
            rc: c.rc,
            ifNum: c.ifNum,
            cnss: c.cnss,
            tel: c.tel,
            email: c.email,
            adresse: c.adresse,
            ville: c.ville,
            createdAt: new Date(c.createdAt)
          }
        });
      }

      // Restaurer les fournisseurs
      for (const f of backupData.fournisseurs || []) {
        await tx.fournisseur.create({
          data: {
            id: f.id,
            companyId,
            nom: f.nom,
            type: f.type,
            ice: f.ice,
            rc: f.rc,
            ifNum: f.ifNum,
            cnss: f.cnss,
            tel: f.tel,
            email: f.email,
            adresse: f.adresse,
            ville: f.ville,
            createdAt: new Date(f.createdAt)
          }
        });
      }

      // Restaurer les produits
      for (const p of backupData.products || []) {
        await tx.product.create({
          data: {
            id: p.id,
            companyId,
            code: p.code,
            designation: p.designation,
            unite: p.unite,
            prixHT: p.prixHT,
            categorie: p.categorie,
            tva: p.tva,
            fournisseurId: p.fournisseurId,
            createdAt: new Date(p.createdAt)
          }
        });
      }

      // Restaurer les documents
      for (const d of backupData.documents || []) {
        await tx.document.create({
          data: {
            id: d.id,
            companyId,
            type: d.type,
            numero: d.numero,
            date: new Date(d.date),
            clientId: d.clientId,
            objet: d.objet,
            tva: d.tva,
            statut: d.statut,
            notes: d.notes,
            lignes: d.lignes,
            createdAt: new Date(d.createdAt)
          }
        });
      }

      // Mettre à jour les paramètres
      if (backupData.company?.settings) {
        await tx.company.update({
          where: { id: companyId },
          data: { settings: backupData.company.settings }
        });
      }
    });

    res.json({ 
      success: true, 
      message: 'Données restaurées avec succès',
      stats: {
        clients: backupData.clients?.length || 0,
        fournisseurs: backupData.fournisseurs?.length || 0,
        products: backupData.products?.length || 0,
        documents: backupData.documents?.length || 0
      }
    });

  } catch (err) {
    console.error('Restore error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/drive/disconnect
router.delete('/disconnect', requireAuth, ensureTenant, async (req, res) => {
  try {
    await prisma.googleDriveToken.delete({
      where: { companyId: req.companyId }
    });
    res.json({ success: true, message: 'Drive déconnecté' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;