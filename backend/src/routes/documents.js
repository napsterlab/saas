const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, ensureTenant } = require('../middlewares/auth');
const { validate, documentValidation } = require('../middlewares/validation');

const router = express.Router();
const prisma = new PrismaClient();

router.use(requireAuth, ensureTenant);

// GET /api/documents?type=devis|facture
router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    const where = { companyId: req.companyId };
    if (type) where.type = type;

    const documents = await prisma.document.findMany({
      where,
      include: { client: true },
      orderBy: { date: 'desc' }
    });
    res.json(documents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/documents
router.post('/', validate(documentValidation), async (req, res) => {
  try {
    const { type, numero, date, clientId, objet, tva, statut, notes, lignes } = req.body;

    // Générer un numéro si non fourni
    const docNumero = numero || (type === 'devis' ? 'DEV-' : 'FAC-') + Date.now();

    const document = await prisma.document.create({
      data: {
        companyId: req.companyId,
        type,
        numero: docNumero,
        date: new Date(date || Date.now()),
        clientId,
        objet: objet || '',
        tva: parseInt(tva) || 20,
        statut: statut || 'en_attente',
        notes: notes || '',
        lignes: lignes || []
      },
      include: { client: true }
    });
    res.status(201).json(document);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/documents/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { numero, date, clientId, objet, tva, statut, notes, lignes } = req.body;

    const existing = await prisma.document.findFirst({
      where: { id, companyId: req.companyId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Document non trouvé' });
    }

    const document = await prisma.document.update({
      where: { id },
      data: {
        numero,
        date: new Date(date),
        clientId,
        objet,
        tva: parseInt(tva),
        statut,
        notes,
        lignes
      },
      include: { client: true }
    });
    res.json(document);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.document.findFirst({
      where: { id, companyId: req.companyId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Document non trouvé' });
    }

    await prisma.document.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/documents/:id/convert-to-invoice
router.post('/:id/convert-to-invoice', async (req, res) => {
  try {
    const { id } = req.params;

    const quote = await prisma.document.findFirst({
      where: { id, companyId: req.companyId, type: 'devis' }
    });
    if (!quote) {
      return res.status(404).json({ error: 'Devis non trouvé' });
    }

    // Générer un nouveau numéro de facture
    const year = new Date().getFullYear();
    const count = await prisma.document.count({
      where: { 
        companyId: req.companyId, 
        type: 'facture', 
        date: { gte: new Date(year, 0, 1) } 
      }
    });
    const numero = `FAC/${year}/${String(count + 1).padStart(3, '0')}`;

    const invoice = await prisma.document.update({
      where: { id },
      data: {
        type: 'facture',
        numero: numero,
        statut: 'en_attente',
        updatedAt: new Date()
      },
      include: { client: true }
    });

    res.json(invoice);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/documents/:id/payment
router.post('/:id/payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    const existing = await prisma.document.findFirst({
      where: { id, companyId: req.companyId, type: 'facture' }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Facture non trouvée' });
    }

    const document = await prisma.document.update({
      where: { id },
      data: { statut },
      include: { client: true }
    });
    res.json(document);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;