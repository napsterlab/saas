const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, ensureTenant } = require('../middlewares/auth');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/migration/import-local
router.post('/import-local', requireAuth, ensureTenant, async (req, res) => {
  try {
    const { clients, products, quotes, invoices, settings } = req.body;
    const companyId = req.companyId;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Mettre à jour les paramètres
      if (settings && Object.keys(settings).length > 0) {
        await tx.company.update({
          where: { id: companyId },
          data: { settings: { ...settings, nom: settings.nom || 'Ma Société' } }
        });
      }

      // 2. Clients
      let clientCount = 0;
      if (clients && clients.length > 0) {
        for (const c of clients) {
          await tx.client.create({
            data: {
              id: c.id,
              companyId,
              nom: c.nom,
              type: c.type || 'Entreprise',
              ice: c.ice || '',
              rc: c.rc || '',
              ifNum: c.ifNum || '',
              cnss: c.cnss || '',
              tel: c.tel || '',
              email: c.email || '',
              adresse: c.adresse || '',
              ville: c.ville || '',
              createdAt: new Date(c.createdAt || Date.now())
            }
          });
          clientCount++;
        }
      }

      // 3. Produits
      let productCount = 0;
      if (products && products.length > 0) {
        for (const p of products) {
          await tx.product.create({
            data: {
              id: p.id,
              companyId,
              code: p.code || 'P' + String(Math.floor(Math.random() * 10000)).padStart(4, '0'),
              designation: p.designation,
              unite: p.unite || 'U',
              prixHT: p.prixHT || 0,
              categorie: p.categorie || 'Autre',
              tva: p.tva || 20,
              createdAt: new Date(p.createdAt || Date.now())
            }
          });
          productCount++;
        }
      }

      // 4. Devis (type: 'devis')
      let quoteCount = 0;
      if (quotes && quotes.length > 0) {
        for (const q of quotes) {
          await tx.document.create({
            data: {
              id: q.id,
              companyId,
              type: 'devis',
              numero: q.numero || 'DEV-' + Date.now(),
              date: new Date(q.date || Date.now()),
              clientId: q.clientId,
              objet: q.objet || '',
              tva: q.tva || 20,
              statut: q.statut || 'en_attente',
              notes: q.notes || '',
              lignes: q.lignes || [],
              createdAt: new Date(q.createdAt || Date.now())
            }
          });
          quoteCount++;
        }
      }

      // 5. Factures (type: 'facture')
      let invoiceCount = 0;
      if (invoices && invoices.length > 0) {
        for (const inv of invoices) {
          await tx.document.create({
            data: {
              id: inv.id,
              companyId,
              type: 'facture',
              numero: inv.numero || 'FAC-' + Date.now(),
              date: new Date(inv.date || Date.now()),
              clientId: inv.clientId,
              objet: inv.objet || '',
              tva: inv.tva || 20,
              statut: inv.statut || 'en_attente',
              notes: inv.notes || '',
              lignes: inv.lignes || [],
              createdAt: new Date(inv.createdAt || Date.now())
            }
          });
          invoiceCount++;
        }
      }

      return { clientCount, productCount, quoteCount, invoiceCount };
    });

    res.json({
      success: true,
      message: 'Migration terminée avec succès',
      stats: result
    });

  } catch (err) {
    console.error('Migration error:', err);
    res.status(500).json({ error: 'Erreur lors de la migration: ' + err.message });
  }
});

module.exports = router;