const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, ensureTenant } = require('../middlewares/auth');
const { validate, clientValidation } = require('../middlewares/validation');

const router = express.Router();
const prisma = new PrismaClient();

router.use(requireAuth, ensureTenant);

router.get('/', async (req, res) => {
  try {
    const clients = await prisma.client.findMany({
      where: { companyId: req.companyId },
      orderBy: { nom: 'asc' }
    });
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', validate(clientValidation), async (req, res) => {
  try {
    const { nom, type, ice, rc, ifNum, cnss, tel, email, adresse, ville } = req.body;
    const client = await prisma.client.create({
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
    res.status(201).json(client);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', validate(clientValidation), async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, type, ice, rc, ifNum, cnss, tel, email, adresse, ville } = req.body;

    const existing = await prisma.client.findFirst({
      where: { id, companyId: req.companyId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }

    const client = await prisma.client.update({
      where: { id },
      data: { nom, type, ice, rc, ifNum, cnss, tel, email, adresse, ville }
    });
    res.json(client);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.client.findFirst({
      where: { id, companyId: req.companyId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }

    await prisma.client.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;