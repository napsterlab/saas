const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, ensureTenant } = require('../middlewares/auth');
const { validate, productValidation } = require('../middlewares/validation');

const router = express.Router();
const prisma = new PrismaClient();

router.use(requireAuth, ensureTenant);

router.get('/', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { companyId: req.companyId },
      include: { fournisseur: true },
      orderBy: { designation: 'asc' }
    });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', validate(productValidation), async (req, res) => {
  try {
    const { code, designation, unite, prixHT, categorie, tva, fournisseurId } = req.body;
    const product = await prisma.product.create({
      data: {
        companyId: req.companyId,
        code: code || 'P' + String(Math.floor(Math.random() * 10000)).padStart(4, '0'),
        designation,
        unite: unite || 'U',
        prixHT: parseFloat(prixHT) || 0,
        categorie: categorie || 'Autre',
        tva: parseInt(tva) || 20,
        fournisseurId: fournisseurId || null
      },
      include: { fournisseur: true }
    });
    res.status(201).json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', validate(productValidation), async (req, res) => {
  try {
    const { id } = req.params;
    const { code, designation, unite, prixHT, categorie, tva, fournisseurId } = req.body;

    const existing = await prisma.product.findFirst({
      where: { id, companyId: req.companyId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        code,
        designation,
        unite,
        prixHT: parseFloat(prixHT),
        categorie,
        tva: parseInt(tva),
        fournisseurId: fournisseurId || null
      },
      include: { fournisseur: true }
    });
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.product.findFirst({
      where: { id, companyId: req.companyId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    await prisma.product.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;