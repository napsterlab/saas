const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, ensureTenant } = require('../middlewares/auth');
const { validate, fournisseurValidation } = require('../middlewares/validation');

const router = express.Router();
const prisma = new PrismaClient();

router.use(requireAuth, ensureTenant);

router.get('/', async (req, res) => {
  try {
    const fournisseurs = await prisma.fournisseur.findMany({
      where: { companyId: req.companyId },
      include: { products: true },
      orderBy: { nom: 'asc' }
    });
    res.json(fournisseurs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', validate(fournisseurValidation), async (req, res) => {
  try {
    const { nom, type, ice, rc, ifNum, cnss, tel, email, adresse, ville } = req.body;
    const fournisseur = await prisma.fournisseur.create({
      data: {
        companyId: req.companyId,
        nom,
        type: type || 'Entreprise',
        ice: ice || '',
        rc: rc || '',
        ifNum: ifNum || '',
        cnss: cnss || '',
        tel: tel || '',
        email: email || '',
        adresse: adresse || '',
        ville: ville || ''
      }
    });
    res.status(201).json(fournisseur);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', validate(fournisseurValidation), async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, type, ice, rc, ifNum, cnss, tel, email, adresse, ville } = req.body;

    const existing = await prisma.fournisseur.findFirst({
      where: { id, companyId: req.companyId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Fournisseur non trouvé' });
    }

    const fournisseur = await prisma.fournisseur.update({
      where: { id },
      data: { nom, type, ice, rc, ifNum, cnss, tel, email, adresse, ville }
    });
    res.json(fournisseur);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.fournisseur.findFirst({
      where: { id, companyId: req.companyId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Fournisseur non trouvé' });
    }

    await prisma.fournisseur.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;