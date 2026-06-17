const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, ensureTenant } = require('../middlewares/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(requireAuth, ensureTenant);

// GET /api/invoice-template
router.get('/', async (req, res) => {
  try {
    let template = await prisma.invoiceTemplate.findUnique({
      where: { companyId: req.companyId }
    });

    if (!template) {
      template = await prisma.invoiceTemplate.create({
        data: {
          companyId: req.companyId,
          config: {
            columns: ['ref', 'designation', 'unite', 'qte', 'prixUHT', 'totalHT', 'tva', 'totalTTC'],
            order: ['ref', 'designation', 'unite', 'qte', 'prixUHT', 'totalHT', 'tva', 'totalTTC'],
            customFields: [],
            logoPosition: 'left',
            numbering: {
              devisPrefix: 'DEV',
              facturePrefix: 'FAC',
              separator: '/',
              padding: 3,
              resetYearly: true
            }
          }
        }
      });
    }

    res.json(template.config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/invoice-template
router.put('/', async (req, res) => {
  try {
    const config = req.body;
    const template = await prisma.invoiceTemplate.upsert({
      where: { companyId: req.companyId },
      update: { config },
      create: {
        companyId: req.companyId,
        config
      }
    });
    res.json(template.config);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;